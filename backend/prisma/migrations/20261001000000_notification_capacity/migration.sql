ALTER TABLE "NotificationRun" ADD COLUMN "discoveryCompletedAt" TIMESTAMP(3);
UPDATE "NotificationRun" SET "discoveryCompletedAt" = "completedAt" WHERE "completedAt" IS NOT NULL;

CREATE TABLE "ProviderRateLimit" (
  "scope" TEXT NOT NULL,
  "nextAllowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderRateLimit_pkey" PRIMARY KEY ("scope")
);

CREATE TABLE "NotificationWorkerState" (
  "id" TEXT NOT NULL,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastStartedAt" TIMESTAMP(3),
  "lastFinishedAt" TIMESTAMP(3),
  CONSTRAINT "NotificationWorkerState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationOperation_status_nextAttemptAt_idx" ON "NotificationOperation"("status", "nextAttemptAt");
CREATE INDEX "NotificationSync_updatedAt_idx" ON "NotificationSync"("updatedAt");
