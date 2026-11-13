"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("pdf-lib"));
  else root.AiProfile = factory(root.PDFLib);
})(typeof globalThis !== "undefined" ? globalThis : this, function (PDF) {
  const version = "1.6.0", tolerance = 0.01;
  const MAX_BYTES = 10 * 1024 * 1024, MAX_DECODED = 16 * 1024 * 1024, MAX_POINTS = 100000;
  const name = key => PDF.PDFName.of(key);
  const get = (dict, key) => dict instanceof PDF.PDFDict ? dict.lookup(name(key)) : undefined;
  const named = value => value instanceof PDF.PDFName ? value.decodeText() : "";
  const fail = message => { throw new Error(message); };
  function number(value) {
    const result = value instanceof PDF.PDFNumber ? value.asNumber() : value;
    if (!Number.isFinite(result)) fail("Invalid numeric geometry in AI/PDF.");
    return result;
  }
  function array(value, length) {
    if (!(value instanceof PDF.PDFArray) || value.size() !== length) fail("Invalid AI/PDF geometry array.");
    return value.asArray().map(item => number(value.context.lookup(item)));
  }
  function multiply(a, b) {
    return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  }
  function transform(matrix, x, y) {
    const point = [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
    if (!point.every(v => Number.isFinite(v) && Math.abs(v) <= 10000)) fail("AI geometry exceeds the 10000 mm coordinate limit.");
    return point;
  }
  const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
  const area = points => points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  function inside(point, polygon) {
    const sign = Math.sign(area(polygon));
    return sign !== 0 && polygon.every((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return sign * cross(a, b, point) >= -1e-8 * Math.hypot(b[0] - a[0], b[1] - a[1]);
    });
  }
  function rectangle(matrix, values) {
    const [x0, y0, x1, y1] = values;
    if (x1 <= x0 || y1 <= y0) fail("Invalid AI/PDF bounding box.");
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => transform(matrix, x, y));
  }

  // This is a strict PDF content lexer, not a PostScript interpreter. Unknown operators fail closed.
  function* tokens(text) {
    let i = 0, count = 0;
    const space = c => c !== undefined && /[\x00\t\n\f\r ]/.test(c);
    const delimiter = c => c === undefined || space(c) || /[()[\]<>/{%}]/.test(c);
    function read(depth = 0) {
      if (depth > 32 || ++count > 500000) fail("AI content is too complex.");
      while (i < text.length) {
        if (space(text[i])) { i++; continue; }
        if (text[i] === "%") { while (i < text.length && !/[\r\n]/.test(text[i])) i++; continue; }
        break;
      }
      if (i >= text.length) return undefined;
      const c = text[i++];
      if (c === "[") {
        const values = [];
        while (true) {
          const value = read(depth + 1);
          if (value === undefined) fail("Unterminated AI/PDF array.");
          if (value.end === "]") return values;
          values.push(value);
        }
      }
      if (c === "]") return { end: "]" };
      if (c === "(") {
        let nesting = 1;
        while (i < text.length && nesting) {
          const next = text[i++];
          if (next === "\\") { if (i < text.length) i++; }
          else if (next === "(") nesting++;
          else if (next === ")") nesting--;
        }
        if (nesting) fail("Unterminated AI/PDF string.");
        return { string: true };
      }
      if (c === "<") {
        if (text[i] === "<") {
          i++;
          while (true) {
            const item = read(depth + 1);
            if (item === undefined) fail("Unterminated AI/PDF dictionary.");
            if (item.end === ">>") return { dictionary: true };
          }
        }
        while (i < text.length && text[i] !== ">") {
          if (!/[0-9a-fA-F\s]/.test(text[i++])) fail("Invalid AI/PDF hex string.");
        }
        if (text[i++] !== ">") fail("Unterminated AI/PDF hex string.");
        return { string: true };
      }
      if (c === ">" && text[i++] === ">") return { end: ">>" };
      if (c === "/") {
        const start = i;
        while (!delimiter(text[i])) i++;
        return { name: text.slice(start, i).replace(/#([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))) };
      }
      if (delimiter(c)) fail("Unsupported AI/PDF content syntax.");
      const start = i - 1;
      while (!delimiter(text[i])) i++;
      const word = text.slice(start, i);
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) return number(Number(word));
      return { operator: word };
    }
    while (i < text.length) {
      const token = read();
      if (token !== undefined) yield token;
    }
  }

  async function convert(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_BYTES) fail("AI input must be at most 10 MiB.");
    const header = String.fromCharCode(...bytes.subarray(0, 16));
    if (!header.startsWith("%PDF-")) {
      fail("Only PDF-compatible AI files are supported, not legacy PostScript/EPS or private AI data. Re-save in Illustrator with Create PDF Compatible File enabled.");
    }
    let doc;
    try {
      doc = await PDF.PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    } catch (error) {
      // pdf-lib's ES5 Error subclasses do not retain instanceof identity.
      if (error.message === new PDF.EncryptedPDFError().message) fail("Encrypted/password-protected AI content is unsupported. Save an unencrypted copy.");
      throw error;
    }
    if (doc.getPageCount() !== 1) fail("Multiple artboards/pages are not supported. Save a copy containing one artboard.");
    if (get(doc.catalog, "OCProperties") !== undefined) fail("Optional/hidden layers are unsupported. Flatten layer visibility first.");
    const page = doc.getPage(0), context = doc.context;
    if (page.node.Annots()?.size()) fail("Annotations are unsupported. Remove them before converting.");
    const crop = page.getCropBox(), media = page.getMediaBox();
    const x0 = Math.max(crop.x, media.x), y0 = Math.max(crop.y, media.y);
    const width = Math.min(crop.x + crop.width, media.x + media.width) - x0;
    const height = Math.min(crop.y + crop.height, media.y + media.height) - y0;
    const unitValue = get(page.node, "UserUnit");
    const unit = unitValue === undefined ? 1 : number(unitValue), scale = unit * 25.4 / 72;
    if (!(unit > 0 && width > 0 && height > 0)) fail("Invalid AI artboard dimensions or units.");
    const rotation = ((number(page.getRotation().angle) % 360) + 360) % 360;
    const rotations = {
      0: [1, 0, 0, 1, 0, 0], 90: [0, -1, 1, 0, 0, width],
      180: [-1, 0, 0, -1, width, height], 270: [0, 1, -1, 0, height, 0],
    };
    if (!rotations[rotation]) fail("Unsupported artboard rotation.");
    const matrix = multiply([scale, 0, 0, scale, 0, 0],
      multiply(rotations[rotation], [1, 0, 0, 1, -x0, -y0]));
    const clip = rectangle(matrix, [x0, y0, x0 + width, y0 + height]);
    const paths = [], closed = [], activeForms = new Set();
    let decoded = 0, points = 0, operations = 0;
    function decode(stream) {
      if (!(stream instanceof PDF.PDFRawStream) || get(stream.dict, "F")) fail("Unsupported external or invalid AI content stream.");
      const decoder = PDF.decodePDFRawStream(stream);
      let text = "", data;
      while ((data = decoder.getBytes(65536)).length) {
        decoded += data.length;
        if (decoded > MAX_DECODED) fail("Decoded AI content exceeds 16 MiB.");
        for (let i = 0; i < data.length; i += 8192) text += String.fromCharCode(...data.subarray(i, i + 8192));
      }
      return text;
    }
    function resource(resources, category, key) {
      const dict = get(resources, category);
      if (dict instanceof PDF.PDFDict) {
        for (const [entry, value] of dict.entries()) if (entry.decodeText() === key) return context.lookup(value);
      }
      fail("Missing AI/PDF resource: " + category + "/" + key);
    }
    function group(dict) {
      const value = get(dict, "Group");
      if (value === undefined) return;
      if (!(value instanceof PDF.PDFDict) || named(get(value, "S")) !== "Transparency" ||
          (get(value, "K") !== undefined && get(value, "K") !== PDF.PDFBool.False)) {
        fail("Unsupported transparency/knockout group. Expand the artwork first.");
      }
    }
    function graphicsState(dict) {
      if (!(dict instanceof PDF.PDFDict)) fail("Invalid AI graphics state.");
      const allowed = new Set(["Type", "LW", "LC", "LJ", "ML", "D", "RI", "OP", "op", "OPM", "SA", "SM", "CA", "ca", "BM", "SMask", "AIS", "TK"]);
      for (const [key, raw] of dict.entries()) {
        const field = key.decodeText(), value = context.lookup(raw);
        if (!allowed.has(field)) fail("Unsupported graphics-state effect: " + field);
        if (["LW", "LC", "LJ", "ML", "OPM", "SM"].includes(field)) number(value);
        if (["OP", "op", "SA", "AIS", "TK"].includes(field) && !(value instanceof PDF.PDFBool)) fail("Invalid boolean AI graphics state.");
        if (field === "RI" && !(value instanceof PDF.PDFName)) fail("Invalid AI rendering intent.");
        if (field === "Type" && named(value) !== "ExtGState") fail("Invalid AI graphics state type.");
        if ((field === "CA" || field === "ca") && number(value) !== 1) fail("Transparency is unsupported. Expand the artwork first.");
        if (field === "BM" && !["Normal", "Compatible"].includes(named(value))) fail("Blend modes are unsupported.");
        if (field === "SMask" && named(value) !== "None") fail("Soft masks are unsupported.");
        if (field === "D" && (!(value instanceof PDF.PDFArray) || value.size() !== 2 ||
            !(value.lookup(0) instanceof PDF.PDFArray) || value.lookup(0).size() || number(value.lookup(1)) < 0)) {
          fail("Dashed strokes are unsupported. Outline/expand strokes first.");
        }
      }
    }
    function run(text, resources, initial, depth = 0) {
      if (depth > 16) fail("AI form nesting exceeds the limit.");
      if (initial.clips.length > 32) fail("AI clipping nesting exceeds the limit.");
      let state = { matrix: initial.matrix.slice(), clips: initial.clips.slice() };
      let current = null, currentPoint = null, subpaths = [], pendingClip = false, marks = 0, compatibility = 0;
      const stack = [], args = [];
      const numbers = count => {
        if (args.length !== count || !args.every(v => typeof v === "number" && Number.isFinite(v))) fail("Invalid path operands.");
        return args;
      };
      const oneName = () => {
        if (args.length !== 1 || typeof args[0]?.name !== "string") fail("Invalid named AI/PDF operand.");
        return args[0].name;
      };
      function start(point) {
        current = { points: [point], controls: [point], closed: false, curved: false };
        subpaths.push(current); currentPoint = point;
        if (++points > MAX_POINTS) fail("AI geometry exceeds 100000 vertices.");
      }
      function append(point) {
        if (!currentPoint) fail("AI path has no starting point.");
        if (!current) start(currentPoint);
        if (!equal(currentPoint, point)) {
          current.points.push(point);
          if (++points > MAX_POINTS) fail("AI geometry exceeds 100000 vertices.");
        }
        currentPoint = point;
      }
      function close() {
        if (!currentPoint) fail("AI path has no starting point.");
        if (current) { current.closed = true; currentPoint = current.points[0]; current = null; }
      }
      function curve(a, b, end) {
        if (!currentPoint) fail("AI curve has no starting point.");
        if (!current) start(currentPoint);
        current.curved = true;
        current.controls.push(a, b, end);
        const distance = (p, a0, b0) => {
          const dx = b0[0] - a0[0], dy = b0[1] - a0[1], length = dx * dx + dy * dy;
          const t = length ? Math.max(0, Math.min(1, ((p[0] - a0[0]) * dx + (p[1] - a0[1]) * dy) / length)) : 0;
          return Math.hypot(p[0] - a0[0] - t * dx, p[1] - a0[1] - t * dy);
        };
        const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        function split(p0, p1, p2, p3, level) {
          if (Math.max(distance(p1, p0, p3), distance(p2, p0, p3)) <= tolerance) { append(p3); return; }
          if (level >= 20) fail("AI curve exceeds the approximation limit.");
          const a0 = mid(p0, p1), b0 = mid(p1, p2), c0 = mid(p2, p3), d0 = mid(a0, b0), e0 = mid(b0, c0), f0 = mid(d0, e0);
          split(p0, a0, d0, f0, level + 1); split(f0, e0, c0, p3, level + 1);
        }
        split(currentPoint, a, b, end, 0);
      }
      function paint(operator) {
        const fill = /[fFbB]/.test(operator);
        if (["s", "b", "b*"].includes(operator)) close();
        if (operator !== "n") {
          for (const path of subpaths) {
            if (path.controls.some(p => state.clips.some(polygon => !inside(p, polygon)))) {
              fail("Artwork intersects a clipping boundary. Prepare unclipped paths inside the artboard before converting.");
            }
            const isClosed = fill || path.closed;
            let output = path.points.map(p => p.map(v => Number(v.toFixed(8))));
            if (output.length > 1 && equal(output[0], output[output.length - 1])) {
              if (!equal(path.points[0], path.points[path.points.length - 1])) fail("AI geometry is finer than DXF export precision.");
              output = output.slice(0, -1);
              // A stroked path returning to its start is geometrically closed, even without h.
              path.closed = true;
            }
            if (output.length < (isClosed || path.closed ? 3 : 2) ||
                output.some((p, i) => i > 0 && equal(p, output[i - 1])) ||
                ((isClosed || path.closed) && Math.abs(area(output)) < 1e-12)) {
              fail("Degenerate geometry cannot be represented safely as DXF polylines.");
            }
            paths.push(output); closed.push(isClosed || path.closed);
            if (paths.length > 512) fail("AI artwork exceeds 512 paths.");
          }
        }
        if (pendingClip) {
          if (subpaths.length !== 1 || subpaths[0].points.length > 64) fail("Complex clipping paths are unsupported.");
          const polygon = subpaths[0].points.slice();
          if (polygon.length > 1 && equal(polygon[0], polygon[polygon.length - 1])) polygon.pop();
          if (polygon.length < 3 || new Set(polygon.map(p => p.join(","))).size !== polygon.length ||
              !polygon.every(p => inside(p, polygon)) ||
              subpaths[0].curved) fail("Curved or non-convex clipping paths are unsupported.");
          state.clips.push(polygon.slice());
          if (state.clips.length > 32) fail("AI clipping nesting exceeds the limit.");
        }
        current = currentPoint = null; subpaths = []; pendingClip = false;
      }
      for (const token of tokens(text)) {
        if (!token?.operator) { args.push(token); continue; }
        if (++operations > 100000) fail("AI content exceeds 100000 operations.");
        const op = token.operator;
        if (op === "q") {
          numbers(0); stack.push({ matrix: state.matrix.slice(), clips: state.clips.slice() });
          if (stack.length > 64) fail("AI graphics-state nesting exceeds the limit.");
        } else if (op === "Q") {
          numbers(0); if (!stack.length) fail("Unbalanced AI graphics state."); state = stack.pop();
        } else if (op === "cm") {
          state.matrix = multiply(state.matrix, numbers(6));
          if (!state.matrix.every(Number.isFinite) || state.matrix[0] * state.matrix[3] === state.matrix[1] * state.matrix[2]) fail("Invalid or singular AI transform.");
        } else if (op === "m") {
          numbers(2); start(transform(state.matrix, ...args));
        } else if (op === "l") {
          numbers(2); const point = transform(state.matrix, ...args); append(point); current.controls.push(point);
        } else if (op === "c") {
          numbers(6); curve(transform(state.matrix, args[0], args[1]), transform(state.matrix, args[2], args[3]), transform(state.matrix, args[4], args[5]));
        } else if (op === "v") {
          numbers(4); curve(currentPoint, transform(state.matrix, args[0], args[1]), transform(state.matrix, args[2], args[3]));
        } else if (op === "y") {
          numbers(4); const end = transform(state.matrix, args[2], args[3]); curve(transform(state.matrix, args[0], args[1]), end, end);
        } else if (op === "h") {
          numbers(0); close();
        } else if (op === "re") {
          numbers(4); const [x, y, w, h] = args;
          start(transform(state.matrix, x, y));
          for (const p of [[x + w, y], [x + w, y + h], [x, y + h]]) {
            const point = transform(state.matrix, ...p); append(point); current.controls.push(point);
          }
          close();
        } else if (["W", "W*"].includes(op)) {
          numbers(0); if (pendingClip) fail("Repeated AI clipping operation."); pendingClip = true;
        } else if (["S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "n"].includes(op)) {
          numbers(0); paint(op);
        } else if (op === "Do") {
          const form = resource(resources, "XObject", oneName());
          if (!(form instanceof PDF.PDFRawStream) || named(get(form.dict, "Subtype")) !== "Form") fail("Raster images and non-vector objects are unsupported. Trace or remove them in Illustrator first.");
          if (get(form.dict, "Ref") || get(form.dict, "OPI")) fail("Externally referenced artwork is unsupported.");
          if (get(form.dict, "OC") !== undefined) fail("Optional/hidden form artwork is unsupported. Flatten layer visibility first.");
          if (activeForms.has(form)) fail("Recursive AI form references are unsupported.");
          group(form.dict);
          const ownMatrix = get(form.dict, "Matrix");
          const formMatrix = multiply(state.matrix, ownMatrix === undefined ? [1, 0, 0, 1, 0, 0] : array(ownMatrix, 6));
          const box = rectangle(formMatrix, array(get(form.dict, "BBox"), 4));
          activeForms.add(form);
          run(decode(form), get(form.dict, "Resources") || resources, { matrix: formMatrix, clips: state.clips.concat([box]) }, depth + 1);
          activeForms.delete(form);
        } else if (op === "gs") {
          graphicsState(resource(resources, "ExtGState", oneName()));
        } else if (["g", "G", "rg", "RG", "k", "K"].includes(op)) {
          numbers(op.length === 1 && op.toLowerCase() === "g" ? 1 : op.toLowerCase() === "rg" ? 3 : 4);
        } else if (["cs", "CS"].includes(op)) {
          const color = oneName();
          const value = ["DeviceGray", "DeviceRGB", "DeviceCMYK", "Pattern"].includes(color) ? name(color) : resource(resources, "ColorSpace", color);
          const kind = named(value instanceof PDF.PDFArray ? value.lookup(0) : value);
          if (!["DeviceGray", "DeviceRGB", "DeviceCMYK", "CalGray", "CalRGB", "Lab", "ICCBased", "Indexed", "Separation", "DeviceN"].includes(kind)) fail("Pattern or unsupported color-space content cannot be converted.");
          if ((kind === "Separation" && named(value.lookup(1)) === "None") ||
              (kind === "DeviceN" && (!(value.lookup(1) instanceof PDF.PDFArray) ||
                value.lookup(1).asArray().some(v => named(context.lookup(v)) === "None")))) {
            fail("Invisible None colorants are unsupported. Remove invisible artwork first.");
          }
        } else if (["sc", "SC", "scn", "SCN"].includes(op)) {
          if (!args.length || !args.every(v => typeof v === "number" && Number.isFinite(v))) fail("Pattern fills are unsupported.");
        } else if (["w", "J", "j", "M", "i"].includes(op)) {
          numbers(1);
        } else if (op === "ri") {
          oneName();
        } else if (op === "d") {
          if (args.length !== 2 || !Array.isArray(args[0]) || args[0].length || typeof args[1] !== "number") fail("Dashed strokes are unsupported. Outline/expand strokes first.");
        } else if (op === "BMC") {
          if (oneName() === "OC") fail("Optional/hidden layers are unsupported. Flatten layer visibility first.");
          marks++;
        } else if (op === "EMC") {
          numbers(0); if (--marks < 0) fail("Unbalanced AI marked content.");
        } else if (op === "BX" || op === "EX") {
          numbers(0); compatibility += op === "BX" ? 1 : -1;
          if (compatibility < 0) fail("Unbalanced AI compatibility section.");
        } else if (op === "MP") {
          oneName();
        } else if (op === "BT" || op === "ET" || /^T/.test(op) || op === "'" || op === "\"") {
          fail("Live text or a non-PDF-compatible AI placeholder is unsupported. Enable Create PDF Compatible File and convert text to outlines in Illustrator.");
        } else {
          fail("Unsupported AI/PDF operator " + op + " (for example images, gradients or optional content). Expand the artwork to plain vector paths first.");
        }
        args.length = 0;
      }
      if (args.length || stack.length || subpaths.length || pendingClip || marks || compatibility) fail("Incomplete or unbalanced AI content; no DXF was produced.");
    }
    group(page.node);
    const content = page.node.Contents();
    let text = "";
    if (content instanceof PDF.PDFArray) {
      for (const entry of content.asArray()) text += decode(context.lookup(entry));
    } else if (content !== undefined) text = decode(content);
    run(text, page.node.Resources(), { matrix, clips: [clip] });
    if (!paths.length) fail("No painted vector paths were found in the PDF-compatible AI content.");
    return { version, paths, closed, width: (rotation % 180 ? height : width) * scale,
      height: (rotation % 180 ? width : height) * scale, tolerance };
  }
  return { version, tolerance, convert };
});
