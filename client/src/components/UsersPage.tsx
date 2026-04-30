import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Plus, Trash2, Key, RefreshCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { Role } from '../api/auth';

const API_BASE = '/api';
const ROLES: Role[] = ['viewer', 'operator', 'admin'];

interface UserRow {
  username: string;
  role: Role;
  mustChangePassword: boolean;
  createdAt: string | null;
}

export default function UsersPage() {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const me = useCurrentUser();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('viewer');

  const token = localStorage.getItem('pc-hub-token');
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  );

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/users`, { headers });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setNewUsername('');
      setNewPassword('');
      setNewRole('viewer');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (username: string) => {
    if (!window.confirm(t('users.confirmDelete', { username }))) return;
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRoleChange = async (username: string, role: Role) => {
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}/role`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResetPassword = async (username: string) => {
    const pwd = window.prompt(t('users.promptNewPassword', { username }));
    if (!pwd) return;
    if (pwd.length < 8) {
      window.alert(t('users.passwordTooShort'));
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}/password`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ newPassword: pwd }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      window.alert(t('users.passwordResetOk', { username }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const roleBadge = (role: Role) => {
    const cls =
      role === 'admin'
        ? isDark
          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
          : 'bg-blue-50 border-blue-200 text-blue-700'
        : role === 'operator'
          ? isDark
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : isDark
            ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
            : 'bg-gray-100 border-gray-200 text-gray-700';
    return (
      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border font-semibold ${cls}`}>
        {role}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto py-4 sm:py-8 px-1 sm:pr-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight flex items-center gap-2`}>
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            {t('users.title')}
          </h2>
          <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'} mt-1`}>{t('users.subtitle')}</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition disabled:opacity-50 ${isDark ? 'border-zinc-700 hover:bg-zinc-900 text-zinc-300' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('users.refresh')}
        </button>
      </div>

      {error && (
        <div className={`px-4 py-2 rounded-lg text-sm ${isDark ? 'bg-red-500/10 border border-red-500/30 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {error}
        </div>
      )}

      {/* Roles legend */}
      <div className={`text-xs ${isDark ? 'text-zinc-500 bg-[#121212] border-zinc-800' : 'text-gray-600 bg-white border-gray-200'} border rounded-xl p-3 leading-relaxed`}>
        <div className="font-semibold mb-1.5">{t('users.legendTitle')}:</div>
        <div><span className="font-mono font-bold mr-1">viewer</span> — {t('users.legendViewer')}</div>
        <div><span className="font-mono font-bold mr-1">operator</span> — {t('users.legendOperator')}</div>
        <div><span className="font-mono font-bold mr-1">admin</span> — {t('users.legendAdmin')}</div>
      </div>

      {/* New user form */}
      <form onSubmit={handleCreate} className={`flex flex-wrap gap-2 ${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-xl p-3`}>
        <input
          required
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder={t('users.username')}
          className={`flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} outline-none`}
        />
        <input
          required
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={t('users.password')}
          minLength={8}
          className={`flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} outline-none`}
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as Role)}
          className={`px-2 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r} className="text-gray-900 bg-white">{r}</option>
          ))}
        </select>
        <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors">
          <Plus className="w-4 h-4" />
          {t('users.add')}
        </button>
      </form>

      {/* Users table */}
      <div className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={`text-left text-[11px] uppercase tracking-wider ${isDark ? 'text-zinc-500 border-b border-zinc-800' : 'text-gray-400 border-b border-gray-200'}`}>
              <th className="px-4 py-2.5">{t('users.username')}</th>
              <th className="px-4 py-2.5">{t('users.role')}</th>
              <th className="px-4 py-2.5">{t('users.created')}</th>
              <th className="px-4 py-2.5 text-right">{t('users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = me?.username === u.username;
              return (
                <tr key={u.username} className={`${isDark ? 'border-b border-zinc-900 last:border-0' : 'border-b border-gray-100 last:border-0'}`}>
                  <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {u.username}
                    {isMe && <span className={`ml-2 text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>({t('users.you')})</span>}
                    {u.mustChangePassword && (
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        {t('users.mustChange')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.username, e.target.value as Role)}
                      className={`text-xs px-2 py-1 rounded-md border ${isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="text-gray-900 bg-white">{r}</option>
                      ))}
                    </select>
                    <span className="ml-2 align-middle">{roleBadge(u.role)}</span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleResetPassword(u.username)}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border mr-1.5 transition ${isDark ? 'border-zinc-700 hover:bg-zinc-900 text-zinc-300' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
                      title={t('users.resetPassword')}
                    >
                      <Key className="w-3 h-3" />
                      {t('users.resetPassword')}
                    </button>
                    <button
                      onClick={() => handleDelete(u.username)}
                      disabled={isMe}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      title={isMe ? t('users.cannotDeleteSelf') : t('users.delete')}
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('users.delete')}
                    </button>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className={`px-4 py-8 text-center text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                  {t('users.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
