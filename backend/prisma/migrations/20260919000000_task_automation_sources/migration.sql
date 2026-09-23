ALTER TABLE "Task" ADD COLUMN "sourceApplicationId" TEXT,
                   ADD COLUMN "sourceInterviewId" TEXT;

-- Only activity records emitted by automation prove provenance. Never infer
-- automation from a user-editable task title or type alone.
CREATE TEMP TABLE task_automation_sources AS
SELECT DISTINCT t."id", t."completedAt", t."createdAt",
  CASE WHEN l."message" = 'Thank-you task added after interview'
    THEN i."id" END AS interview_id,
  CASE WHEN l."message" LIKE 'Follow-up task added for %'
    THEN a."id" END AS application_id
FROM "Task" t
JOIN "ActivityLog" l ON l."metadata"->>'taskId' = t."id"
  AND l."userId" = t."userId" AND l."type" = 'TASK_ADDED'
LEFT JOIN "Interview" i ON i."id" = l."metadata"->>'interviewId' AND i."userId" = t."userId"
LEFT JOIN "Application" a ON a."id" = l."applicationId" AND a."userId" = t."userId"
WHERE (l."message" = 'Thank-you task added after interview' AND i."id" IS NOT NULL)
   OR (l."message" LIKE 'Follow-up task added for %' AND a."id" IS NOT NULL);

-- Prefer a completed task so an already-finished action is not requested again.
CREATE TEMP TABLE task_automation_ranked AS
SELECT *, row_number() OVER (
  PARTITION BY interview_id, application_id
  ORDER BY ("completedAt" IS NOT NULL) DESC, "createdAt", "id"
) AS rank FROM task_automation_sources;

DELETE FROM "Task" t USING task_automation_ranked s
WHERE t."id" = s."id" AND s.rank > 1 AND t."completedAt" IS NULL;

UPDATE "Task" t SET "sourceApplicationId" = s.application_id,
  "sourceInterviewId" = s.interview_id
FROM task_automation_ranked s WHERE t."id" = s."id" AND s.rank = 1;

DELETE FROM "Task" t USING "Interview" i
WHERE t."sourceInterviewId" = i."id" AND i."outcome" = 'CANCELED'
  AND t."completedAt" IS NULL;

DROP TABLE task_automation_ranked;
DROP TABLE task_automation_sources;

CREATE UNIQUE INDEX "Task_sourceApplicationId_key" ON "Task"("sourceApplicationId");
CREATE UNIQUE INDEX "Task_sourceInterviewId_key" ON "Task"("sourceInterviewId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceApplicationId_fkey"
  FOREIGN KEY ("sourceApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceInterviewId_fkey"
  FOREIGN KEY ("sourceInterviewId") REFERENCES "Interview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
