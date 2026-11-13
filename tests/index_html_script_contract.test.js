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

test("profile UI traces source pixels and previews exactly the exported geometry", async () => {
  const { trace, geometry, dxf, version } = require("../image_profile");
  const elements = new Map();
  const fields = {
    width: "204.8", height: "102.4", threshold: "128", simplify: "0",
    "frame-width": "214.8", "frame-height": "112.4", filename: "image-profile",
  };
  for (const id of ["preview", "status", "download", "lock", "invert", "quality", "frame",
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
  const downloads = [];
  const context = {
    document: {
      getElementById: id => elements.get(id),
      createElement(tag) {
        if (tag === "a") return { click() { downloads.push(this.download); }, remove() {} };
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
      body: { appendChild() {} },
    },
    ImageProfile: { trace, geometry(loops, ...args) { exported = geometry(loops, ...args); return exported; }, dxf, version },
    setTimeout(callback, delay) { if (delay === 100) render = callback; return 1; }, clearTimeout() {},
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    Blob,
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
  assert.ok(elements.get("profile-status").textContent.includes("exporter " + version));
  for (const [input, expected] of [["Meeting logo", "Meeting logo.dxf"], ["part.DXF.dxf", "part.dxf"],
    ["part.DXF .dxf.", "part.dxf"], [" ", "image-profile.dxf"]]) {
    elements.get("profile-filename").value = input;
    elements.get("profile-download").click();
    assert.equal(downloads.at(-1), expected);
  }
  const count = downloads.length;
  elements.get("profile-filename").value = "bad/name";
  elements.get("profile-download").click();
  assert.equal(downloads.length, count);
  assert.ok(elements.get("profile-status").textContent.includes("[ ERROR ]"));
  elements.get("profile-filename").value = "picker-test.dxf";
  const helper = readIndexHtml().match(/async function triggerSaveFile[\s\S]+?(?=\n\s*function getInitials)/)[0];
  let saved;
  context.window = { showSaveFilePicker: async options => ({
    createWritable: async () => ({
      async write(blob) { saved = { options, text: await blob.text() }; }, async close() {},
    }),
  }) };
  vm.runInContext(helper, context);
  await elements.get("profile-download").click();
  assert.equal(saved.options.suggestedName, "picker-test.dxf");
  assert.equal(saved.options.types[0].accept["application/dxf"][0], ".dxf");
  assert.equal(saved.text, dxf(exported));
  assert.ok(elements.get("profile-status").textContent.includes("DXF save requested: picker-test.dxf"));
  context.window.showSaveFilePicker = async () => { throw Object.assign(new Error("cancelled"), { name: "AbortError" }); };
  await elements.get("profile-download").click();
  assert.ok(elements.get("profile-status").textContent.includes("Save cancelled by user"));
  context.window.showSaveFilePicker = async () => ({
    async createWritable() { throw new Error("Write permission denied"); },
  });
  await elements.get("profile-download").click();
  assert.ok(elements.get("profile-status").textContent.includes("Write permission denied"));
  assert.equal(downloads.length, count);
  context.ImageProfile.version = undefined;
  render();
  assert.equal(elements.get("profile-download").disabled, true);
  assert.ok(elements.get("profile-status").textContent.includes("Outdated image exporter"));
  assert.equal(elements.get("profile-preview").child, undefined);
  context.ImageProfile.version = version;
  elements.delete("profile-quality");
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "image_profile_ui.js"), "utf8"), { ...context });
  assert.equal(elements.get("profile-download").disabled, true);
  assert.ok(elements.get("profile-status").textContent.includes("Outdated page layout"));
});

test("profile script URLs bypass unversioned cache entries and match the engine build", () => {
  const { version } = require("../image_profile");
  const html = readIndexHtml();
  assert.ok(html.includes(`build ${version} // status: online`));
  assert.equal(require("../package.json").version, version);
  assert.equal(require("../package-lock.json").version, version);
  assert.equal(require("../package-lock.json").packages[""].version, version);
  for (const filename of ["image_profile.js", "image_profile_ui.js"]) {
    const source = html.match(new RegExp(`src="(${filename.replace(/\./g, "\\.")}[^"]*)"`))?.[1];
    assert.ok(source, `${filename} script is present`);
    assert.equal(new URL(source, "https://example.test/").searchParams.get("v"), version);
  }
});
