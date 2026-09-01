-- CreateTable
CREATE TABLE "tiendanube_product_mappings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articleVariantId" TEXT NOT NULL,
    "tiendanubeProductId" TEXT NOT NULL,
    "tiendanubeVariantId" TEXT NOT NULL,
    "lastPushedStock" DECIMAL(14,3),
    "lastPushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiendanube_product_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tiendanube_product_mappings_articleVariantId_key" ON "tiendanube_product_mappings"("articleVariantId");

-- CreateIndex
CREATE INDEX "tiendanube_product_mappings_tenantId_idx" ON "tiendanube_product_mappings"("tenantId");

-- AddForeignKey
ALTER TABLE "tiendanube_product_mappings" ADD CONSTRAINT "tiendanube_product_mappings_articleVariantId_fkey" FOREIGN KEY ("articleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT, mismo patrón que toda tabla tenant-scoped (ver
-- 20260912000000_tiendanube_orders).
ALTER TABLE "tiendanube_product_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tiendanube_product_mappings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tiendanube_product_mappings"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "tiendanube_product_mappings" TO plexo_app;
