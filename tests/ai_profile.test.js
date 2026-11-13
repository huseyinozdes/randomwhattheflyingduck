"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { convert, tolerance, version } = require("../ai_profile");
const { dxf } = require("../image_profile");
const { fixture, stream, group, layered } = require("./ai_fixture");
const MM = 25.4 / 72;
const close = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);
const rectangle = x => `${x} 100 10 10 re f`;
const xs = result => result.paths.map(path => Math.round(path[0][0] / MM));

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
    ["BI /W 1 /H 1 ID x EI", {}, /Unsupported AI\/PDF operator BI/],
    ["/Fm Do", { resources: "<< /XObject << /Fm 5 0 R >> >>",
      objects: [stream("0 0 10 10 re f", "/Type /XObject /Subtype /Form /BBox [0 0 72 72] /OC << /Type /OCG /Name (hidden) >>")] }, /declares no layers/],
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

test("AI converts ordinary visible Illustrator-style layers exactly like unlayered artwork", async () => {
  const usage = "/Usage << /CreatorInfo << /Creator (Adobe Illustrator 24.0) /Subtype /Artwork >> /Print << /PrintState /ON /Subtype /Print >> /View << /ViewState /ON >> >>";
  const config = "/ON [5 0 R] /Order [5 0 R] /RBGroups [] /AS [<< /Event /View /Category [/View] /OCGs [5 0 R] >> << /Event /Print /Category [/Print] /OCGs [5 0 R] >>]";
  const art = "q 2 0 0 2 10 20 cm 0 0 72 72 re 18 18 36 36 re f* Q 200 100 m 272 100 l S";
  const layer = await convert(layered(`/OC /MC0 BDC ${art} EMC`, { groups: [group("Layer 1", usage)], config }));
  const plain = await convert(fixture(art));
  assert.deepEqual(layer.paths, plain.paths);
  assert.deepEqual(layer.closed, plain.closed);
  assert.deepEqual(layer.excluded, { layers: [], paths: 0, objects: 0 });
  // The deployed 1.6.0 rejected exactly this structure with "Optional/hidden layers are unsupported".
  const unnamedDefault = await convert(layered(`/OC /MC0 BDC ${art} EMC`, { config: "" }));
  assert.deepEqual(unnamedDefault.paths, plain.paths);
});

test("AI excludes and reports hidden layers without exporting their geometry", async () => {
  const hiddenLayer = "/OC /MC1 BDC 400 400 50 50 re f 410 410 m 420 420 l S EMC";
  const options = { groups: [group("Artwork"), group("Hidden notes")], config: "/ON [5 0 R] /OFF [6 0 R]" };
  const result = await convert(layered(`/OC /MC0 BDC 100 100 100 100 re f EMC ${hiddenLayer}`, options));
  assert.deepEqual(xs(result), [100]);
  assert.deepEqual(result.excluded, { layers: ["Hidden notes"], paths: 2, objects: 0 });
  const output = dxf(result.paths, result.closed);
  const value = n => String(Number((n * MM).toFixed(8)));
  assert.ok(output.includes(`\r\n10\r\n${value(100)}\r\n`));
  for (const hidden of [400, 410, 420, 450]) assert.ok(!output.includes(value(hidden)), `hidden coordinate ${hidden} reached the DXF`);
  assert.equal(output.split("0\r\nLWPOLYLINE\r\n").length - 1, 1);

  const off = await convert(layered(`/OC /MC0 BDC ${rectangle(100)} EMC /OC /MC1 BDC ${rectangle(200)} EMC ${rectangle(300)}`,
    { groups: [group("A"), group("B")], config: "/BaseState /OFF /ON [5 0 R]" }));
  assert.deepEqual(xs(off), [100, 300]);
  assert.deepEqual(off.excluded.layers, ["B"]);
  await assert.rejects(convert(layered(`/OC /MC1 BDC ${rectangle(100)} EMC`, { ...options })), /All vector artwork is in hidden layers/);
  await assert.rejects(convert(layered("/OC /MC0 BDC EMC")), /No painted vector paths/);
});

test("AI never exports a layer whose View usage says OFF, with or without an automatic-state entry", async () => {
  const on = "/Usage << /View << /ViewState /ON >> >>", off = "/Usage << /View << /ViewState /OFF >> >>";
  const content = `/OC /MC0 BDC ${rectangle(100)} EMC /OC /MC1 BDC ${rectangle(200)} EMC`;
  // Hidden by default and marked OFF: consistent, so only the first layer is exported.
  const agreed = await convert(layered(content, { groups: [group("A", on), group("B", off)], config: "/ON [5 0 R] /OFF [6 0 R]" }));
  assert.deepEqual(xs(agreed), [100]);
  assert.deepEqual(agreed.excluded.layers, ["B"]);
  // Hidden by default but marked ON with no /AS entry applying it: stays hidden, which is the safe side.
  const hiddenHint = await convert(layered(content, { groups: [group("A", on), group("B", on)], config: "/ON [5 0 R] /OFF [6 0 R]" }));
  assert.deepEqual(xs(hiddenHint), [100]);
  assert.deepEqual(hiddenHint.excluded.layers, ["B"]);
  // Shown by default but marked OFF: viewers disagree on whether it appears, so it is rejected rather than exported.
  for (const config of ["/ON [5 0 R 6 0 R]", "/BaseState /ON", "", "/BaseState /OFF /ON [5 0 R 6 0 R]"]) {
    await assert.rejects(convert(layered(content, { groups: [group("A", on), group("B", off)], config })), /conflicts with its default state/, config);
  }
});

