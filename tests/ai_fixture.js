"use strict";

const { deflateSync } = require("node:zlib");

function stream(content, dictionary = "", compressed = false) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "latin1");
  const data = compressed ? deflateSync(bytes) : bytes;
  return Buffer.concat([Buffer.from(`<< ${dictionary} /Length ${data.length}${compressed ? " /Filter /FlateDecode" : ""} >>\nstream\n`),
    data, Buffer.from("\nendstream")]);
}

function fixture(content, { page = "", resources = "<< >>", objects = [], compressed = false, secondPage = false, trailer = "" } = {}) {
  const pageDictionary = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 512 512] /Resources ${resources} /Contents 4 0 R ${page} >>`;
  const all = [
    "<< /Type /Catalog /Pages 2 0 R >>",
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

module.exports = { fixture, stream };
