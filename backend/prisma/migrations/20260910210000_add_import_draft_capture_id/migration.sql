ALTER TABLE "ImportDraft" ADD COLUMN "captureId" TEXT;

CREATE UNIQUE INDEX "ImportDraft_userId_captureId_key"
ON "ImportDraft"("userId", "captureId");
