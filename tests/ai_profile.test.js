"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { convert, tolerance, version } = require("../ai_profile");
const { dxf } = require("../image_profile");
const { fixture, stream } = require("./ai_fixture");
const MM = 25.4 / 72;
const close = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);

test("AI extraction retains transformed filled boundaries, holes and open strokes at native mm scale", async () => {
  const result = await convert(fixture("q 2 0 0 2 10 20 cm 0 0 72 72 re 18 18 36 36 re f* Q 200 100 m 272 100 l S", { compressed: true }));
  assert.equal(result.version, version);
  assert.deepEqual(result.closed, [true, true, false]);
  assert.equal(result.paths.length, 3);
  close(result.paths[0][0][0], 10 * MM);
  close(result.paths[0][0][1], 20 * MM);
  close(result.paths[0][1][0] - result.paths[0][0][0], 50.8);
  close(result.paths[2][1][0] - result.paths[2][0][0], 25.4);
  assert.equal(result.paths[2].length, 2);
  const entities = dxf(result.paths, result.closed).split("0\r\nLWPOLYLINE\r\n").slice(1);
  assert.deepEqual(entities.map(text => text.match(/\r\n70\r\n([01])\r\n/)[1]), ["1", "1", "0"]);
  assert.throws(() => dxf(result.paths, [true]), /closure flags/);
});

test("AI crop, clockwise page rotation and UserUnit preserve physical placement", async () => {
  const result = await convert(fixture("10 20 m 82 20 l S", { page: "/CropBox [10 20 82 92] /Rotate 90 /UserUnit 2" }));
  close(result.width, 50.8); close(result.height, 50.8);
  close(result.paths[0][0][0], 0); close(result.paths[0][0][1], 50.8);
  close(result.paths[0][1][0], 0); close(result.paths[0][1][1], 0);
  assert.equal(result.closed[0], false);
});

test("AI cubic and shorthand curves are flattened within the declared geometric tolerance", async () => {
  const result = await convert(fixture("20 20 m 20 92 92 92 92 20 c S 120 20 m 140 92 192 20 v S 220 20 m 220 92 292 20 y S"));
  assert.deepEqual(result.closed, [false, false, false]);
  assert.ok(result.paths.every(path => path.length > 4));
  const points = result.paths[0];
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000, s = 1 - t;
    const sample = [(s ** 3 * 20 + 3 * s * s * t * 20 + 3 * s * t * t * 92 + t ** 3 * 92) * MM,
      (s ** 3 * 20 + 3 * s * s * t * 92 + 3 * s * t * t * 92 + t ** 3 * 20) * MM];
    let distance = Infinity;
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], dx = b[0] - a[0], dy = b[1] - a[1];
      const ratio = Math.max(0, Math.min(1, ((sample[0] - a[0]) * dx + (sample[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      distance = Math.min(distance, Math.hypot(sample[0] - a[0] - ratio * dx, sample[1] - a[1] - ratio * dy));
    }
    assert.ok(distance <= tolerance + 1e-7);
  }
});

test("AI form transforms and harmless artboard clipping are supported without flattening to pixels", async () => {
  const form = stream("0 0 72 72 re f", "/Type /XObject /Subtype /Form /BBox [0 0 72 72] /Matrix [1 0 0 1 10 20] /Resources << >>", true);
  const result = await convert(fixture("0 0 512 512 re W n q 2 0 0 2 0 0 cm /Fm Do Q",
    { resources: "<< /XObject << /Fm 5 0 R >> >>", objects: [form] }));
  assert.equal(result.paths[0].length, 4);
  close(result.paths[0][0][0], 20 * MM); close(result.paths[0][0][1], 40 * MM);
  close(result.paths[0][2][0], 164 * MM); close(result.paths[0][2][1], 184 * MM);
  const explicitClosure = await convert(fixture("0 0 m 100 0 l 100 100 l 0 100 l 0 0 l W n 10 10 10 10 re f"));
  assert.equal(explicitClosure.paths.length, 1);
});

test("AI rejects unsupported artwork without returning a partial conversion", async () => {
  const examples = [
    ["BT /F1 12 Tf (text) Tj ET", {}, /text|PDF-compatible/],
    ["/Im Do", { resources: "<< /XObject << /Im 5 0 R >> >>", objects: [stream("rgb", "/Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceRGB")] }, /Raster images/],
    ["/Sh sh", {}, /Unsupported.*sh/],
    ["/Pattern cs", {}, /Pattern/],
    ["/GS gs 100 100 10 10 re f", { resources: "<< /ExtGState << /GS << /ca 0.5 >> >> >>" }, /Transparency/],
    ["[3 2] 0 d 100 100 m 200 200 l S", {}, /Dashed/],
    ["/OC /Layer BDC 100 100 10 10 re f EMC", {}, /Unsupported.*BDC/],
    ["/Fm Do", { resources: "<< /XObject << /Fm 5 0 R >> >>",
      objects: [stream("0 0 10 10 re f", "/Type /XObject /Subtype /Form /BBox [0 0 72 72] /OC << /Type /OCG /Name (hidden) >>")] }, /Optional.*form/],
    ["/Spot cs 0 scn 20 20 10 10 re f", { resources: "<< /ColorSpace << /Spot [/Separation /None /DeviceGray << >>] >> >>" }, /Invisible/],
    ["10 10 10 10 re W n 0 0 40 40 re f", {}, /clipping boundary/],
    ["0 0 m 10 10 20 10 30 0 c W n", {}, /Curved/],
    ["0 0 m 100 0 l 100 100 l 0 100 l 0 0 l 100 0 l 100 100 l 0 100 l h W* n 10 10 10 10 re f", {}, /non-convex/],
    ["BX unknownOperator EX", {}, /unknownOperator/],
    ["Q", {}, /Unbalanced/],
    ["100 100 m 120 120 l", {}, /Incomplete/],
  ];
  for (const [content, options, error] of examples) {
    await assert.rejects(convert(fixture("300 300 10 10 re f\n" + content, options)), error, content);
  }
});

test("AI rejects legacy/private data, multiple artboards, oversized input and recursive forms", async () => {
  await assert.rejects(convert(new TextEncoder().encode("%!PS-Adobe-3.0\n")), /PostScript/);
  await assert.rejects(convert(new TextEncoder().encode("private Illustrator data")), /PDF-compatible/);
  await assert.rejects(convert(new Uint8Array(10 * 1024 * 1024 + 1)), /10 MiB/);
  await assert.rejects(convert(fixture("0 0 10 10 re f", { secondPage: true })), /Multiple artboards/);
  await assert.rejects(convert(fixture("0 0 10 10 re f", { trailer: "/Encrypt 5 0 R",
    objects: ["<< /Filter /Standard /V 1 /R 2 /O () /U () /P -4 >>"] })), /Encrypted/);
  const form = stream("/Fm Do", "/Type /XObject /Subtype /Form /BBox [0 0 72 72] /Resources << /XObject << /Fm 5 0 R >> >>");
  await assert.rejects(convert(fixture("/Fm Do", { resources: "<< /XObject << /Fm 5 0 R >> >>", objects: [form] })), /Recursive/);
});
