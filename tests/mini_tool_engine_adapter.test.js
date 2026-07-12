"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { engineDropdownOptions, runWithEngine } = require("../mini_tool_engine_adapter");

test("engine dropdown options expose basic and advanced labels", () => {
  const options = engineDropdownOptions();
  assert.equal(options.length, 2);
  assert.deepEqual(options.map((o) => o.value), ["basic", "advanced"]);
});

test("basic engine preserves request and excludes mini-tool", () => {
  const result = runWithEngine({ engine: "basic", request: "Generate report" });
  assert.equal(result.execution_path, "basic_without_mini_tool");
  assert.equal(result.mini_tool_included, false);
  assert.equal(result.effective_request, "Generate report");
  assert.equal(result.verification.path_verified, true);
});

test("advanced engine includes mini-tool notes and verification", () => {
  const result = runWithEngine({
    engine: "advanced",
    request: "Cut bracket at 2 in",
    mini_tool_context: "focus on conversion",
  });
  assert.equal(result.execution_path, "advanced_with_mini_tool");
  assert.equal(result.mini_tool_included, true);
  assert.equal(result.verification.path_verified, true);
  assert.ok(result.mini_tool_notes.some((note) => note.includes("25.4 mm")));
});

test("basic rejects mode-specific mini-tool context", () => {
  assert.throws(
    () => runWithEngine({ engine: "basic", request: "x", mini_tool_context: "ctx" }),
    /only allowed for advanced engine/
  );
});
