"use strict";

importScripts("vendor/pdf-lib-1.17.1.min.js", "ai_profile.js?v=1.6.0");

self.onmessage = async function (event) {
  try {
    const result = await AiProfile.convert(new Uint8Array(event.data));
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message || "Could not parse the AI file." });
  }
};
