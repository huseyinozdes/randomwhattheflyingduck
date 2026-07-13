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

test("index.html exposes handlers via EngUtilConsole module pattern", () => {
  const html = readIndexHtml();
  assert.match(html, /window\.EngUtilConsole\s*=/, "EngUtilConsole module must be assigned to window");
  assert.match(html, /EngUtilConsole\.switchTab\(/, "tab buttons must call EngUtilConsole.switchTab");
  assert.match(html, /EngUtilConsole\.removeBackground\(/, "remove-bg button must call EngUtilConsole.removeBackground");
  assert.match(html, /EngUtilConsole\.convertCadFile\(/, "convert button must call EngUtilConsole.convertCadFile");
});

test("index.html defines semantic CSS custom properties", () => {
  const html = readIndexHtml();
  const expectedVars = [
    "--color-bg-page",
    "--color-border",
    "--color-text-strong",
    "--color-text-default",
    "--color-accent",
  ];
  expectedVars.forEach((v) => {
    assert.match(html, new RegExp(v), `CSS variable ${v} must be defined`);
  });
});

test("index.html includes prefers-reduced-motion media query", () => {
  const html = readIndexHtml();
  assert.match(html, /prefers-reduced-motion/, "prefers-reduced-motion media query must be present");
});

test("index.html BG_REMOVAL_THRESHOLD constant replaces bare magic number 235", () => {
  const html = readIndexHtml();
  // The named constant must appear in the CONFIG block
  assert.match(html, /BG_REMOVAL_THRESHOLD\s*:\s*235/, "CONFIG.BG_REMOVAL_THRESHOLD must be 235");
  // The bare literal `const T = 235` must no longer appear in the script
  assert.doesNotMatch(html, /const\s+T\s*=\s*235/, "bare magic number `const T = 235` must be replaced by CONFIG constant");
});
