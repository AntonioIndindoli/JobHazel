ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'TASK_DIGEST';
CREATE TABLE "NotificationOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "kind" "NotificationKind" NOT NULL,
  "resourceId" TEXT,
  "familyKey" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "digestKey" TEXT UNIQUE,
  "desired" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sendAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB,
  "providerId" TEXT UNIQUE,
  "firstAttemptAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "providerEvent" TEXT,
  "providerEventAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "NotificationOperation_userId_kind_resourceId_idx" ON "NotificationOperation"("userId", "kind", "resourceId");
CREATE INDEX "NotificationOperation_desired_status_nextAttemptAt_idx" ON "NotificationOperation"("desired", "status", "nextAttemptAt");
CREATE INDEX "NotificationOperation_familyKey_createdAt_idx" ON "NotificationOperation"("familyKey", "createdAt");
CREATE TABLE "NotificationSync" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "NotificationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cursor" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "NotificationProviderEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "NotificationProviderEvent_providerId_eventAt_idx" ON "NotificationProviderEvent"("providerId", "eventAt");
