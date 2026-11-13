"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { trace, geometry, dxf } = require("../image_profile");

function raster(rows) {
  const width = rows[0].length, height = rows.length;
  const pixels = new Uint8ClampedArray(width * height * 4);
  rows.join("").split("").forEach((value, i) => {
    const color = value === "#" ? 0 : 255;
    pixels.set([color, color, color, value === "t" ? 0 : 255], i * 4);
  });
  return { pixels, width, height };
}
function run(rows, threshold = 128, invert = false, tolerance = 0) {
  const image = raster(rows);
  return trace(image.pixels, image.width, image.height, threshold, invert, tolerance);
}

test("traces closed boundaries for a silhouette and its hole", () => {
  const loops = run(["#####", "#...#", "#...#", "#...#", "#####"]);
  assert.equal(loops.length, 2);
  assert.deepEqual(loops.map(loop => loop.length), [4, 4]);
  assert.deepEqual(run(["#####", "#...#", "#...#", "#...#", "#####"], 128, false, 3), loops);
});

test("keeps diagonal regions separate and excludes transparent pixels", () => {
  assert.equal(run(["#.", ".#"]).length, 2);
  assert.equal(run(["t."], 128, true).length, 1);
  assert.deepEqual(run(["t"], 128, true), []);
});

test("splits a hole touching the exterior at one corner into simple closed rings", () => {
  const loops = run(["###", "#.#", ".##"]);
  assert.equal(loops.length, 2);
  assert.deepEqual(loops[0], [[1, 2], [2, 2], [2, 1], [1, 1]]);
  assert.deepEqual(loops[1], [[0, 0], [3, 0], [3, 3], [1, 3], [1, 2], [0, 2]]);
  assert.deepEqual(run(["###", "#.#", ".##"], 128, false, 3), loops);
  for (const loop of loops) {
    assert.equal(new Set(loop.map(point => point.join(","))).size, loop.length);
  }
});

test("threshold, inversion and simplification alter traced outlines", () => {
  assert.equal(run(["#."], 128, false).length, 1);
  assert.deepEqual(run(["#."], 128, true)[0], [[1, 0], [2, 0], [2, 1], [1, 1]]);
  const stair = ["#.....", "##....", "###...", "####..", "#####.", "######"];
  assert.ok(run(stair, 128, false, 1).flat().length < run(stair).flat().length);
});

test("geometry scales and flips image coordinates and adds a centered frame", () => {
  const paths = geometry(run(["#.", ".."]), 2, 2, 20, 10, { width: 30, height: 20 });
  assert.deepEqual(paths[0], [[0, 10], [10, 10], [10, 5], [0, 5]]);
  assert.deepEqual(paths[1], [[-5, -5], [25, -5], [25, 15], [-5, 15]]);
  const text = dxf(paths);
  assert.match(text, /\$ACADVER\r\n1\r\nAC1015\r\n/);
  assert.match(text, /\$INSUNITS\r\n70\r\n4\r\n/);
  assert.equal((text.match(/LWPOLYLINE/g) || []).length, 2);
  assert.match(text, /90\r\n4\r\n70\r\n1\r\n10\r\n0\r\n20\r\n10\r\n/);
});

test("DXF defines complete R2000 sections, unique handles and model-space ownership", () => {
  const lines = dxf([[[0, 0], [20, 0], [20, 10], [0, 10]]]).trimEnd().split("\r\n");
  const records = [];
  for (let i = 0; i < lines.length; i += 2) {
    const tag = [Number(lines[i]), lines[i + 1]];
    if (tag[0] === 0) records.push([]);
    records[records.length - 1].push(tag);
  }
  const value = (record, code) => record.find(tag => tag[0] === code)?.[1];
  const sections = records.filter(record => value(record, 0) === "SECTION");
  assert.deepEqual(sections.map(record => value(record, 2)), ["HEADER", "TABLES", "BLOCKS", "ENTITIES", "OBJECTS"]);
  const model = records.find(record => value(record, 0) === "BLOCK_RECORD" && value(record, 2) === "*Model_Space");
  const polyline = records.find(record => value(record, 0) === "LWPOLYLINE");
  assert.equal(value(polyline, 330), value(model, 5));
  assert.equal(value(polyline, 70), "1");
  assert.equal(value(polyline, 90), "4");
  const modelLayout = records.find(record => value(record, 0) === "LAYOUT" && value(record, 5) === value(model, 340));
  assert.equal(modelLayout.filter(tag => tag[0] === 330).at(-1)[1], value(model, 5));
  const handles = records.filter(record => value(record, 0) !== "SECTION")
    .map(record => value(record, 5)).filter(Boolean);
  assert.equal(new Set(handles).size, handles.length);
  const seed = Number.parseInt(value(sections[0], 5), 16);
  assert.ok(handles.every(id => Number.parseInt(id, 16) < seed));
  const knownHandles = new Set(["0", ...handles]);
  for (const record of records) {
    for (const [code, id] of record) {
      if ([330, 340, 350].includes(code)) assert.ok(knownHandles.has(id), `unresolved handle ${id}`);
    }
  }
  assert.ok(records.some(record => value(record, 0) === "LAYER" && value(record, 2) === "0"));
  assert.ok(records.some(record => value(record, 0) === "DICTIONARY" && record.some(tag => tag[1] === "ACAD_LAYOUT")));
});

