import Image from 'next/image';

export default function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
      <Image src="/logo.svg" alt="PLEXO" width={64} height={64} priority />
      <h1 className="text-3xl font-semibold tracking-tight">PLEXO</h1>
      <p className="text-slate-400">ERP SaaS — workspace inicializado.</p>
    </main>
  );
}
