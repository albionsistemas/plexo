'use client';

import { disconnectSocket, getSocket } from '@/lib/socket';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Tablero' },
  { href: '/inventory', label: 'Inventario' },
  { href: '/profile', label: 'Perfil' },
];

interface PresenceUser {
  userId: string;
  name: string | null;
  email: string;
}

/** Decodes the JWT payload client-side just to read `sub` - no signature
 * check needed here, the token's validity is the API's problem; this is
 * only used to filter "myself" out of the online-colleagues list. */
function currentUserId(): string | null {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return (JSON.parse(atob(payload)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [online, setOnline] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.replace('/login');
      return;
    }

    const socket = getSocket();
    const selfId = currentUserId();

    socket.on('presence.snapshot', (data: { online: PresenceUser[] }) => {
      setOnline(data.online.filter((u) => u.userId !== selfId));
    });
    socket.on('presence.online', (user: PresenceUser) => {
      if (user.userId === selfId) return;
      setOnline((prev) => (prev.some((u) => u.userId === user.userId) ? prev : [...prev, user]));
    });
    socket.on('presence.offline', ({ userId }: { userId: string }) => {
      setOnline((prev) => prev.filter((u) => u.userId !== userId));
    });

    return () => {
      socket.off('presence.snapshot');
      socket.off('presence.online');
      socket.off('presence.offline');
    };
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
        <div className="flex items-center gap-5">
          <OnlineColleagues users={online} />
          <button
            onClick={handleLogout}
            className="text-sm text-slate-400 hover:text-slate-100 transition"
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}

function OnlineColleagues({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) {
    return null;
  }
  const names = users.map((u) => u.name || u.email).join(', ');
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400" title={names}>
      <span className="h-2 w-2 rounded-full bg-green-500" />
      {users.length} compañero{users.length !== 1 ? 's' : ''} en línea
    </div>
  );
}
