import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const environment = process.argv[2];
if (!["development", "production"].includes(environment)) {
  throw new Error("Specify development or production.");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist", environment);
const development = environment === "development";
const appUrl = development ? "http://localhost:3000/" : "https://jobhazel.com/";
const origins = development
  ? ["http://localhost:3000", "https://jobhazel.com"]
  : ["https://jobhazel.com"];
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
manifest.version = packageJson.version;
if (development) {
  manifest.name = "JobHazel (Development)";
  manifest.key = (await readFile(path.join(root, "development-key.txt"), "utf8")).trim();
  // Chrome match patterns do not restrict localhost's port. Phase 3 must also
  // validate sender origins against ALLOWED_APP_ORIGINS at runtime.
  manifest.externally_connectable.matches.push("http://localhost/*");
  const id = createHash("sha256").update(Buffer.from(manifest.key, "base64"))
    .digest("hex").slice(0, 32).replace(/[0-9a-f]/g, (digit) =>
      String.fromCharCode(97 + Number.parseInt(digit, 16)));
  console.log(`Development extension ID: ${id}`);
}

const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, outDir: output });
const result = program.emit();
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
if (diagnostics.length || result.emitSkipped) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  }));
}
await mkdir(path.join(output, "icons"), { recursive: true });
await copyFile(path.join(root, "assets", "icon.png"), path.join(output, "icons", "icon.png"));
await writeFile(path.join(output, "config.js"),
  `export const APP_URL = ${JSON.stringify(appUrl)};\nexport const ALLOWED_APP_ORIGINS = ${JSON.stringify(origins)};\n`);
await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${environment}: ${output}`);
