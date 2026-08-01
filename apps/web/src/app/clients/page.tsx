'use client';

import CompanyListView from '@/components/CompanyListView';

export default function ClientsPage() {
  return <CompanyListView role="CUSTOMER" editable title="Clientes" newLabel="+ Nuevo cliente" />;
}
