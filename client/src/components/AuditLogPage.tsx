import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollText,
  RefreshCw,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
} from 'lucide-react';
import type { Agent, SystemEvent } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useHasRole } from '../hooks/useCurrentUser';
import EmptyState from './EmptyState';

const API_BASE = '/api';

interface AuditResponse {
  items: SystemEvent[];
  total: number;
  types: string[];
  actors: string[];
}

const PAGE_SIZES = [25, 50, 100, 200];

const TYPE_BADGE: Record<string, string> = {
  admin_login: 'text-blue-400 bg-blue-500/10',
  admin_password_changed: 'text-blue-400 bg-blue-500/10',
  '2fa_enabled': 'text-emerald-400 bg-emerald-500/10',
  '2fa_disabled': 'text-amber-400 bg-amber-500/10',
  '2fa_recovery_regenerated': 'text-amber-400 bg-amber-500/10',
  agent_connected: 'text-emerald-400 bg-emerald-500/10',
  agent_disconnected: 'text-red-400 bg-red-500/10',
  command_sent: 'text-yellow-400 bg-yellow-500/10',
  command_result: 'text-slate-400 bg-slate-500/10',
  command_reboot: 'text-orange-400 bg-orange-500/10',
  command_shutdown: 'text-red-400 bg-red-500/10',
  command_lock: 'text-purple-400 bg-purple-500/10',
  command_alarm: 'text-pink-400 bg-pink-500/10',
  file_download: 'text-cyan-400 bg-cyan-500/10',
  file_delete: 'text-red-400 bg-red-500/10',
  file_upload: 'text-cyan-400 bg-cyan-500/10',
  file_transfer: 'text-cyan-400 bg-cyan-500/10',
  service_action: 'text-purple-400 bg-purple-500/10',
  process_kill: 'text-red-400 bg-red-500/10',
  screen_start: 'text-pink-400 bg-pink-500/10',
  user_created: 'text-emerald-400 bg-emerald-500/10',
  user_deleted: 'text-red-400 bg-red-500/10',
  user_role_changed: 'text-amber-400 bg-amber-500/10',
  user_password_reset: 'text-amber-400 bg-amber-500/10',
  webhook_created: 'text-emerald-400 bg-emerald-500/10',
  webhook_updated: 'text-blue-400 bg-blue-500/10',
  webhook_deleted: 'text-red-400 bg-red-500/10',
  webhook_tested: 'text-blue-400 bg-blue-500/10',
  bulk_execute: 'text-yellow-400 bg-yellow-500/10',
  bulk_reboot: 'text-orange-400 bg-orange-500/10',
  bulk_shutdown: 'text-red-400 bg-red-500/10',
  bulk_lockscreen: 'text-purple-400 bg-purple-500/10',
  bulk_alarm: 'text-pink-400 bg-pink-500/10',
  alert_triggered: 'text-red-400 bg-red-500/10',
  alert_rule_created: 'text-emerald-400 bg-emerald-500/10',
  group_created: 'text-emerald-400 bg-emerald-500/10',
  script_created: 'text-emerald-400 bg-emerald-500/10',
  wol_sent: 'text-blue-400 bg-blue-500/10',
};

const DEFAULT_BADGE = 'text-slate-400 bg-slate-500/10';

