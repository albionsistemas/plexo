'use client';

import { initials, profileApi } from '@/lib/profile';
import { disconnectSocket, getSocket } from '@/lib/socket';
import { useTheme } from '@/providers/ThemeProvider';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Tablero' },
  { href: '/inventory', label: 'Inventario' },
  { href: '/invoicing', label: 'Facturación' },
  { href: '/receivables', label: 'Cuentas a Cobrar' },
  { href: '/companies', label: 'Empresas' },
  { href: '/accounting', label: 'Contabilidad' },
  { href: '/taxes', label: 'Impuestos' },
  { href: '/reports', label: 'Reportes' },
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold tracking-tight text-indigo-600 dark:text-indigo-400">PLEXO</span>
          <nav className="flex items-center gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition ${
                  pathname?.startsWith(link.href)
                    ? 'font-medium text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-5">
          <OnlineColleagues users={online} />
          <UserMenu />
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
    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400" title={names}>
      <span className="h-2 w-2 rounded-full bg-green-500" />
      {users.length} compañero{users.length !== 1 ? 's' : ''} en línea
    </div>
  );
}

function UserMenu() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery({
    queryKey: ['profile-me'],
    queryFn: profileApi.getMe,
  });

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('tenantId');
    disconnectSocket();
    router.replace('/login');
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-transparent transition hover:ring-indigo-500/50"
        aria-label="Menú de usuario"
      >
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            {profile ? initials(profile.name, profile.email) : '·'}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 shadow-xl">
          {profile && (
            <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {profile.name || profile.email}
              </p>
              <p className="truncate text-xs text-slate-600 dark:text-slate-400">{profile.email}</p>
            </div>
          )}

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Perfil
          </Link>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="flex w-full items-center gap-3 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>

          <div className="mt-1 border-t border-slate-200 dark:border-slate-800 pt-1">
            <button
              onClick={handleLogout}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 1 0 20.354 15.354Z" />
    </svg>
  );
}
