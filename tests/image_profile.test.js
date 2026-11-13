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

test("rejects malformed, oversized and invalid inputs", () => {
  assert.throws(() => trace(new Uint8Array(4), 513, 513, 128, false, 0), /oversized/);
  assert.throws(() => run(["#"], 256), /settings/);
  assert.throws(() => geometry([], 1, 1, 0, 1, null), /dimensions/);
  assert.throws(() => geometry([], 1, 1, 10, 10, { width: 9, height: 10 }), /Frame/);
  assert.throws(() => geometry([], 1, 1, Infinity, 10, null), /dimensions/);
});
