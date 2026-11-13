"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function readIndexHtml() {
  const indexPath = path.join(__dirname, "..", "index.html");
  return fs.readFileSync(indexPath, "utf8");
}

function extractInlineScripts(html) {
  const scripts = [];
  const inlineScriptPattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match = inlineScriptPattern.exec(html);
  while (match) {
    scripts.push(match[1]);
    match = inlineScriptPattern.exec(html);
  }
  return scripts;
}

test("index.html inline scripts parse without syntax errors", () => {
  const html = readIndexHtml();
  const scripts = extractInlineScripts(html);
  assert.ok(scripts.length > 0, "expected at least one inline script in index.html");
  scripts.forEach((script, index) => {
    assert.doesNotThrow(() => new vm.Script(script), `inline script #${index + 1} should parse`);
  });
});

test("index.html includes core UI handlers expected by shipped tabs", () => {
  const html = readIndexHtml();
  const scripts = extractInlineScripts(html);
  const combinedScript = scripts.join("\n");

  [
    "switchTab",
    "removeBackground",
    "exportImageSync",
    "exportCsvSync",
    "convertCadFile",
  ].forEach((handler) => {
    assert.match(
      combinedScript,
      new RegExp(`\\bfunction\\s+${handler}\\b`),
      `${handler} handler is missing from inline script`
    );
  });

});

test("profile UI traces source pixels and previews exactly the exported geometry", () => {
  const { trace, geometry, dxf } = require("../image_profile");
  const elements = new Map();
  const fields = {
    width: "204.8", height: "102.4", threshold: "128", simplify: "0",
    "frame-width": "214.8", "frame-height": "112.4",
  };
  for (const id of ["preview", "status", "download", "lock", "invert", "frame",
    "threshold-value", "simplify-value", ...Object.keys(fields)]) {
    elements.set("profile-" + id, {
      value: fields[id] || "", checked: id === "lock", attributes: {},
      addEventListener(type, handler) { this[type] = handler; },
      replaceChildren(child) { this.child = child; },
      setAttribute(key, value) { this.attributes[key] = value; },
    });
  }
  const width = 2048, height = 1024;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  pixels.set([0, 0, 0, 255], (100 * width + 1400) * 4);
  let canvas, drawing, render, exported;
  const context = {
    document: {
      getElementById: id => elements.get(id),
      createElement(tag) {
        assert.equal(tag, "canvas");
        canvas = { getContext: () => ({
          drawImage(...args) { drawing = args; },
          getImageData(x, y, w, h) {
            assert.deepEqual([w, h], [width, height]);
            return { data: pixels };
          },
        }) };
        return canvas;
      },
      createElementNS() {
        return { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
      },
    },
    ImageProfile: { trace, geometry(loops, ...args) { exported = geometry(loops, ...args); return exported; }, dxf },
    setTimeout(callback) { render = callback; return 1; }, clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "image_profile_ui.js"), "utf8") +
    "\nImageProfileUI.setImage({naturalWidth:2048,naturalHeight:1024}, 100);", context);
  assert.equal(elements.get("profile-download").disabled, true);
  render();
  assert.deepEqual([canvas.width, canvas.height], [width, height]);
  assert.deepEqual(drawing.slice(1), [0, 0, width, height]);
  assert.equal(elements.get("profile-download").disabled, false);
  assert.deepEqual(exported[0], [[140, 92.4], [140.1, 92.4], [140.1, 92.3], [140, 92.3]]);
  assert.equal(elements.get("profile-preview").child.attributes.d,
    "M " + exported[0].map(([x, y]) => x + " " + (-y)).join(" L ") + " Z");
});
