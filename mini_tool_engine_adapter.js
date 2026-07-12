"use strict";

const SUPPORTED_ENGINES = {
  basic: {
    id: "basic",
    label: "Basic (Recommended - standard run, no mini-tool)",
    executionPath: "basic_without_mini_tool",
    expectedMiniToolIncluded: false,
  },
  advanced: {
    id: "advanced",
    label: "Advanced (Includes mini-tool suggestions)",
    executionPath: "advanced_with_mini_tool",
    expectedMiniToolIncluded: true,
  },
};

function engineDropdownOptions() {
  return [SUPPORTED_ENGINES.basic, SUPPORTED_ENGINES.advanced].map((engine) => ({
    value: engine.id,
    label: engine.label,
  }));
}

function normalizeEngine(engine) {
  return String(engine || "basic").trim().toLowerCase();
}

function buildMiniToolNotes(requestText, miniToolContext) {
  const notes = [];
  const lower = requestText.toLowerCase();
  if (lower.includes("inch") || lower.includes("in ")) {
    notes.push("Unit hint: 1 in = 25.4 mm.");
  }
  if (lower.includes("mm")) {
    notes.push("Unit hint: 1 mm = 0.03937 in.");
  }
  if (lower.includes("fahrenheit") || lower.includes(" c ") || lower.includes("celsius")) {
    notes.push("Temperature hint: C = (F - 32) * 5/9 and F = C * 9/5 + 32.");
  }
  if (miniToolContext) {
    notes.push("Context: " + miniToolContext);
  }
  if (notes.length === 0) {
    notes.push("No additional mini-tool hints were generated from this request.");
  }
  return notes;
}

function runWithEngine(input) {
  const payload = input || {};
  const requestText = String(payload.request || "").trim();
  if (!requestText) {
    throw new Error("request is required");
  }

  const engineId = normalizeEngine(payload.engine);
  const engine = SUPPORTED_ENGINES[engineId];
  if (!engine) {
    throw new Error("engine must be one of: basic, advanced");
  }

  const hasMiniToolContext = Object.prototype.hasOwnProperty.call(payload, "mini_tool_context");
  const miniToolContext = hasMiniToolContext ? String(payload.mini_tool_context || "").trim() : "";
  if (engineId === "basic" && hasMiniToolContext && miniToolContext) {
    throw new Error("mini_tool_context is only allowed for advanced engine");
  }

  const miniToolIncluded = engine.expectedMiniToolIncluded;
  const miniToolNotes = miniToolIncluded ? buildMiniToolNotes(requestText, miniToolContext) : [];
  const effectiveRequest = miniToolIncluded
    ? requestText + "\n\n[mini-tool assist enabled]\n- " + miniToolNotes.join("\n- ")
    : requestText;

  return {
    engine: engine.id,
    engine_label: engine.label,
    execution_path: engine.executionPath,
    mini_tool_included: miniToolIncluded,
    mini_tool_notes: miniToolNotes,
    effective_request: effectiveRequest,
    verification: {
      expected_mini_tool_included: engine.expectedMiniToolIncluded,
      actual_mini_tool_included: miniToolIncluded,
      path_verified: engine.expectedMiniToolIncluded === miniToolIncluded,
    },
  };
}

const api = { engineDropdownOptions, runWithEngine };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}

if (typeof window !== "undefined") {
  window.RandomWTFDuckMiniTool = api;
}
