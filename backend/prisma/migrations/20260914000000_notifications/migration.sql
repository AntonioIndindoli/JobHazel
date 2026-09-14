CREATE TYPE "NotificationKind" AS ENUM ('UPCOMING_TASK', 'OVERDUE_TASK', 'INTERVIEW_REMINDER');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'CANCELED', 'FAILED', 'UNKNOWN');

CREATE TABLE "NotificationPreference" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "upcomingTasks" BOOLEAN NOT NULL DEFAULT true,
  "overdueTasks" BOOLEAN NOT NULL DEFAULT true,
  "interviewReminders" BOOLEAN NOT NULL DEFAULT true,
  "taskReminderDays" INTEGER NOT NULL DEFAULT 1 CHECK ("taskReminderDays" BETWEEN 0 AND 7),
  "interviewReminderMinutes" INTEGER NOT NULL DEFAULT 60 CHECK ("interviewReminderMinutes" BETWEEN 5 AND 10080),
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
  "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "resourceId" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "firstAttemptAt" TIMESTAMP(3),
  "payload" JSONB,
  "providerId" TEXT,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationDelivery_dedupeKey_key" ON "NotificationDelivery"("dedupeKey");
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");
CREATE INDEX "NotificationDelivery_status_leaseUntil_idx" ON "NotificationDelivery"("status", "leaseUntil");
CREATE INDEX "NotificationDelivery_userId_createdAt_idx" ON "NotificationDelivery"("userId", "createdAt");
