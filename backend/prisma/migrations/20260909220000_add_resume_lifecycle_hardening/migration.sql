CREATE TABLE "ResumeEndpointRateLimit" (
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeEndpointRateLimit_pkey" PRIMARY KEY ("userId", "endpoint")
);

CREATE TABLE "ResumeCleanupRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scannedCount" INTEGER NOT NULL DEFAULT 0,
    "deletedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "reclaimedBytes" BIGINT NOT NULL DEFAULT 0,
    "failureResumeIds" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResumeCleanupRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResumeEndpointRateLimit_windowStartedAt_idx" ON "ResumeEndpointRateLimit"("windowStartedAt");

ALTER TABLE "ResumeEndpointRateLimit"
ADD CONSTRAINT "ResumeEndpointRateLimit_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
