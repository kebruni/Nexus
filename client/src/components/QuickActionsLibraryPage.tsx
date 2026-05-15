/**
 * Admin/operator page for managing the Quick-Actions library.
 *
 * Quick actions show up as one-click buttons on the agent detail
 * page. This page is the CRUD surface — create, edit, delete, set
 * the OS filter and a Lucide icon name.
 */
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Save, X, Zap } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useHasRole } from '../hooks/useCurrentUser';
import EmptyState from './EmptyState';

const API_BASE = '/api';
const VALID_OS: ReadonlyArray<'all' | 'windows' | 'linux' | 'macos'> = ['all', 'windows', 'linux', 'macos'];
const ICON_PRESETS = [
  'Zap', 'Play', 'RefreshCw', 'Trash2', 'Database', 'Wifi', 'Network',
  'ShieldCheck', 'HardDrive', 'Users', 'Power', 'Terminal', 'Settings',
  'AlertTriangle', 'Bug', 'Monitor', 'Cpu', 'MemoryStick',
];

interface QuickAction {
  id: string;
  name: string;
  description: string | null;
  command: string;
  os: typeof VALID_OS[number];
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  createdBy: string | null;
}

interface FormState {
  id: string | null;
  name: string;
  description: string;
  command: string;
  os: typeof VALID_OS[number];
  icon: string;
  sortOrder: number;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  description: '',
  command: '',
  os: 'all',
  icon: 'Zap',
  sortOrder: 100,
};

function authHeaders() {
  const t = localStorage.getItem('pc-hub-token') || '';
  return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
}

function pickIcon(name: string | null | undefined) {
  if (!name) return Zap;
  const Comp = (Icons as unknown as Record<string, typeof Zap>)[name];
  return Comp || Zap;
}

export default function QuickActionsLibraryPage() {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const canEdit = useHasRole('operator');
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/quick-actions`, { headers: authHeaders() });
      const j = (await r.json()) as { actions: QuickAction[] };
      setActions(j.actions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function startCreate() {
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
  }

  function startEdit(a: QuickAction) {
    setForm({
      id: a.id,
      name: a.name,
      description: a.description || '',
      command: a.command,
      os: a.os,
      icon: a.icon || 'Zap',
      sortOrder: a.sortOrder,
    });
    setShowForm(true);
    setError(null);
  }

  function cancel() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function save() {
    setError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      command: form.command,
      os: form.os,
      icon: form.icon.trim() || null,
      sortOrder: form.sortOrder,
    };
    if (!payload.name || !payload.command) {
      setError(t('quickActions.errNameCmd'));
      return;
    }
    try {
      const url = form.id ? `${API_BASE}/quick-actions/${form.id}` : `${API_BASE}/quick-actions`;
      const method = form.id ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      cancel();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(a: QuickAction) {
    if (!window.confirm(t('quickActions.confirmDelete').replace('{name}', a.name))) return;
    try {
      await fetch(`${API_BASE}/quick-actions/${a.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <header className="nx-page-head">
        <div className="nx-page-head-text">
          <div className="flex items-center gap-2">
            <Zap className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
            <h1 className="nx-page-title">{t('quickActions.libraryTitle')}</h1>
          </div>
          <p className="nx-page-sub">{t('quickActions.librarySubtitle')}</p>
          <div className={`mt-2 flex items-center gap-2 text-xs`}>
            <span className={`px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>One-click</span>
            <span className={`px-2 py-0.5 rounded-full ${isDark ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-sky-50 text-sky-600 border border-sky-200'}`}>Agent buttons</span>
            <span className={`px-2 py-0.5 rounded-full ${isDark ? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>Single command</span>
          </div>
        </div>
        {canEdit && (
          <button type="button" onClick={startCreate} className="nx-btn is-primary">
            <Plus className="w-4 h-4" />
            {t('quickActions.add')}
          </button>
        )}
      </header>

      {showForm && (
        <div className={`p-4 rounded-lg border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-gray-200'} space-y-3`}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{form.id ? t('quickActions.edit') : t('quickActions.create')}</h3>
            <button type="button" onClick={cancel} className="nx-btn">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase opacity-60">{t('quickActions.name')}</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="nx-input w-full"
                maxLength={80}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase opacity-60">{t('quickActions.os')}</span>
              <select
                value={form.os}
                onChange={(e) => setForm({ ...form, os: e.target.value as FormState['os'] })}
                className="nx-input w-full"
              >
                {VALID_OS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs uppercase opacity-60">{t('quickActions.description')}</span>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="nx-input w-full"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase opacity-60">{t('quickActions.command')}</span>
            <textarea
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              className="nx-input w-full font-mono text-sm"
              rows={3}
            />
          </label>
          <div className="block">
            <span className="text-xs uppercase opacity-60">{t('quickActions.icon')}</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICON_PRESETS.map((name) => {
                const Icon = pickIcon(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setForm({ ...form, icon: name })}
                    className={`nx-icon-pick ${form.icon === name ? 'is-active' : ''}`}
                    title={name}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>
          {error && <div className="nx-settings-action-error">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={save} className="nx-btn is-primary">
              <Save className="w-4 h-4" />
              {t('common.save')}
            </button>
            <button type="button" onClick={cancel} className="nx-btn">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {loading && <div className="opacity-60">{t('common.loading')}</div>}

      {!loading && actions.length === 0 && (
        <EmptyState
          icon={Zap}
          title={t('quickActions.emptyTitle')}
          description={t('quickActions.emptyDesc')}
        />
      )}

      {actions.length > 0 && (
        <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-zinc-800' : 'border-gray-200'}`}>
          <table className="w-full text-sm">
            <thead className={isDark ? 'bg-zinc-900/60' : 'bg-gray-50'}>
              <tr className="text-left">
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">{t('quickActions.name')}</th>
                <th className="px-3 py-2">{t('quickActions.os')}</th>
                <th className="px-3 py-2">{t('quickActions.command')}</th>
                <th className="px-3 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => {
                const Icon = pickIcon(a.icon);
                return (
                  <tr key={a.id} className={`border-t ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                    <td className="px-3 py-2"><Icon className="w-4 h-4 opacity-70" /></td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{a.name}</div>
                      {a.description && <div className="text-xs opacity-60">{a.description}</div>}
                    </td>
                    <td className="px-3 py-2"><span className="nx-pill is-muted">{a.os}</span></td>
                    <td className="px-3 py-2 font-mono text-xs opacity-80 truncate max-w-md">{a.command}</td>
                    <td className="px-3 py-2 text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => startEdit(a)} className="nx-btn">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => remove(a)} className="nx-btn is-danger-ghost">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
