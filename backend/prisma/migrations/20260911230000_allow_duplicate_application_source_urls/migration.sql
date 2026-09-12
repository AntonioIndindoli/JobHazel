DROP INDEX IF EXISTS "Application_userId_sourceUrl_key";

CREATE INDEX "Application_userId_sourceUrl_idx"
ON "Application"("userId", "sourceUrl");
