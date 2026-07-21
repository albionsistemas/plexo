'use client';

import { disconnectSocket } from '@/lib/socket';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.replace('/login');
    }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('tenantId');
    disconnectSocket();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <span className="text-lg font-bold tracking-tight text-indigo-400">PLEXO</span>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-slate-100 transition"
        >
          Cerrar sesión
        </button>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
