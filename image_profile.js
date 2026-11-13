"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ImageProfile = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  const MAX_PIXELS = 20000000;
  const MAX_EDGES = 100000;

  function trace(data, width, height, threshold, invert, tolerance, quality = false) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height > MAX_PIXELS || Math.max(width, height) > 8192 ||
        !data || data.length !== width * height * 4) {
      throw new Error("Invalid or oversized raster.");
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255 ||
        !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 3 || typeof quality !== "boolean") {
      throw new Error("Invalid tracing settings.");
    }
    const mask = new Uint8Array(width * height);
    const cutoff = threshold * 10000 * 255;
    for (let i = 0; i < mask.length; i++) {
      const j = i * 4, alpha = data[j + 3];
      // Integer weights avoid misclassifying exact threshold equality.
      const luminance = (2126 * data[j] + 7152 * data[j + 1] + 722 * data[j + 2]) * alpha +
        255 * 10000 * (255 - alpha);
      mask[i] = alpha > 0 && (invert ? luminance > cutoff : luminance <= cutoff);
    }
    const edges = [], outgoing = new Map();
    function add(x1, y1, x2, y2, dir) {
      if (edges.length >= MAX_EDGES) throw new Error("Image has too many outline edges; simplify the image or adjust the threshold.");
      const start = y1 * (width + 1) + x1;
      const end = y2 * (width + 1) + x2;
      const edge = { start, end, dir, used: false };
      edges.push(edge);
      if (!outgoing.has(start)) outgoing.set(start, []);
      outgoing.get(start).push(edge);
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!mask[y * width + x]) continue;
        if (y === 0 || !mask[(y - 1) * width + x]) add(x, y, x + 1, y, 0);
        if (x === width - 1 || !mask[y * width + x + 1]) add(x + 1, y, x + 1, y + 1, 1);
        if (y === height - 1 || !mask[(y + 1) * width + x]) add(x + 1, y + 1, x, y + 1, 2);
        if (x === 0 || !mask[y * width + x - 1]) add(x, y + 1, x, y, 3);
      }
    }
    const loops = [];
    for (const first of edges) {
      if (first.used) continue;
      const points = [];
      let edge = first;
      do {
        edge.used = true;
        points.push([edge.start % (width + 1), Math.floor(edge.start / (width + 1))]);
        if (edge.end === first.start) break;
        const candidates = (outgoing.get(edge.end) || []).filter(candidate => !candidate.used);
        if (!candidates.length) throw new Error("Could not close an outline.");
        candidates.sort((a, b) => ((a.dir - edge.dir + 3) % 4) - ((b.dir - edge.dir + 3) % 4));
        edge = candidates[0];
      } while (true);
      // A boundary can revisit a corner where a hole touches the exterior.
      // Split these pinches rather than exporting a self-touching polyline.
      const active = [], indices = new Map();
      for (const point of points.concat([points[0]])) {
        const key = point[1] * (width + 1) + point[0];
        if (indices.has(key)) {
          const index = indices.get(key);
          if (loops.length >= 512) throw new Error("Image has too many contours; simplify the image or adjust the threshold.");
          loops.push(simplify(active.slice(index), 0));
          for (let i = index + 1; i < active.length; i++) indices.delete(active[i][1] * (width + 1) + active[i][0]);
          active.length = index + 1;
        } else {
          indices.set(key, active.length);
          active.push(point);
        }
      }
    }
    if (quality) return smoothContours(loops, width);
    if (tolerance === 0) return loops;
    const boxes = loops.map(ringBounds);
    return loops.map((loop, i) => {
      const box = boxes[i];
      // Avoid changing nested or touching contours, including holes.
      if (loop.length > 300 || boxes.some((other, j) => j !== i &&
          box.minX <= other.maxX && box.maxX >= other.minX &&
          box.minY <= other.maxY && box.maxY >= other.minY)) return loop;
      const result = simplify(loop, tolerance);
      return isSimple(result) ? result : loop;
    });
  }

  function ringBounds(loop) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of loop) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
  }

  function intersects(a, b, c, d) {
    function cross(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    function on(p, q, r) {
      return r[0] >= Math.min(p[0], q[0]) && r[0] <= Math.max(p[0], q[0]) &&
        r[1] >= Math.min(p[1], q[1]) && r[1] <= Math.max(p[1], q[1]);
    }
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    return (abC === 0 && on(a, b, c)) || (abD === 0 && on(a, b, d)) ||
      (cdA === 0 && on(c, d, a)) || (cdB === 0 && on(c, d, b)) ||
      ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0));
  }

  function isSimple(ring, budget) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      for (let j = i + 1; j < ring.length; j++) {
        if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
        if (budget && --budget.remaining < 0) return false;
        const c = ring[j], d = ring[(j + 1) % ring.length];
        if (intersects(a, b, c, d)) return false;
      }
    }
    return true;
  }

  function smoothContours(loops, width) {
    const boxes = loops.map(ringBounds), result = loops.slice();
    const owners = new Map(), touching = new Uint8Array(loops.length);
    const budget = { remaining: 2000000 };
    loops.forEach((loop, i) => loop.forEach(([x, y]) => {
      const key = y * (width + 1) + x;
      if (owners.has(key) && owners.get(key) !== i) touching[i] = touching[owners.get(key)] = 1;
      else owners.set(key, i);
    }));
    function spans(ring, y, guard) {
      const crossings = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if ((a[1] > y) === (b[1] > y)) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const x = a[0] + (y - a[1]) * dx / dy;
        // Keep a margin around pixel centers for coordinate rounding on export.
        if (guard && Math.abs(x - (Math.round(x - 0.5) + 0.5)) * Math.abs(dy) / Math.hypot(dx, dy) < 0.002) return null;
        crossings.push(x);
      }
      crossings.sort((a, b) => a - b);
      const intervals = [];
      for (let i = 0; i < crossings.length; i += 2) {
        const start = Math.ceil(crossings[i] - 0.5), end = Math.ceil(crossings[i + 1] - 0.5);
        if (start >= end) continue;
        const last = intervals[intervals.length - 1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else intervals.push([start, end]);
      }
      return intervals;
    }
    function samePixels(before, after, box) {
      const cost = (box.maxY - box.minY) * (before.length + after.length);
      budget.remaining -= cost;
      if (budget.remaining < 0) return false;
      for (let y = box.minY + 0.5; y < box.maxY; y++) {
        const a = spans(before, y, false), b = spans(after, y, true);
        if (!b || a.length !== b.length || a.some((span, i) => span[0] !== b[i][0] || span[1] !== b[i][1])) return false;
      }
      return true;
    }
    function separate(candidate, index) {
      const box = boxes[index];
      for (let j = 0; j < result.length; j++) {
        const otherBox = boxes[j], other = result[j];
        if (j === index || box.minX > otherBox.maxX || box.maxX < otherBox.minX ||
            box.minY > otherBox.maxY || box.maxY < otherBox.minY) continue;
        for (let a = 0; a < candidate.length; a++) {
          for (let b = 0; b < other.length; b++) {
            if (--budget.remaining < 0 || intersects(candidate[a], candidate[(a + 1) % candidate.length],
              other[b], other[(b + 1) % other.length])) return false;
          }
        }
      }
      return true;
    }
    for (let i = 0; i < loops.length; i++) {
      const loop = loops[i], box = boxes[i];
      if (touching[i] || loop.length <= 4 || loop.length > 10000 || budget.remaining <= 0) continue;
      // Balance staircase corners by a quarter pixel, retaining extrema and long sharp corners.
      const balanced = loop.map((p, j) => {
        const a = loop[(j + loop.length - 1) % loop.length], b = loop[(j + 1) % loop.length];
        const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
        if (p[0] === box.minX || p[0] === box.maxX || p[1] === box.minY || p[1] === box.maxY || Math.min(da, db) > 1) return p;
        return [p[0] + 0.25 * ((a[0] - p[0]) / da + (b[0] - p[0]) / db),
          p[1] + 0.25 * ((a[1] - p[1]) / da + (b[1] - p[1]) / db)];
      });
      const candidate = simplify(balanced, 0.35, budget), bounds = ringBounds(candidate);
      if (candidate.length > 300 || Object.keys(box).some(key => box[key] !== bounds[key]) ||
          ringArea(candidate) * ringArea(loop) <= 0 || !isSimple(candidate, budget) ||
          !samePixels(loop, candidate, box) || !separate(candidate, i)) continue;
      result[i] = candidate;
    }
    return result;
  }

  function simplify(points, tolerance, budget) {
    const ring = points.filter((p, i) => {
      const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
      return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
    });
    if (tolerance === 0 || ring.length <= 4) return ring;
    let split = 1, max = 0;
    for (let i = 1; i < ring.length; i++) {
      const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
      if (d > max) { max = d; split = i; }
    }
    function reduce(path) {
      const keep = new Uint8Array(path.length);
      keep[0] = keep[path.length - 1] = 1;
      const stack = [[0, path.length - 1]];
      while (stack.length) {
        const [start, end] = stack.pop(), a = path[start], b = path[end];
        const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
        let best = tolerance * tolerance, index = -1;
        for (let i = start + 1; i < end; i++) {
          if (budget && --budget.remaining < 0) return null;
          const t = length2 ? Math.max(0, Math.min(1, ((path[i][0] - a[0]) * dx + (path[i][1] - a[1]) * dy) / length2)) : 0;
          const d = (path[i][0] - a[0] - t * dx) ** 2 + (path[i][1] - a[1] - t * dy) ** 2;
          if (d > best) { best = d; index = i; }
        }
        if (index !== -1) { keep[index] = 1; stack.push([start, index], [index, end]); }
      }
      return path.filter((_, i) => keep[i]);
    }
    const first = reduce(ring.slice(0, split + 1));
    if (!first) return ring;
    const second = reduce(ring.slice(split).concat([ring[0]]));
    if (!second) return ring;
    const result = first.slice(0, -1).concat(second.slice(0, -1));
    const area = ringArea(result);
    return result.length >= 3 && area * ringArea(ring) > 0 ? result : ring;
  }

  function ringArea(ring) {
    return ring.reduce((sum, p, i) => {
      const next = ring[(i + 1) % ring.length];
      return sum + p[0] * next[1] - next[0] * p[1];
    }, 0);
  }

  function geometry(loops, rasterWidth, rasterHeight, width, height, frame) {
    if (![rasterWidth, rasterHeight, width, height].every(Number.isFinite) ||
        rasterWidth <= 0 || rasterHeight <= 0 || width < 0.1 || height < 0.1 || width > 10000 || height > 10000) {
      throw new Error("Image dimensions must be between 0.1 and 10000 mm.");
    }
    if (frame && (!Number.isFinite(frame.width) || !Number.isFinite(frame.height) ||
        frame.width < width || frame.height < height || frame.width > 10000 || frame.height > 10000)) {
      throw new Error("Frame dimensions must enclose the image and be at most 10000 mm.");
    }
    function point(x, y) { return [Number(x.toFixed(8)), Number(y.toFixed(8))]; }
    const paths = loops.map(loop => loop.map(([x, y]) => point(x * width / rasterWidth, (rasterHeight - y) * height / rasterHeight)));
    if (frame) {
      const x = (width - frame.width) / 2, y = (height - frame.height) / 2;
      paths.push([point(x, y), point(x + frame.width, y), point(x + frame.width, y + frame.height), point(x, y + frame.height)]);
    }
    return paths;
  }

  function dxf(paths, closedPaths = paths.map(() => true)) {
    if (!Array.isArray(closedPaths) || closedPaths.length !== paths.length || closedPaths.some(value => typeof value !== "boolean")) {
      throw new Error("DXF closure flags must match the exported paths.");
    }
    let nextHandle = 1;
    const handle = () => (nextHandle++).toString(16).toUpperCase();
    const tableNames = ["VPORT", "LTYPE", "LAYER", "STYLE", "VIEW", "UCS", "APPID", "DIMSTYLE", "BLOCK_RECORD"];
    const tableHandles = new Map(tableNames.map(name => [name, handle()]));
    const model = handle(), paper = handle();
    const root = handle(), groups = handle(), layouts = handle();
    const modelLayout = handle(), paperLayout = handle();
    const tables = [], blocks = [], entities = [], objects = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of paths) {
      for (const [x, y] of path) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    if (!paths.length) minX = minY = maxX = maxY = 0;
    const viewHeight = Math.max(1, maxY - minY), viewWidth = Math.max(1, maxX - minX);
    function record(type, owner, subclass, ...tags) {
      return [0, type, 5, handle(), 330, owner, 100, "AcDbSymbolTableRecord", 100, subclass, ...tags];
    }
    function table(name, records) {
      tables.push(0, "TABLE", 2, name, 5, tableHandles.get(name), 330, "0", 100, "AcDbSymbolTable", 70, records.length);
      if (name === "DIMSTYLE") tables.push(100, "AcDbDimStyleTable");
      for (const entry of records) tables.push(...entry);
      tables.push(0, "ENDTAB");
    }
    table("VPORT", [record("VPORT", tableHandles.get("VPORT"), "AcDbViewportTableRecord",
      2, "*Active", 70, 0, 10, 0, 20, 0, 11, 1, 21, 1,
      12, (minX + maxX) / 2, 22, (minY + maxY) / 2, 13, 0, 23, 0,
      14, 0.5, 24, 0.5, 15, 0.5, 25, 0.5, 16, 0, 26, 0, 36, 1,
      17, 0, 27, 0, 37, 0, 40, viewHeight, 41, viewWidth / viewHeight,
      42, 50, 43, 0, 44, 0, 50, 0, 51, 0, 71, 0, 72, 1000, 73, 1, 74, 3,
      75, 0, 76, 0, 77, 0, 78, 0, 281, 0, 65, 0, 146, 0)]);
    table("LTYPE", ["ByBlock", "ByLayer", "Continuous"].map(name =>
      record("LTYPE", tableHandles.get("LTYPE"), "AcDbLinetypeTableRecord", 2, name, 70, 0, 3, "", 72, 65, 73, 0, 40, 0)));
    table("LAYER", [record("LAYER", tableHandles.get("LAYER"), "AcDbLayerTableRecord", 2, "0", 70, 0, 62, 7, 6, "Continuous")]);
    table("STYLE", [record("STYLE", tableHandles.get("STYLE"), "AcDbTextStyleTableRecord",
      2, "Standard", 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, "txt", 4, "")]);
    table("VIEW", []);
    table("UCS", []);
    table("APPID", [record("APPID", tableHandles.get("APPID"), "AcDbRegAppTableRecord", 2, "ACAD", 70, 0)]);
    table("DIMSTYLE", []);
    // Pair layout/block-record references; entities belong to model space.
    table("BLOCK_RECORD", [
      [0, "BLOCK_RECORD", 5, model, 330, tableHandles.get("BLOCK_RECORD"), 100, "AcDbSymbolTableRecord", 100, "AcDbBlockTableRecord", 2, "*Model_Space", 340, modelLayout],
      [0, "BLOCK_RECORD", 5, paper, 330, tableHandles.get("BLOCK_RECORD"), 100, "AcDbSymbolTableRecord", 100, "AcDbBlockTableRecord", 2, "*Paper_Space", 340, paperLayout]
    ]);
    for (const [name, owner] of [["*Model_Space", model], ["*Paper_Space", paper]]) {
      blocks.push(0, "BLOCK", 5, handle(), 330, owner, 100, "AcDbEntity", 8, "0", 100, "AcDbBlockBegin",
        2, name, 70, 0, 10, 0, 20, 0, 30, 0, 3, name, 1, "",
        0, "ENDBLK", 5, handle(), 330, owner, 100, "AcDbEntity", 8, "0", 100, "AcDbBlockEnd");
    }
    for (const [index, path] of paths.entries()) {
      entities.push(0, "LWPOLYLINE", 5, handle(), 330, model, 100, "AcDbEntity", 8, "0", 100, "AcDbPolyline", 90, path.length, 70, closedPaths[index] ? 1 : 0);
      for (const [x, y] of path) entities.push(10, Number(x.toFixed(8)), 20, Number(y.toFixed(8)));
    }
    objects.push(0, "DICTIONARY", 5, root, 330, "0", 100, "AcDbDictionary", 281, 1,
      3, "ACAD_GROUP", 350, groups, 3, "ACAD_LAYOUT", 350, layouts,
      0, "DICTIONARY", 5, groups, 330, root, 100, "AcDbDictionary", 281, 1,
      0, "DICTIONARY", 5, layouts, 330, root, 100, "AcDbDictionary", 281, 1,
      3, "Model", 350, modelLayout, 3, "Layout1", 350, paperLayout);
    for (const [name, id, owner, index] of [["Model", modelLayout, model, 0], ["Layout1", paperLayout, paper, 1]]) {
      objects.push(0, "LAYOUT", 5, id, 330, layouts, 100, "AcDbPlotSettings",
        1, "", 4, "", 6, "", 40, 0, 41, 0, 42, 0, 43, 0, 44, 420, 45, 297,
        46, 0, 47, 0, 48, 0, 49, 0, 140, 0, 141, 0, 142, 1, 143, 1,
        70, index === 0 ? 1024 : 0, 72, 1, 73, 0, 74, 5, 7, "", 75, 16,
        76, 0, 77, 2, 78, 300, 147, 1, 148, 0, 149, 0,
        100, "AcDbLayout", 1, name, 70, 1, 71, index, 10, minX, 20, minY, 11, maxX, 21, maxY,
        12, 0, 22, 0, 32, 0, 14, minX, 24, minY, 34, 0, 15, maxX, 25, maxY, 35, 0,
        146, 0, 13, 0, 23, 0, 33, 0, 16, 1, 26, 0, 36, 0, 17, 0, 27, 1, 37, 0, 76, 1, 330, owner);
    }
    const header = [9, "$ACADVER", 1, "AC1015", 9, "$DWGCODEPAGE", 3, "ANSI_1252",
      9, "$HANDSEED", 5, handle(), 9, "$INSUNITS", 70, 4, 9, "$MEASUREMENT", 70, 1,
      9, "$INSBASE", 10, 0, 20, 0, 30, 0,
      9, "$EXTMIN", 10, minX, 20, minY, 30, 0, 9, "$EXTMAX", 10, maxX, 20, maxY, 30, 0];
    const lines = [];
    for (const [name, content] of [["HEADER", header], ["TABLES", tables], ["BLOCKS", blocks], ["ENTITIES", entities], ["OBJECTS", objects]]) {
      lines.push(0, "SECTION", 2, name);
      for (const tag of content) lines.push(tag);
      lines.push(0, "ENDSEC");
    }
    lines.push(0, "EOF", "");
    return lines.join("\r\n");
  }
  function dxfFilename(value) {
    const stem = value.trim().replace(/[. ]+$/, "")
      .replace(/(?:\.dxf[. ]*)+$/i, "").trim().replace(/[. ]+$/, "") || "image-profile";
    if (/[<>:"/\\|?*\x00-\x1f]/.test(stem) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(stem)) {
      throw new Error("Choose a file name without reserved characters or device names.");
    }
    return stem + ".dxf";
  }
  return { trace, geometry, dxf, dxfFilename, version: "1.6.1" };
});
