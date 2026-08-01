'use client';

import CompanyListView from '@/components/CompanyListView';

export default function SuppliersPage() {
  return <CompanyListView role="SUPPLIER" editable title="Proveedores" newLabel="+ Nuevo proveedor" />;
}
