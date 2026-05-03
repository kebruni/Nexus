import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Plus,
  Trash2,
  Edit3,
  Play,
  RefreshCw,
  Pause,
  Power,
} from 'lucide-react';
import type { Agent } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useHasRole } from '../hooks/useCurrentUser';
import EmptyState from './EmptyState';

const API_BASE = '/api';

type BulkAction = 'execute' | 'reboot' | 'shutdown' | 'lockscreen' | 'alarm';

interface Group {
  name: string;
  color?: string;
}

interface ScheduleTarget {
  kind: 'group' | 'agentIds';
  value: string | string[];
}

interface Schedule {
  id: string;
  name: string;
  cron: string;
  action: BulkAction;
  command: string | null;
  target: ScheduleTarget;
  enabled: boolean;
  createdAt: string;
  createdBy: string | null;
  lastRunAt: string | null;
  lastResult: { sent: number; skipped: number; error: string | null } | null;
}

const PRESETS: Array<[string, string]> = [
  ['* * * * *', 'schedules.preset.everyMin'],
  ['*/5 * * * *', 'schedules.preset.every5'],
  ['*/15 * * * *', 'schedules.preset.every15'],
  ['0 * * * *', 'schedules.preset.hourly'],
  ['0 3 * * *', 'schedules.preset.daily3am'],
  ['0 9 * * 1-5', 'schedules.preset.weekday9'],
  ['0 3 * * 1', 'schedules.preset.monday3am'],
  ['0 0 1 * *', 'schedules.preset.firstOfMonth'],
];

const ACTIONS: Array<{ value: BulkAction; key: string }> = [
  { value: 'execute', key: 'schedules.actionExecute' },
  { value: 'reboot', key: 'schedules.actionReboot' },
  { value: 'shutdown', key: 'schedules.actionShutdown' },
  { value: 'lockscreen', key: 'schedules.actionLockscreen' },
  { value: 'alarm', key: 'schedules.actionAlarm' },
];

interface FormState {
  id: string | null;
  name: string;
  cron: string;
  action: BulkAction;
  command: string;
  targetKind: 'group' | 'agentIds';
  groupName: string;
  agentIds: string[];
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  cron: '0 3 * * *',
  action: 'reboot',
  command: '',
  targetKind: 'group',
  groupName: '',
  agentIds: [],
  enabled: true,
};

