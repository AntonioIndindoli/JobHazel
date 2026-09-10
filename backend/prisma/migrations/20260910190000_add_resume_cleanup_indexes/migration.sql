CREATE INDEX "ResumeCleanupRun_startedAt_idx" ON "ResumeCleanupRun"("startedAt");

CREATE INDEX "ResumeVersion_uploadStatus_updatedAt_idx" ON "ResumeVersion"("uploadStatus", "updatedAt");
