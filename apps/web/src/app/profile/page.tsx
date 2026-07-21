'use client';

import { profileApi, type UserProfile } from '@/lib/profile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Dueño',
  ADMIN: 'Administrador',
  SALES: 'Ventas',
  INVENTORY: 'Inventario',
  ACCOUNTANT: 'Contador',
  VIEWER: 'Solo lectura',
};

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const [first, second] = source.split(/\s+/).filter(Boolean);
  if (first && second) {
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile-me'],
    queryFn: profileApi.getMe,
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-100">Mi perfil</h1>
      {isLoading || !profile ? (
        <div className="text-slate-500">Cargando...</div>
      ) : (
        <>
          <AccountCard
            profile={profile}
            onSaved={() => void queryClient.invalidateQueries({ queryKey: ['profile-me'] })}
          />
          <PasswordCard />
        </>
      )}
    </div>
  );
}

function AccountCard({ profile, onSaved }: { profile: UserProfile; onSaved: () => void }) {
  const [name, setName] = useState(profile.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? '');
  const [showOnlinePresence, setShowOnlinePresence] = useState(profile.showOnlinePresence);
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () => profileApi.updateMe({ name, avatarUrl, showOnlinePresence }),
    onSuccess: () => {
      setMessage('Guardado');
      onSaved();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    mutation.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-400">Datos de la cuenta</h2>

      <div className="mb-6 flex items-center gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full border border-slate-700 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-lg font-semibold text-white">
            {initials(profile.name, profile.email)}
          </div>
        )}
        <div>
          <p className="text-slate-200">{profile.name || profile.email}</p>
          <p className="text-xs text-slate-500">{profile.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
          />
        </Field>
        <Field label="URL de avatar">
          <input
            className={inputClass}
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={showOnlinePresence}
            onChange={(e) => setShowOnlinePresence(e.target.checked)}
          />
          Mostrar mi estado en línea a mis compañeros
        </label>

        <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 text-xs sm:grid-cols-3">
          <div>
            <p className="text-slate-600">Rol</p>
            <p className="text-slate-300">{ROLE_LABELS[profile.role] ?? profile.role}</p>
          </div>
          <div>
            <p className="text-slate-600">Miembro desde</p>
            <p className="text-slate-300">
              {new Date(profile.createdAt).toLocaleDateString('es-AR')}
            </p>
          </div>
        </div>

        {message && <p className="text-sm text-green-400">{message}</p>}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const mutation = useMutation({
    mutationFn: () => profileApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setSuccess('Contraseña actualizada');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo cambiar la contraseña';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-400">Cambiar contraseña</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Contraseña actual">
          <input
            type="password"
            className={inputClass}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Contraseña nueva">
          <input
            type="password"
            className={inputClass}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>
        <Field label="Confirmar contraseña nueva">
          <input
            type="password"
            className={inputClass}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-400">{success}</p>}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {mutation.isPending ? 'Actualizando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  );
}

const inputClass =
  'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-400">{label}</label>
      {children}
    </div>
  );
}
