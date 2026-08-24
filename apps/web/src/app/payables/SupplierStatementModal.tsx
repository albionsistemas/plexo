'use client';

import SupplierStatementView from './SupplierStatementView';

interface Props {
  supplierId: string;
  onClose: () => void;
}

export default function SupplierStatementModal({ supplierId, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cuenta Corriente</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <SupplierStatementView supplierId={supplierId} />
      </div>
    </div>
  );
}
