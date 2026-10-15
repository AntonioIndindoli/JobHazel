import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const productionDirectory = path.join(root, "dist", "production");
export const runtimeFiles = [
  "api.js", "autofill.js", "autofill-panel.js", "capture.js", "config.js", "page-context.js", "protocol.js", "service-worker.js",
  "side-panel.js", "side-panel.html", "side-panel.css", "manifest.json", "icons/icon.png",
];

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), `${name}/`));
    else {
      assert.ok(entry.isFile(), `Unexpected release entry: ${name}`);
      files.push(name);
    }
  }
  return files;
}

export async function readProductionRelease() {
  const names = await listFiles(productionDirectory);
  assert.deepEqual(names.sort(), [...runtimeFiles].sort(), "Release must contain only runtime files.");
  const files = Object.fromEntries(await Promise.all(names.map(async (name) =>
    [name, await readFile(path.join(productionDirectory, name))])));
  const manifest = JSON.parse(files["manifest.json"].toString());
  const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.version, metadata.version, "Rebuild the production extension after changing its version.");
  assert.equal(manifest.name, "JobHazel");
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ["*://*/*"]);
  assert.equal(manifest.optional_host_permissions, undefined, "Page access must not require per-site requests.");
  assert.deepEqual(manifest.permissions, ["scripting", "storage", "sidePanel"]);
  assert.equal(manifest.content_security_policy.extension_pages,
    "script-src 'self'; object-src 'none'; connect-src https://api.jobhazel.com; base-uri 'none'");
  const config = files["config.js"].toString();
  assert.match(config, /export const BUILD_ENV = "production";/);
  assert.match(config, /export const APP_URL = "https:\/\/jobhazel\.com\/";/);
  assert.match(config, /export const API_URL = "https:\/\/api\.jobhazel\.com";/);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith(".png")) continue;
    // An SVG namespace inside a data URL identifies the format; it makes no request.
    assert.doesNotMatch(data.toString(), /localhost|127\.0\.0\.1|\[::1\]|http:\/\/(?!www\.w3\.org\/2000\/svg)/i,
      `Development endpoint in ${name}`);
  }
  assert.ok(manifest.key, "Missing extension public key.");
  const extensionId = createHash("sha256").update(Buffer.from(manifest.key, "base64"))
    .digest("hex").slice(0, 32).replace(/[0-9a-f]/g, (digit) =>
      String.fromCharCode(97 + Number.parseInt(digit, 16)));
  return { manifest, files, extensionId };
}
