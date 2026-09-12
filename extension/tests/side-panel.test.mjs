import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("side panel script references only elements present in its HTML", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../dist/development/side-panel.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/development/side-panel.js", import.meta.url), "utf8"),
  ]);
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const referencedIds = [...script.matchAll(/(?:element|input|textarea|select)\("([^"]+)"\)/g)]
    .map((match) => match[1]);
  const missing = [...new Set(referencedIds.filter((id) => !htmlIds.has(id)))];
  assert.deepEqual(missing, []);
  for (const view of ["loading", "login", "ready", "working", "review", "saved"]) {
    assert.ok(htmlIds.has(`${view}-view`), `missing ${view}-view`);
  }
});

test("captured applications default to applied", async () => {
  const script = await readFile(new URL("../dist/development/side-panel.js", import.meta.url), "utf8");
  assert.match(script, /select\("status"\)\.value = "APPLIED"/);
  assert.match(script, /renderStatusDot\("APPLIED"\)/);
});
