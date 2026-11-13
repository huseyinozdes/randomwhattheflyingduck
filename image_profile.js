"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ImageProfile = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  const MAX_PIXELS = 20000000;
  const MAX_EDGES = 100000;

  function trace(data, width, height, threshold, invert, tolerance) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height > MAX_PIXELS || Math.max(width, height) > 8192 ||
        !data || data.length !== width * height * 4) {
      throw new Error("Invalid or oversized raster.");
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255 ||
        !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 3) {
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
    if (tolerance === 0) return loops;
    const boxes = loops.map(loop => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of loop) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      return { minX, minY, maxX, maxY };
    });
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

  function isSimple(ring) {
    function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    function on(a, b, c) {
      return c[0] >= Math.min(a[0], b[0]) && c[0] <= Math.max(a[0], b[0]) &&
        c[1] >= Math.min(a[1], b[1]) && c[1] <= Math.max(a[1], b[1]);
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      for (let j = i + 1; j < ring.length; j++) {
        if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
        const c = ring[j], d = ring[(j + 1) % ring.length];
        const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
        if ((abC === 0 && on(a, b, c)) || (abD === 0 && on(a, b, d)) ||
            (cdA === 0 && on(c, d, a)) || (cdB === 0 && on(c, d, b)) ||
            ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0))) return false;
      }
    }
    return true;
  }

  function simplify(points, tolerance) {
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
          const t = length2 ? Math.max(0, Math.min(1, ((path[i][0] - a[0]) * dx + (path[i][1] - a[1]) * dy) / length2)) : 0;
          const d = (path[i][0] - a[0] - t * dx) ** 2 + (path[i][1] - a[1] - t * dy) ** 2;
          if (d > best) { best = d; index = i; }
        }
        if (index !== -1) { keep[index] = 1; stack.push([start, index], [index, end]); }
      }
      return path.filter((_, i) => keep[i]);
    }
    const result = reduce(ring.slice(0, split + 1)).slice(0, -1)
      .concat(reduce(ring.slice(split).concat([ring[0]])).slice(0, -1));
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
    function point(x, y) { return [Number(x.toFixed(5)), Number(y.toFixed(5))]; }
    const paths = loops.map(loop => loop.map(([x, y]) => point(x * width / rasterWidth, (rasterHeight - y) * height / rasterHeight)));
    if (frame) {
      const x = (width - frame.width) / 2, y = (height - frame.height) / 2;
      paths.push([point(x, y), point(x + frame.width, y), point(x + frame.width, y + frame.height), point(x, y + frame.height)]);
    }
    return paths;
  }

  function dxf(paths) {
    const lines = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
    for (const path of paths) {
      lines.push("0", "LWPOLYLINE", "100", "AcDbEntity", "8", "0", "100", "AcDbPolyline", "90", String(path.length), "70", "1");
      for (const [x, y] of path) lines.push("10", String(Number(x.toFixed(5))), "20", String(Number(y.toFixed(5))));
    }
    lines.push("0", "ENDSEC", "0", "EOF", "");
    return lines.join("\r\n");
  }
  return { trace, geometry, dxf };
});
