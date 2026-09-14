-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum: replace Role enum values and migrate STAFF -> STUDENT
CREATE TYPE "Role_new" AS ENUM ('GUEST', 'STUDENT', 'ADMIN', 'SUPER_ADMIN');

ALTER TABLE "users"
ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "users"
ALTER COLUMN "role" TYPE "Role_new"
USING (
  CASE
    WHEN "role"::text = 'STAFF' THEN 'STUDENT'
    ELSE "role"::text
  END
)::"Role_new";

ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";

ALTER TABLE "users"
ALTER COLUMN "role" SET DEFAULT 'GUEST';

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "studentId" TEXT,
ADD COLUMN "faculty" TEXT,
ADD COLUMN "major" TEXT,
ALTER COLUMN "hashedPassword" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_studentId_key" ON "users"("studentId");