test("DXF serializes a detailed outline without overflowing the JavaScript argument limit", () => {
  const ring = Array.from({ length: 40000 }, (_, i) => {
    const angle = i * 2 * Math.PI / 40000;
    return [100 * Math.cos(angle), 100 * Math.sin(angle)];
  });
  const text = dxf([ring]);
  assert.match(text, /90\r\n40000\r\n70\r\n1\r\n/);
  assert.ok(text.endsWith("0\r\nEOF\r\n"));
});

test("rejects malformed, oversized and invalid inputs", () => {
  assert.throws(() => trace(new Uint8Array(4), 8193, 1, 128, false, 0), /oversized/);
  assert.throws(() => trace(new Uint8Array(4), 5000, 5000, 128, false, 0), /oversized/);
  assert.throws(() => run(["#"], 256), /settings/);
  assert.throws(() => geometry([], 1, 1, 0, 1, null), /dimensions/);
  assert.throws(() => geometry([], 1, 1, 10, 10, { width: 9, height: 10 }), /Frame/);
  assert.throws(() => geometry([], 1, 1, Infinity, 10, null), /dimensions/);
  assert.throws(() => run(Array.from({ length: 33 }, (_, y) =>
    Array.from({ length: 33 }, (_, x) => (x + y) % 2 ? "." : "#").join(""))), /too many contours/);
  assert.throws(() => run(Array.from({ length: 225 }, (_, y) =>
    Array.from({ length: 225 }, (_, x) => (x + y) % 2 ? "." : "#").join(""))), /too many outline edges/);
});

test("includes exact grayscale thresholds and makes inversion complementary", () => {
  for (let value = 0; value <= 255; value++) {
    const pixel = new Uint8ClampedArray([value, value, value, 255]);
    assert.equal(trace(pixel, 1, 1, value, false, 0).length, 1, `gray ${value} at equality`);
    assert.equal(trace(pixel, 1, 1, value, true, 0).length, 0, `inverted gray ${value} at equality`);
    if (value > 0) {
      assert.equal(trace(pixel, 1, 1, value - 1, false, 0).length, 0);
      assert.equal(trace(pixel, 1, 1, value - 1, true, 0).length, 1);
    }
  }
  const partial = new Uint8ClampedArray([0, 0, 0, 128]); // Black composited on white is 127.
  assert.equal(trace(partial, 1, 1, 127, false, 0).length, 1);
  assert.equal(trace(partial, 1, 1, 126, true, 0).length, 1);
  assert.deepEqual(trace(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1, 255, false, 0), []);
});

test("preserves native-resolution one-pixel lines and holes with exact scaled coordinates", () => {
  const width = 2048, height = 1024;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 100; y < 900; y++) pixels.set([0, 0, 0, 255], (y * width + 1400) * 4);
  for (let y = 200; y < 800; y++) {
    for (let x = 100; x < 900; x++) {
      if (x >= 300 && x < 700 && y >= 400 && y < 600) continue;
      pixels.set([0, 0, 0, 255], (y * width + x) * 4);
    }
  }
  const loops = trace(pixels, width, height, 128, false, 0);
  assert.equal(loops.length, 3);
  function area(ring) {
    return ring.reduce((sum, [x, y], i) => {
      const [nx, ny] = ring[(i + 1) % ring.length];
      return sum + x * ny - nx * y;
    }, 0) / 2;
  }
  assert.equal(loops.reduce((sum, loop) => sum + area(loop), 0), 800 * 600 - 400 * 200 + 800);
  const line = loops.find(loop => area(loop) === 800);
  assert.deepEqual(line, [[1400, 100], [1401, 100], [1401, 900], [1400, 900]]);
  assert.deepEqual(geometry([line], width, height, 204.8, 102.4)[0],
    [[140, 92.4], [140.1, 92.4], [140.1, 12.4], [140, 12.4]]);
});
