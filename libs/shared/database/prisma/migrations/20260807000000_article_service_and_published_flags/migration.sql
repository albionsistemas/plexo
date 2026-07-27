-- AlterTable
ALTER TABLE "articles" ADD COLUMN "isService" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "articles" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
