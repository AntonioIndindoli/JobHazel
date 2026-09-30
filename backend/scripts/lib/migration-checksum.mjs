import { createHash } from "node:crypto";

// Prisma accepts platform line-ending differences. Preserve every other byte
// so a real edit to an already-applied migration still fails verification.
export function migrationChecksumMatches(source, expected) {
  const text = Buffer.isBuffer(source) ? source.toString("utf8") : source;
  const lf = text.replace(/\r\n/g, "\n");
  return [text, lf, lf.replace(/\n/g, "\r\n")].some((value) =>
    createHash("sha256").update(value).digest("hex") === expected);
}
