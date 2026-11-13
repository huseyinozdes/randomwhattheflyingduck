"use strict";

const { deflateSync } = require("node:zlib");

function stream(content, dictionary = "", compressed = false) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "latin1");
  const data = compressed ? deflateSync(bytes) : bytes;
  return Buffer.concat([Buffer.from(`<< ${dictionary} /Length ${data.length}${compressed ? " /Filter /FlateDecode" : ""} >>\nstream\n`),
    data, Buffer.from("\nendstream")]);
}

function fixture(content, { page = "", resources = "<< >>", objects = [], compressed = false, secondPage = false, trailer = "", catalog = "" } = {}) {
  const pageDictionary = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 512 512] /Resources ${resources} /Contents 4 0 R ${page} >>`;
  const all = [
    `<< /Type /Catalog /Pages 2 0 R ${catalog} >>`,
    `<< /Type /Pages /Kids [3 0 R${secondPage ? ` ${objects.length + 5} 0 R` : ""}] /Count ${secondPage ? 2 : 1} >>`,
    pageDictionary,
    stream(content, "", compressed),
    ...objects,
  ];
  if (secondPage) all.push(pageDictionary);
  const chunks = [Buffer.from("%PDF-1.7\n% synthetic PDF-compatible AI test fixture, not Illustrator-generated\n")];
  const offsets = [0];
  let position = chunks[0].length;
  all.forEach((object, i) => {
    offsets.push(position);
    const bytes = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(object) ? object : Buffer.from(object, "latin1"), Buffer.from("\nendobj\n")]);
    chunks.push(bytes); position += bytes.length;
  });
  const xref = `xref\n0 ${all.length + 1}\n0000000000 65535 f \n` +
    offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Root 1 0 R /Size ${all.length + 1} ${trailer} >>\nstartxref\n${position}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(chunks));
}

const group = (name, extra = "") => `<< /Type /OCG /Name (${name}) /Intent [/View /Design] ${extra} >>`;

// Layers are objects 5.. in order (content names them /MC0, /MC1, ...); any further `objects` follow them.
function layered(content, { groups = [group("Layer 1")], config = "/ON [5 0 R]", extra = "", objects = [], properties, catalog, ...options } = {}) {
  const refs = groups.map((_, i) => `${5 + i} 0 R`).join(" ");
  return fixture(content, { ...options, objects: [...groups, ...objects],
    resources: `<< /Properties << ${properties ?? groups.map((_, i) => `/MC${i} ${5 + i} 0 R`).join(" ")} >> ${extra} >>`,
    catalog: catalog ?? `/OCProperties << /OCGs [${refs}] /D << ${config} >> >>` });
}

module.exports = { fixture, stream, group, layered };
