export default function PreferencesPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Preferencias</h1>
      <p className="text-sm text-slate-500">
        Todavía no hay preferencias generales configurables acá. El recordatorio recurrente de
        facturas vencidas se movió a Cuentas a Cobrar → pestaña Recordatorios.
      </p>
    </div>
  );
}
