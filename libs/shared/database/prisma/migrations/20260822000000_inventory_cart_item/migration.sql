-- CreateTable
CREATE TABLE "inventory_cart_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_cart_items_tenantId_userId_idx" ON "inventory_cart_items"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_cart_items_tenantId_userId_articleVariantId_key" ON "inventory_cart_items"("tenantId", "userId", "articleVariantId");

-- AddForeignKey
ALTER TABLE "inventory_cart_items" ADD CONSTRAINT "inventory_cart_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_cart_items" ADD CONSTRAINT "inventory_cart_items_articleVariantId_fkey" FOREIGN KEY ("articleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: same pattern as every other tenant-scoped table (see tenant_settings
-- precedent) - new table created after the initial bulk rollout, so it
-- needs its own explicit ENABLE/FORCE/POLICY/GRANT block.
ALTER TABLE "inventory_cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_cart_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "inventory_cart_items"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory_cart_items" TO plexo_app;
