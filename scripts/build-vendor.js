"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const version = require("pdf-lib/package.json").version;
if (version !== "1.17.1") throw new Error("Review the AI parser and vendor paths before changing pdf-lib.");
const target = path.join(root, "vendor");
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(root, "node_modules", "pdf-lib", "dist", "pdf-lib.min.js"),
  path.join(target, `pdf-lib-${version}.min.js`));
const packages = ["pdf-lib", "@pdf-lib/standard-fonts", "@pdf-lib/upng", "pako", "tslib"];
const licenses = packages.map(pkg => {
  const directory = path.join(root, "node_modules", ...pkg.split("/"));
  const files = fs.readdirSync(directory).filter(file => /^(LICENSE|COPYING|NOTICE)(\.|$)/i.test(file));
  if (!files.length) throw new Error(`Missing redistribution license for ${pkg}`);
  return files.map(file => `${pkg} - ${file}\n\n${fs.readFileSync(path.join(directory, file), "utf8")}`).join("\n\n");
});
const streams = path.join(root, "node_modules", "pdf-lib", "src", "core", "streams");
const notices = fs.readdirSync(streams).sort().flatMap(file => {
  const headers = fs.readFileSync(path.join(streams, file), "utf8").match(/\/\*[\s\S]*?\*\//g) || [];
  return headers.filter(header => /Copyright/.test(header)).map(header => `pdf-lib/src/core/streams/${file}\n${header}`);
});
if (!notices.length) throw new Error("Missing PDF.js-derived stream notices.");
licenses.push("PDF.js-derived stream code (Apache-2.0)\n\n" + notices.join("\n\n") +
  "\n\n" + fs.readFileSync(path.join(target, "Apache-2.0.txt"), "utf8"));
fs.writeFileSync(path.join(target, "LICENSES.txt"), licenses.join("\n\n--------------------\n\n"));
console.log("Built pinned, locally served PDF parser and licenses.");
