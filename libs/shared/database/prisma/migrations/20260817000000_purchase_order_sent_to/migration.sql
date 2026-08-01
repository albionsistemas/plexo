-- AlterTable: snapshot of who a PurchaseOrder was actually sent to (see
-- schema.prisma comment) - denormalized, nothing here is a foreign key.
ALTER TABLE "purchase_orders" ADD COLUMN "sentToEmail" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "sentToPhone" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "sentToContactName" TEXT;
