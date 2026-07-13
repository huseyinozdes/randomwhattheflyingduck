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
