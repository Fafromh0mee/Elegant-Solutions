-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "access_tokens" ADD COLUMN     "status" "RequestStatus" NOT NULL DEFAULT 'PENDING';
