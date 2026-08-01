-- Snapshot of Person.avatarUrl at the moment a purchase order was sent via
-- WhatsApp, same denormalization reasoning as sentToContactName/sentToPhone
-- (see schema.prisma comment on PurchaseOrder). Nullable, no default -
-- orders sent before this field existed keep it null.
ALTER TABLE "purchase_orders" ADD COLUMN "sentToContactAvatarUrl" TEXT;
