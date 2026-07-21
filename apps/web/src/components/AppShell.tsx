'use client';

import { disconnectSocket } from '@/lib/socket';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Tablero' },
  { href: '/inventory', label: 'Inventario' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

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
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold tracking-tight text-indigo-400">PLEXO</span>
          <nav className="flex items-center gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition ${
                  pathname?.startsWith(link.href)
                    ? 'font-medium text-slate-100'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
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