test("AI combines nested layers and layer membership policies with the PDF visibility rules", async () => {
  const nested = layered([
    `/OC /MC0 BDC ${rectangle(100)} /OC /MC1 BDC ${rectangle(120)} EMC ${rectangle(140)} EMC`,
    `/OC /MC1 BDC /OC /MC2 BDC ${rectangle(160)} EMC ${rectangle(180)} EMC ${rectangle(200)}`].join(" "),
  { groups: [group("A"), group("B"), group("C")], config: "/BaseState /OFF /ON [5 0 R 7 0 R]" });
  const result = await convert(nested);
  assert.deepEqual(xs(result), [100, 140, 200]);
  assert.deepEqual(result.excluded, { layers: ["B"], paths: 3, objects: 0 });

  const members = [["/OCGs [5 0 R 6 0 R] /P /AllOn", 100, false], ["/OCGs [5 0 R 6 0 R]", 150, true], ["/OCGs [5 0 R 6 0 R] /P /AnyOff", 200, true],
    ["/OCGs 6 0 R /P /AllOff", 250, true], ["/OCGs [5 0 R] /P /AllOff", 300, false]];
  const policies = await convert(layered(members.map(([, x], i) => `/OC /MC${i + 2} BDC ${rectangle(x)} EMC`).join(" "), {
    groups: [group("A"), group("B")], config: "/ON [5 0 R] /OFF [6 0 R]",
    objects: members.map(([body]) => `<< /Type /OCMD ${body} >>`),
    properties: "/MC0 5 0 R /MC1 6 0 R " + members.map((_, i) => `/MC${i + 2} ${7 + i} 0 R`).join(" "),
  }));
  assert.deepEqual(xs(policies), members.filter(member => member[2]).map(member => member[1]));
  assert.deepEqual(policies.excluded.layers, ["A + B", "A"]);
});

test("AI skips hidden forms, images, text and shading but still rejects the same visible content", async () => {
  const form = layer => stream("0 0 10 10 re f", `/Type /XObject /Subtype /Form /BBox [0 0 72 72] /OC ${layer} 0 R`);
  const image = layer => stream("rgb", `/Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceRGB /OC ${layer} 0 R`);
  const options = { groups: [group("Shown"), group("Hidden")], config: "/ON [5 0 R] /OFF [6 0 R]",
    objects: [form(5), form(6), image(6), image(5)],
    extra: "/XObject << /FmV 7 0 R /FmH 8 0 R /ImH 9 0 R /ImV 10 0 R >>" };
  const result = await convert(layered("/FmV Do /FmH Do /ImH Do /OC /MC1 BDC /FmV Do BT /F1 12 Tf (x) Tj ET /Sh sh EMC", options));
  assert.equal(result.paths.length, 1);
  close(result.paths[0][2][0], 10 * MM);
  assert.deepEqual(result.excluded, { layers: ["Hidden"], paths: 0, objects: 5 });
  await assert.rejects(convert(layered("/FmV Do /ImV Do", options)), /Raster images/);
  await assert.rejects(convert(layered("/OC /MC0 BDC BT /F1 12 Tf (x) Tj ET EMC", options)), /text|PDF-compatible/);
  await assert.rejects(convert(layered("/OC /MC0 BDC /Sh sh EMC", options)), /Unsupported.*sh/);
  await assert.rejects(convert(layered("/OC /MC1 BDC BI /W 1 /H 1 ID x EI EMC", options)), /Unsupported AI\/PDF operator BI/);
});

test("AI does not let unsupported state from a hidden layer leak into visible artwork", async () => {
  const extra = "/ExtGState << /GS << /ca 0.5 >> >>";
  const options = { groups: [group("Shown"), group("Hidden")], config: "/ON [5 0 R] /OFF [6 0 R]", extra };
  const leaks = [["/GS gs", /Transparency/], ["[3 2] 0 d", /Dashed/], ["BT 7 Tr ET", /Text clipping/], ["0 0 50 50 re W n", /clipping boundary/]];
  for (const [state, error] of leaks) {
    await assert.rejects(convert(layered(`/OC /MC1 BDC ${state} EMC ${rectangle(100)}`, options)), error, state);
    await assert.rejects(convert(layered(`/OC /MC1 BDC /OC /MC0 BDC ${state} EMC EMC ${rectangle(100)}`, options)), error, "nested " + state);
    const contained = await convert(layered(`/OC /MC1 BDC q ${state} ${rectangle(200)} Q EMC ${rectangle(100)}`, options));
    assert.deepEqual(xs(contained), [100], "contained " + state);
    assert.equal(contained.excluded.paths, 1);
  }
  // Unsupported state that is never followed by visible geometry is not a reason to reject the file.
  const unused = await convert(layered(`${rectangle(100)} /OC /MC1 BDC /GS gs EMC`, options));
  assert.deepEqual(xs(unused), [100]);
  await assert.rejects(convert(layered("/OC /MC0 BDC /GS gs " + rectangle(100) + " EMC", options)), /Transparency/);
});

