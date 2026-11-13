"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { convert, version } = require("../ai_profile");
const { dxf, dxfFilename } = require("../image_profile");
const { group, layered } = require("./ai_fixture");

// Runs the shipped UI script against the real converter; the fake Worker only replaces the thread boundary.
async function session(bytes, { tamper } = {}) {
  const elements = new Map(), saved = [], workers = [];
  for (const id of ["file", "geometry", "convert", "download", "preview", "status", "filename"]) {
    elements.set("ai-" + id, {
      value: "", checked: false, disabled: false, files: [], attributes: {},
      addEventListener(type, handler) { this[type] = handler; },
      replaceChildren(child) { this.child = child; },
      setAttribute(key, value) { this.attributes[key] = value; },
    });
  }
  class FakeWorker {
    constructor() { workers.push(this); }
    postMessage(buffer) {
      this.done = convert(new Uint8Array(buffer))
        .then(result => ({ result: tamper ? tamper(result) : result }), error => ({ error: error.message }))
        .then(data => this.onmessage({ data }));
    }
    terminate() {}
  }
  const context = {
    document: {
      getElementById: id => elements.get(id),
      createElementNS: () => ({ attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }),
    },
    ImageProfile: { version, dxf, dxfFilename }, Worker: FakeWorker, Blob, location: { protocol: "http:" },
    setTimeout: () => 1, clearTimeout() {},
    triggerSaveFile: async (blob, filename) => { saved.push({ filename, text: await blob.text() }); },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "ai_profile_ui.js"), "utf8"), context);
  const get = id => elements.get("ai-" + id);
  async function load(next) {
    get("file").files = [{ name: "art.ai", size: next.length, arrayBuffer: async () => next.slice().buffer }];
    get("file").change();
    get("geometry").checked = true;
    get("geometry").change();
    await get("convert").click();
    await workers.at(-1).done;
  }
  await load(bytes);
  return { saved, get, load, status: () => get("status").textContent, save: () => get("download").click() };
}

const rectangle = x => `${x} 100 10 10 re f`;

test("AI UI reports hidden-layer exclusions in the status and again when saving", async () => {
  const content = `/OC /MC0 BDC ${rectangle(100)} EMC /OC /MC1 BDC ${rectangle(300)} 410 410 m 420 420 l S EMC`;
  const bytes = layered(content, { groups: [group("Artwork"), group("Hidden <b>notes</b>")], config: "/ON [5 0 R] /OFF [6 0 R]" });
  const ui = await session(bytes);
  assert.match(ui.status(), /^\[OK\] 1 paths \(1 closed, 0 open\)/);
  assert.ok(ui.status().includes("Hidden layer artwork was not exported (2 paths, 0 other objects) in: Hidden <b>notes</b>."));
  assert.ok(ui.status().endsWith(` | exporter ${version}`));
  assert.equal(ui.get("download").disabled, false);
  await ui.save();
  const expected = await convert(bytes);
  assert.equal(ui.saved[0].filename, "art.dxf");
  assert.equal(ui.saved[0].text, dxf(expected.paths, expected.closed));
  assert.ok(ui.status().includes("DXF save requested: art.dxf. Hidden layer artwork was not exported (2 paths"));
});

test("AI UI leaves fully visible results unchanged and bounds the listed hidden layers", async () => {
  const visible = await session(layered(`/OC /MC0 BDC ${rectangle(100)} EMC`));
  assert.ok(!visible.status().includes("Hidden layer"));
  assert.match(visible.status(), /curve tolerance 0\.01 mm\. \| exporter /);

  const groups = ["Shown", ..."ABCDEFG"].map(name => group(name));
  const content = groups.map((_, i) => `/OC /MC${i} BDC ${rectangle(100 + 50 * i)} EMC`).join(" ");
  const many = await session(layered(content, { groups, config: "/ON [5 0 R] /OFF [6 0 R 7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R]" }));
  assert.ok(many.status().includes("(7 paths, 0 other objects) in: A, B, C, D, E, ..."));
  assert.ok(!/\bF\b/.test(many.status()));
});

test("AI UI clears the preview and download for rejected or stale converter results", async () => {
  const hiddenOnly = layered(`/OC /MC1 BDC ${rectangle(100)} EMC`,
    { groups: [group("Shown"), group("Hidden")], config: "/ON [5 0 R] /OFF [6 0 R]" });
  const ok = layered(`/OC /MC0 BDC ${rectangle(100)} EMC`);

  const hidden = await session(ok);
  assert.equal(hidden.get("download").disabled, false);
  assert.ok(hidden.get("preview").child, "a successful conversion populates the preview");
  // A rejected file must not leave the previous file's preview or download behind.
  await hidden.load(hiddenOnly);
  assert.match(hidden.status(), /^\[ERROR\] All vector artwork is in hidden layers/);
  assert.equal(hidden.get("download").disabled, true);
  assert.equal(hidden.get("preview").child, undefined);

  const stale = await session(ok, { tamper: result => ({ ...result, version: "0.0.1" }) });
  assert.match(stale.status(), /^\[ERROR\] Outdated or invalid converter result; hard-refresh the page/);
  assert.equal(stale.get("download").disabled, true);
  assert.equal(stale.get("preview").child, undefined);
});
