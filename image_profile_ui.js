"use strict";

const ImageProfileUI = (function () {
  const get = id => document.getElementById("profile-" + id);
  const fields = ["width", "height", "lock", "threshold", "simplify", "invert", "frame", "frame-width", "frame-height"];
  const svg = get("preview"), status = get("status"), download = get("download");
  let image = null, paths = null, timer = null, fileSize = 0;

  function clear(message) {
    paths = null;
    download.disabled = true;
    svg.replaceChildren();
    status.textContent = message;
  }
  function number(id) {
    const value = get(id).value;
    return value.trim() === "" ? NaN : Number(value);
  }
  function format(value) { return String(Number(value.toFixed(3))); }
  function aspect(changed) {
    if (!image || !get("lock").checked) return;
    const value = number(changed);
    if (!Number.isFinite(value) || value <= 0) return;
    if (changed === "height") get("width").value = format(value * image.naturalWidth / image.naturalHeight);
    else get("height").value = format(value * image.naturalHeight / image.naturalWidth);
  }
  function render() {
    timer = null;
    if (!image) return;
    try {
      if (fileSize > 20 * 1024 * 1024 || image.naturalWidth * image.naturalHeight > 20000000 ||
          Math.max(image.naturalWidth, image.naturalHeight) > 8192) {
        throw new Error("Image exceeds the profile limit of 20 MiB, 20 megapixels or 8192 pixels per side.");
      }
      const width = image.naturalWidth, height = image.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas is unavailable.");
      ctx.drawImage(image, 0, 0, width, height);
      const loops = ImageProfile.trace(ctx.getImageData(0, 0, width, height).data, width, height,
        number("threshold"), get("invert").checked, number("simplify"));
      if (!loops.length) throw new Error("No outlines found; adjust the threshold or invert setting.");
      const imageWidth = number("width"), imageHeight = number("height");
      const frame = get("frame").checked ? { width: number("frame-width"), height: number("frame-height") } : null;
      const result = ImageProfile.geometry(loops, width, height, imageWidth, imageHeight, frame);
      const boundsWidth = frame ? frame.width : imageWidth, boundsHeight = frame ? frame.height : imageHeight;
      const minX = frame ? (imageWidth - frame.width) / 2 : 0;
      const minY = frame ? (imageHeight - frame.height) / 2 : 0;
      const margin = Math.max(boundsWidth, boundsHeight) * 0.04;
      svg.setAttribute("viewBox", [minX - margin, -minY - boundsHeight - margin, boundsWidth + 2 * margin, boundsHeight + 2 * margin].join(" "));
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", result.map(loop => "M " + loop.map(([x, y]) => x + " " + (-y)).join(" L ") + " Z").join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#64b4ff");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("vector-effect", "non-scaling-stroke");
      svg.replaceChildren(path);
      paths = result;
      download.disabled = false;
      status.textContent = "[ OK ] " + loops.length + " closed outlines (traced at source " + width + " x " + height + " px)";
    } catch (error) {
      clear("[ ERROR ] " + (error.message || "Could not trace image."));
    }
  }
  function schedule() {
    if (timer !== null) clearTimeout(timer);
    clear(image ? "[ BUSY ] updating outlines..." : "[ IDLE ] load an image to trace");
    if (image) timer = setTimeout(render, 100);
  }
  fields.forEach(id => get(id).addEventListener("input", function () {
    if (id === "width" || id === "height") aspect(id);
    if (id === "lock" && get("lock").checked) aspect("width");
    get("threshold-value").textContent = get("threshold").value;
    get("simplify-value").textContent = get("simplify").value;
    schedule();
  }));
  download.addEventListener("click", function () {
    if (!paths) return;
    const url = URL.createObjectURL(new Blob([ImageProfile.dxf(paths)], { type: "application/dxf" }));
    const link = document.createElement("a");
    link.href = url; link.download = "image-profile.dxf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return {
    setImage(value, size) {
      image = value;
      fileSize = size || 0;
      if (image) {
        aspect("width");
        get("frame-width").value = format(number("width") + 10);
        get("frame-height").value = format(number("height") + 10);
      }
      schedule();
    }
  };
})();
