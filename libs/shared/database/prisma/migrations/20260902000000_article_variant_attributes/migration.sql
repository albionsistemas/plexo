-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "hasVariants" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "article_variants" ADD COLUMN     "attributes" JSONB;
