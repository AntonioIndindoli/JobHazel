import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, unzipSync } from "fflate";
import assert from "node:assert/strict";
import { readProductionRelease, root } from "./release.mjs";

const { manifest, files, extensionId } = await readProductionRelease();
const archive = zipSync(files, { level: 9 });
const extracted = unzipSync(archive);
assert.deepEqual(Object.keys(extracted).sort(), Object.keys(files).sort());
for (const name of Object.keys(files)) assert.deepEqual(Buffer.from(extracted[name]), files[name]);
const directory = path.join(root, "dist", "releases");
await mkdir(directory, { recursive: true });
const output = path.join(directory, `jobhazel-${manifest.version}.zip`);
await writeFile(output, archive);
console.log(`Production release: ${output}`);
console.log(`Unpacked extension origin: chrome-extension://${extensionId}`);
console.log("After the first store upload, use the dashboard public key and verify the store ID before publishing.");
