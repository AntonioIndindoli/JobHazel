import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { migrationChecksumMatches } from "../../scripts/lib/migration-checksum.mjs";

test("release migration checks tolerate Windows checkouts but reject SQL changes", () => {
  const source = 'ALTER TABLE "Contact" ADD COLUMN "phone" TEXT;\n';
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const windows = source.replace(/\n/g, "\r\n");
  assert.equal(migrationChecksumMatches(Buffer.from(windows), hash(source)), true);
  assert.equal(migrationChecksumMatches(source, hash(windows)), true);
  assert.equal(migrationChecksumMatches(source.replace('"phone"', '"email"'), hash(source)), false);
  assert.equal(migrationChecksumMatches(source.trimEnd(), hash(source)), false);
});
