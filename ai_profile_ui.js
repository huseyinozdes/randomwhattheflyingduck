"use strict";

(function () {
  const version = "1.6.1";
  const get = id => document.getElementById("ai-" + id);
  const input = get("file"), consent = get("geometry"), convert = get("convert"), download = get("download");
  const preview = get("preview"), status = get("status");
  let worker = null, timer = null, serial = 0, result = null;
  const message = (level, text) => { status.textContent = "[" + level + "] " + text + " | exporter " + version; };
  function excludedNote(excluded) {
    const paths = Number(excluded && excluded.paths) || 0, objects = Number(excluded && excluded.objects) || 0;
    if (paths + objects <= 0) return "";
    const names = Array.isArray(excluded.layers) ? excluded.layers.map(String) : [];
    return " Hidden layer artwork was not exported (" + paths + " paths, " + objects + " other objects) in: " +
      (names.slice(0, 5).join(", ") + (names.length > 5 ? ", ..." : "") || "unnamed layer") + ".";
  }
  function stop() {
    if (worker) worker.terminate();
    worker = null;
    clearTimeout(timer); timer = null;
    convert.disabled = false;
  }
  function invalidate() {
    serial++; stop(); result = null; download.disabled = true; preview.replaceChildren();
  }
  input.addEventListener("change", function () {
    invalidate();
    const file = input.files[0];
    get("filename").value = file ? file.name.replace(/\.ai$/i, "") : "converted";
    message("IDLE", file ? "Ready to convert " + file.name : "Load a PDF-compatible AI file.");
  });
  consent.addEventListener("change", function () {
    invalidate();
    message("IDLE", "Confirm path-only output, then convert the selected file.");
  });
  convert.addEventListener("click", async function () {
    invalidate();
    const request = serial, file = input.files[0];
    try {
      if (ImageProfile.version !== version) throw new Error("Outdated exporter; hard-refresh the page.");
      if (!file || !/\.ai$/i.test(file.name)) throw new Error("Select an Adobe .ai file.");
      if (!consent.checked) throw new Error("Confirm that you want path geometry, not appearance-preserving conversion.");
      if (file.size > 10 * 1024 * 1024) throw new Error("AI input must be at most 10 MiB.");
      if (!["http:", "https:"].includes(location.protocol)) throw new Error("AI conversion needs the hosted page or a local static HTTP server; file:// workers are unavailable.");
      convert.disabled = true;
      message("BUSY", "Reading vector artwork locally...");
      const bytes = await file.arrayBuffer();
      if (request !== serial) return;
      worker = new Worker("ai_profile_worker.js?v=" + version);
      const failed = text => {
        if (request !== serial) return;
        stop(); result = null; download.disabled = true; preview.replaceChildren(); message("ERROR", text);
      };
      timer = setTimeout(() => failed("Conversion exceeded 20 seconds. Simplify the AI artwork and try again."), 20000);
      worker.onerror = event => { event.preventDefault(); failed(event.message || "Could not load or run the local AI converter."); };
      worker.onmessage = event => {
        if (request !== serial) return;
        if (event.data.error) { failed(event.data.error); return; }
        try {
          const value = event.data.result;
          if (!value || value.version !== version || !Array.isArray(value.paths) || !value.paths.length) {
            throw new Error("Outdated or invalid converter result; hard-refresh the page.");
          }
          stop();
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", value.paths.map((points, i) =>
            "M " + points.map(([x, y]) => x + " " + (-y)).join(" L ") + (value.closed[i] ? " Z" : "")).join(" "));
          path.setAttribute("fill", "none"); path.setAttribute("stroke", "rgb(100,180,255)");
          path.setAttribute("stroke-width", "1.5"); path.setAttribute("vector-effect", "non-scaling-stroke");
          const margin = Math.max(value.width, value.height) * 0.03 || 1;
          preview.setAttribute("viewBox", [-margin, -value.height - margin, value.width + 2 * margin, value.height + 2 * margin].join(" "));
          preview.replaceChildren(path); result = value; download.disabled = false;
          const closed = value.closed.filter(Boolean).length;
          message("OK", value.paths.length + " paths (" + closed + " closed, " + (value.paths.length - closed) +
            " open), artboard " + value.width.toFixed(3) + " x " + value.height.toFixed(3) + " mm; curve tolerance " + value.tolerance + " mm." +
            excludedNote(value.excluded));
        } catch (error) { failed(error.message || "Could not preview the AI geometry."); }
      };
      worker.postMessage(bytes, [bytes]);
    } catch (error) {
      if (request === serial) { stop(); message("ERROR", error.message || "Could not read the AI file."); }
    }
  });
  download.addEventListener("click", async function () {
    if (!result || !consent.checked) return;
    try {
      const filename = ImageProfile.dxfFilename(get("filename").value);
      const blob = new Blob([ImageProfile.dxf(result.paths, result.closed)], { type: "application/dxf" });
      await triggerSaveFile(blob, filename, "application/dxf");
      const note = excludedNote(result.excluded);
      message("OK", "DXF save requested: " + filename + (note ? "." + note : ""));
    } catch (error) { message("ERROR", error.message || "Could not save the DXF."); }
  });
  message("IDLE", "Load a PDF-compatible AI file.");
})();