export default function SchedulesPage() {
  const { t, lang } = useLanguage();
  const { isDark } = useTheme();
  const { toast } = useToast();
  const canEdit = useHasRole('operator');

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const headers = useMemo(() => {
    const t = localStorage.getItem('pc-hub-token');
    return {
      'Content-Type': 'application/json',
      Authorization: t ? `Bearer ${t}` : '',
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, g, a] = await Promise.all([
        fetch(`${API_BASE}/schedules`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/groups`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/agents`, { headers }).then((r) => r.json()),
      ]);
      setSchedules(s.schedules || []);
      setGroups(Array.isArray(g) ? g : []);
      setAgents(Array.isArray(a) ? a : []);
    } catch (err) {
      console.error('Failed to load schedules:', err);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, groupName: groups[0]?.name || '' });
    setShowForm(true);
  };

  const openEdit = (s: Schedule) => {
    setForm({
      id: s.id,
      name: s.name,
      cron: s.cron,
      action: s.action,
      command: s.command || '',
      targetKind: s.target.kind,
      groupName: s.target.kind === 'group' ? (s.target.value as string) : '',
      agentIds: s.target.kind === 'agentIds' ? (s.target.value as string[]) : [],
      enabled: s.enabled,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast(t('schedules.name'), 'error');
      return;
    }
    if (form.action === 'execute' && !form.command.trim()) {
      toast(t('schedules.command'), 'error');
      return;
    }
    if (form.targetKind === 'group' && !form.groupName) {
      toast(t('schedules.targetGroup'), 'error');
      return;
    }
    if (form.targetKind === 'agentIds' && form.agentIds.length === 0) {
      toast(t('schedules.targetAgents'), 'error');
      return;
    }

    const body = {
      name: form.name.trim(),
      cron: form.cron.trim(),
      action: form.action,
      command: form.action === 'execute' ? form.command.trim() : null,
      target:
        form.targetKind === 'group'
          ? { kind: 'group', value: form.groupName }
          : { kind: 'agentIds', value: form.agentIds },
      enabled: form.enabled,
    };

    setSubmitting(true);
    try {
      const url = form.id ? `${API_BASE}/schedules/${form.id}` : `${API_BASE}/schedules`;
      const res = await fetch(url, {
        method: form.id ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error && /cron/i.test(err.error)) {
          toast(t('schedules.invalidCron').replace('{error}', err.error), 'error');
        } else {
          toast(err.error || `HTTP ${res.status}`, 'error');
        }
        return;
      }
      closeForm();
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (s: Schedule) => {
    if (!window.confirm(t('schedules.confirmDelete').replace('{name}', s.name))) return;
    const res = await fetch(`${API_BASE}/schedules/${s.id}`, { method: 'DELETE', headers });
    if (res.ok) await load();
  };

  const toggle = async (s: Schedule) => {
    const res = await fetch(`${API_BASE}/schedules/${s.id}/toggle`, { method: 'PATCH', headers });
    if (res.ok) await load();
  };

  const runNow = async (s: Schedule) => {
    const res = await fetch(`${API_BASE}/schedules/${s.id}/run-now`, { method: 'POST', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(t('schedules.runNowFailed').replace('{error}', data.error || `HTTP ${res.status}`), 'error');
      return;
    }
    const r = data.result || { sent: 0, skipped: 0 };
    toast(
      t('schedules.runNowOk')
        .replace('{name}', s.name)
        .replace('{sent}', String(r.sent || 0))
        .replace('{skipped}', String(r.skipped || 0)),
      'success',
    );
    await load();
  };

  const fmt = (iso: string | null) => {
    if (!iso) return t('schedules.never');
    return new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU');
  };

  const targetLabel = (s: Schedule) => {
    if (s.target.kind === 'group') return `📁 ${s.target.value as string}`;
    const ids = s.target.value as string[];
    if (ids.length <= 2) {
      return ids
        .map((id) => agents.find((a) => a.id === id)?.hostname || id.slice(0, 8))
        .join(', ');
    }
    return `${ids.length} agents`;
  };

  const inputBase = isDark
    ? 'bg-slate-800/50 border-slate-700 text-white placeholder-slate-500 focus:ring-blue-500'
    : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-400';

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {t('schedules.title')}
          </h1>
          <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} text-sm mt-1`}>
            {t('schedules.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => void load()}
            disabled={loading}
            className={`flex items-center gap-2 px-3 py-2 ${
              isDark
                ? 'bg-slate-700 text-slate-300 hover:text-white'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200'
            } rounded-lg transition text-sm`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('audit.refresh')}
          </button>
          {canEdit && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition text-sm"
            >
              <Plus className="w-4 h-4" />
              {t('schedules.create')}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div
          className={`${
            isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-sm'
          } border rounded-xl p-4 space-y-3`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'} block mb-1`}>
                {t('schedules.name')}
              </span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('schedules.namePlaceholder')}
                className={`w-full ${inputBase} border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1`}
              />
            </label>
            <label className="block">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'} block mb-1`}>
                {t('schedules.cron')}
              </span>
              <input
                value={form.cron}
                onChange={(e) => setForm({ ...form, cron: e.target.value })}
                placeholder="0 3 * * *"
                className={`w-full ${inputBase} border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1`}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'} mr-1 self-center`}>
              {t('schedules.cronPresetTitle')}:
            </span>
            {PRESETS.map(([cron, key]) => (
              <button
                key={cron}
                type="button"
                onClick={() => setForm({ ...form, cron })}
                className={`text-xs px-2 py-1 rounded ${
                  isDark
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {t(key as any)}
              </button>
            ))}
          </div>

          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
            {t('schedules.cronHelp')}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'} block mb-1`}>
                {t('schedules.action')}
              </span>
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value as BulkAction })}
                className={`w-full ${inputBase} border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1`}
              >
                {ACTIONS.map((a) => (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <option key={a.value} value={a.value}>{t(a.key as any)}</option>
                ))}
              </select>
            </label>
            {form.action === 'execute' && (
              <label className="block">
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'} block mb-1`}>
                  {t('schedules.command')}
                </span>
                <input
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder={t('schedules.commandPlaceholder')}
                  className={`w-full ${inputBase} border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1`}
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'} block mb-1`}>
                {t('schedules.target')}
              </span>
              <div className="flex gap-2 mb-2 text-xs">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, targetKind: 'group' })}
                  className={`px-2 py-1 rounded ${
                    form.targetKind === 'group'
                      ? 'bg-blue-600 text-white'
                      : isDark
                        ? 'bg-slate-700 text-slate-300'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {t('schedules.targetGroup')}
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, targetKind: 'agentIds' })}
                  className={`px-2 py-1 rounded ${
                    form.targetKind === 'agentIds'
                      ? 'bg-blue-600 text-white'
                      : isDark
                        ? 'bg-slate-700 text-slate-300'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {t('schedules.targetAgents')}
                </button>
              </div>
              {form.targetKind === 'group' ? (
                <select
                  value={form.groupName}
                  onChange={(e) => setForm({ ...form, groupName: e.target.value })}
                  className={`w-full ${inputBase} border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1`}
                >
                  <option value="">{t('schedules.selectGroup')}</option>
                  {groups.map((g) => (
                    <option key={g.name} value={g.name}>{g.name}</option>
                  ))}
                </select>
              ) : (
                <select
                  multiple
                  size={5}
                  value={form.agentIds}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      agentIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                    })
                  }
                  className={`w-full ${inputBase} border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1`}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.hostname} {a.status === 'online' ? '🟢' : '⚪'}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="w-4 h-4"
              />
              <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                {t('schedules.enabled')}
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={closeForm}
              className={`px-3 py-2 ${
                isDark
                  ? 'bg-slate-700 text-slate-300 hover:text-white'
                  : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
              } rounded-lg text-sm`}
            >
              {t('schedules.cancel')}
            </button>
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {t('schedules.save')}
            </button>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <div
          className={`${
            isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-sm'
          } border rounded-xl p-6`}
        >
          <EmptyState
            icon={CalendarClock}
            title={t('schedules.title')}
            description={loading ? t('audit.loading') : t('schedules.empty')}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div
              key={s.id}
              className={`${
                isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-sm'
              } border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-base font-semibold ${
                      isDark ? 'text-white' : 'text-gray-900'
                    } truncate`}
                  >
                    {s.name}
                  </span>
                  {!s.enabled && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400">
                      {t('schedules.disabled')}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    s.action === 'execute' ? 'bg-yellow-500/10 text-yellow-400' :
                    s.action === 'reboot' ? 'bg-orange-500/10 text-orange-400' :
                    s.action === 'shutdown' ? 'bg-red-500/10 text-red-400' :
                    s.action === 'lockscreen' ? 'bg-purple-500/10 text-purple-400' :
                    'bg-pink-500/10 text-pink-400'
                  }`}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {t(`schedules.action${s.action.charAt(0).toUpperCase() + s.action.slice(1)}` as any)}
                  </span>
                </div>
                <div className={`text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1 ${
                  isDark ? 'text-slate-400' : 'text-gray-500'
                }`}>
                  <span className="font-mono">{s.cron}</span>
                  <span>{targetLabel(s)}</span>
                  {s.command && (
                    <span className="font-mono truncate max-w-xs" title={s.command}>
                      $ {s.command}
                    </span>
                  )}
                </div>
                <div className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                  {t('schedules.lastRun')}: {fmt(s.lastRunAt)}
                  {s.lastResult && !s.lastResult.error && (
                    <>
                      {' — '}
                      <span className="text-emerald-400">
                        {t('schedules.resultSent').replace('{n}', String(s.lastResult.sent))}
                      </span>
                      {s.lastResult.skipped > 0 && (
                        <>
                          {', '}
                          <span className="text-amber-400">
                            {t('schedules.resultSkipped').replace('{n}', String(s.lastResult.skipped))}
                          </span>
                        </>
                      )}
                    </>
                  )}
                  {s.lastResult?.error && (
                    <span className="text-red-400"> — {s.lastResult.error}</span>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => void runNow(s)}
                    title={t('schedules.runNow')}
                    className="px-2 py-1.5 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-xs flex items-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {t('schedules.runNow')}
                  </button>
                  <button
                    onClick={() => void toggle(s)}
                    title={s.enabled ? t('schedules.disabled') : t('schedules.enabled')}
                    className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 ${
                      s.enabled
                        ? 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30'
                        : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                    }`}
                  >
                    {s.enabled ? <Pause className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => openEdit(s)}
                    title={t('schedules.edit')}
                    className={`px-2 py-1.5 rounded text-xs ${
                      isDark
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => void remove(s)}
                    title={t('schedules.delete')}
                    className="px-2 py-1.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