test("AI rejects ambiguous, view-dependent or malformed layer visibility instead of guessing", async () => {
  const art = `/OC /MC0 BDC ${rectangle(100)} EMC`;
  const orphan = { groups: [group("Layer 1")], objects: [group("Orphan")] };
  const examples = [
    [art, { objects: ["<< /Type /OCMD /VE [/Not 5 0 R] >>"], properties: "/MC0 6 0 R" }, /visibility expressions/],
    [art, { config: "/ON [5 0 R] /AS [<< /Event /View /Category [/Zoom] /OCGs [5 0 R] >>]" }, /view-dependent Zoom/],
    [art, { config: "/ON [5 0 R] /AS [<< /Event /View /Category [/View /Language] /OCGs [5 0 R] >>]" }, /view-dependent View\/Language/],
    [art, { groups: [group("Layer 1", "/Usage << /View << /ViewState /OFF >> >>")], config: "/ON [5 0 R] /AS [<< /Event /View /Category [/View] /OCGs [5 0 R] >>]" }, /conflicts with its default state/],
    [art, { groups: [group("Layer 1", "/Usage << /View << /ViewState /OFF >> >>")] }, /conflicts with its default state/],
    [art, { config: "/BaseState /Unchanged" }, /BaseState Unchanged/],
    [art, { config: "/ON [5 0 R] /OFF [5 0 R]" }, /both ON and OFF/],
    [art, { groups: ["<< /Type /OCG /Name (Design) /Intent /Design >>"] }, /design only/],
    [art, { config: "/Intent /Design /ON [5 0 R]" }, /not intended for viewing/],
    [art, { config: "/ON [9 0 R]" }, /undeclared layer/],
    [art, { catalog: "/OCProperties << /OCGs [5 0 R] >>" }, /default optional-content configuration/],
    [art, { ...orphan, properties: "/MC0 6 0 R" }, /declared by the document catalog/],
    ["/OC /MC9 BDC " + rectangle(100) + " EMC", {}, /Missing AI\/PDF resource: Properties\/MC9/],
    ["/OC << /Type /OCG >> BDC " + rectangle(100) + " EMC", {}, /Unsupported AI\/PDF marked content/],
    ["/Artifact << /Type /Pagination >> BDC " + rectangle(100) + " EMC", {}, /Unsupported AI\/PDF marked content/],
    ["/OC BMC " + rectangle(100) + " EMC", {}, /needs a \/Properties reference/],
    [`${art} EMC`, {}, /Unbalanced AI marked content/],
    ["/OC /MC0 BDC " + rectangle(100), {}, /Incomplete or unbalanced/],
    ["100 100 m /Tag BMC 200 200 l S EMC", {}, /cannot interrupt an AI path/],
  ];
  for (const [content, options, error] of examples) {
    await assert.rejects(convert(layered(content, options)), error, content + JSON.stringify(options));
  }
  await assert.rejects(convert(fixture("/OC /MC0 BDC " + rectangle(100) + " EMC", { resources: "<< /Properties << /MC0 5 0 R >> >>", objects: [group("x")] })), /declares no layers/);
});

test("AI layer names are sanitized for display and the reported list is bounded", async () => {
  const names = ["<FEFF00410020202E0042>", "(Line\\nBreak)", "(" + "x".repeat(100) + ")", "()"];
  const groups = names.map(text => `<< /Type /OCG /Name ${text} >>`);
  const hidden = await convert(layered(groups.map((_, i) => `/OC /MC${i} BDC ${rectangle(100 + 20 * i)} EMC`).join(" ") + " " + rectangle(300),
    { groups, config: "/OFF [5 0 R 6 0 R 7 0 R 8 0 R]" }));
  assert.deepEqual(hidden.excluded.layers, ["A B", "Line Break", "x".repeat(60), "unnamed layer"]);
  const many = Array.from({ length: 25 }, (_, i) => group("L" + i));
  const bounded = await convert(layered(many.map((_, i) => `/OC /MC${i} BDC ${rectangle(100 + i)} EMC`).join(" ") + " " + rectangle(300),
    { groups: many, config: "/OFF [" + many.map((_, i) => `${5 + i} 0 R`).join(" ") + "]" }));
  assert.equal(bounded.excluded.layers.length, 20);
  assert.equal(bounded.excluded.paths, 25);
  assert.deepEqual(xs(bounded), [300]);
});
