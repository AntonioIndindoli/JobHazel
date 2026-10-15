import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readProductionRelease } from "../scripts/release.mjs";

test("production release contains only runtime files and production endpoints", async () => {
  const { manifest, extensionId } = await readProductionRelease();
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(extensionId, /^[a-p]{32}$/);
});

test("development uses persistent website access and keeps its local API network policy", async () => {
  const manifest = JSON.parse(await readFile(new URL("../dist/development/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.host_permissions, ["*://*/*"]);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.equal(manifest.name, "JobHazel (Development)");
  assert.match(manifest.content_security_policy.extension_pages, /connect-src http:\/\/localhost:4000;/);
});