export default function AuditLogPage() {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const { toast } = useToast();
  const isAdmin = useHasRole('admin');

  const [items, setItems] = useState<SystemEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [actors, setActors] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [type, setType] = useState('');
  const [actor, setActor] = useState('');
  const [agentId, setAgentId] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Convert datetime-local value (no tz) into ISO at the user's local tz.
  const toIso = (v: string) => (v ? new Date(v).toISOString() : '');

  const buildQuery = useCallback(
    (extra: Record<string, string | number> = {}) => {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (actor) params.set('actor', actor);
      if (agentId) params.set('agentId', agentId);
      if (q.trim()) params.set('q', q.trim());
      if (from) params.set('from', toIso(from));
      if (to) params.set('to', toIso(to));
      for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
      return params.toString();
    },
    [type, actor, agentId, q, from, to],
  );

  const load = useCallback(async () => {
    const token = localStorage.getItem('pc-hub-token');
    if (!token) return;
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      const qs = buildQuery({ limit: pageSize, offset });
      const res = await fetch(`${API_BASE}/audit?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AuditResponse = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setTypes(data.types || []);
      setActors(data.actors || []);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, page, pageSize]);

  // Load list of agents once (for the agent filter dropdown).
  useEffect(() => {
    const token = localStorage.getItem('pc-hub-token');
    if (!token) return;
    fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setAgents(d))
      .catch(() => undefined);
  }, []);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [type, actor, agentId, q, from, to, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = async () => {
    const token = localStorage.getItem('pc-hub-token');
    if (!token) return;
    setExporting(true);
    try {
      const qs = buildQuery();
      const res = await fetch(`${API_BASE}/audit/export.csv?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `audit-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      toast(t('audit.exportFailed').replace('{error}', msg), 'error');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setType('');
    setActor('');
    setAgentId('');
    setQ('');
    setFrom('');
    setTo('');
  };

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  const agentLabel = (id: string | null | undefined) => {
    if (!id) return '';
    const a = agents.find((x) => x.id === id);
    return a ? a.hostname : id.slice(0, 12);
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <EmptyState
          icon={ScrollText}
          title={t('audit.title')}
          description="Admin role required to view the audit log."
        />
      </div>
    );
  }

  const inputBase = isDark
    ? 'bg-slate-800/50 border-slate-700 text-white placeholder-slate-500 focus:ring-blue-500'
    : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-400';

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1
            className={`text-xl sm:text-2xl font-bold ${
              isDark ? 'text-white' : 'text-gray-900'
            }`}
          >
            {t('audit.title')}
          </h1>
          <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} text-sm mt-1`}>
            {t('audit.subtitle')}
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
          <button
            onClick={() => void handleExport()}
            disabled={exporting || total === 0}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition text-sm disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
            {exporting ? t('audit.exporting') : t('audit.exportCsv')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        className={`${
          isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-sm'
        } border rounded-xl p-3 sm:p-4 space-y-3`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-2">
            <Search
              className={`w-4 h-4 ${
                isDark ? 'text-slate-500' : 'text-gray-400'
              } absolute left-3 top-1/2 -translate-y-1/2`}
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('audit.search')}
              className={`w-full ${inputBase} border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1`}
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={`${inputBase} border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1`}
          >
            <option value="">{t('audit.filterType')}: {t('audit.filterAll')}</option>
            {types.map((tt) => (
              <option key={tt} value={tt}>
                {tt}
              </option>
            ))}
          </select>
          <select
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className={`${inputBase} border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1`}
          >
            <option value="">{t('audit.filterActor')}: {t('audit.filterAll')}</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className={`${inputBase} border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1`}
          >
            <option value="">{t('audit.filterAgent')}: {t('audit.filterAll')}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.hostname}
              </option>
            ))}
          </select>
          <label className="relative">
            <Calendar
              className={`w-4 h-4 ${
                isDark ? 'text-slate-500' : 'text-gray-400'
              } absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none`}
            />
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label={t('audit.from')}
              className={`w-full ${inputBase} border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1`}
            />
          </label>
          <label className="relative">
            <Calendar
              className={`w-4 h-4 ${
                isDark ? 'text-slate-500' : 'text-gray-400'
              } absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none`}
            />
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label={t('audit.to')}
              className={`w-full ${inputBase} border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1`}
            />
          </label>
          <button
            onClick={clearFilters}
            className={`flex items-center justify-center gap-2 px-3 py-2 ${
              isDark
                ? 'bg-slate-700 text-slate-300 hover:text-white'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200'
            } rounded-lg transition text-sm`}
          >
            <X className="w-4 h-4" />
            {t('audit.clearFilters')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        className={`${
          isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-sm'
        } border rounded-xl overflow-hidden`}
      >
        <div className="max-h-[600px] overflow-auto">
          {items.length === 0 ? (
            <div style={{ padding: '40px 16px' }}>
              <EmptyState
                icon={ScrollText}
                title={t('audit.title')}
                description={loading ? t('audit.loading') : t('audit.empty')}
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className={`${isDark ? 'bg-slate-800/80' : 'bg-gray-50'} sticky top-0`}>
                <tr className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                  <th className="text-left px-4 py-2.5 font-medium w-44 hidden md:table-cell">
                    {t('audit.timestamp')}
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium w-44">{t('audit.type')}</th>
                  <th className="text-left px-4 py-2.5 font-medium w-32 hidden lg:table-cell">
                    {t('audit.actor')}
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium w-40 hidden xl:table-cell">
                    {t('audit.agent')}
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium">{t('audit.message')}</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-700/30' : 'divide-gray-100'}`}>
                {items.map((ev) => (
                  <tr
                    key={ev.id}
                    className={`${isDark ? 'hover:bg-slate-700/20' : 'hover:bg-gray-50'}`}
                  >
                    <td
                      className={`px-4 py-2.5 ${
                        isDark ? 'text-slate-500' : 'text-gray-400'
                      } text-xs font-mono hidden md:table-cell`}
                    >
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          TYPE_BADGE[ev.type] || DEFAULT_BADGE
                        }`}
                      >
                        {ev.type}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-2.5 ${
                        isDark ? 'text-slate-300' : 'text-gray-700'
                      } text-xs hidden lg:table-cell`}
                    >
                      {ev.actor || (
                        <span className={isDark ? 'text-slate-500' : 'text-gray-400'}>
                          {t('audit.system')}
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-2.5 ${
                        isDark ? 'text-slate-400' : 'text-gray-600'
                      } text-xs hidden xl:table-cell`}
                    >
                      {ev.agentId ? (
                        agentLabel(ev.agentId)
                      ) : (
                        <span className={isDark ? 'text-slate-600' : 'text-gray-300'}>—</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-2.5 ${
                        isDark ? 'text-slate-300' : 'text-gray-700'
                      } text-xs`}
                    >
                      {ev.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 ${
            isDark
              ? 'bg-slate-800/60 border-slate-700 text-slate-400'
              : 'bg-gray-50 border-gray-200 text-gray-500'
          } border-t text-xs`}
        >
          <div className="flex items-center gap-3">
            <span>
              {t('audit.shown')
                .replace('{shown}', String(items.length))
                .replace('{total}', String(total))}
            </span>
            <label className="flex items-center gap-1">
              <span>{t('audit.pageSize')}:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                className={`${inputBase} border rounded px-2 py-0.5 text-xs focus:outline-none`}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className={`flex items-center gap-1 px-2 py-1 rounded ${
                isDark ? 'hover:bg-slate-700/50' : 'hover:bg-gray-100'
              } disabled:opacity-40`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {t('audit.prev')}
            </button>
            <span className="px-2">
              {t('audit.pageOf')
                .replace('{page}', String(page))
                .replace('{total}', String(totalPages))}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className={`flex items-center gap-1 px-2 py-1 rounded ${
                isDark ? 'hover:bg-slate-700/50' : 'hover:bg-gray-100'
              } disabled:opacity-40`}
            >
              {t('audit.next')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
