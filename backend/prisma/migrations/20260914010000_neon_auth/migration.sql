-- Retain application IDs and legacy hashes only for one-time password migration.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "neonAuthId" UUID;
CREATE UNIQUE INDEX "User_neonAuthId_key" ON "User"("neonAuthId");
