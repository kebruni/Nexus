import { useEffect, useMemo, useState } from 'react';
import { Webhook, Plus, Trash2, Send, Power, RefreshCw, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE = '/api';
type WebhookType = 'telegram' | 'discord' | 'slack' | 'generic';

interface Hook {
  id: string;
  name: string;
  type: WebhookType;
  enabled: boolean;
  config: Record<string, string>;
  filters: { minSeverity?: 'warning' | 'critical' };
  createdAt: string;
  lastDelivery: { ok: boolean; at: string; error?: string } | null;
}

export default function WebhooksPage() {
  const { t } = useLanguage();
  const { isDark } = useTheme();

  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<WebhookType>('telegram');
  const [name, setName] = useState('');
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [url, setUrl] = useState('');
  const [minSeverity, setMinSeverity] = useState<'warning' | 'critical'>('warning');

  const token = localStorage.getItem('pc-hub-token');
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  );

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/webhooks`, { headers });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      const data = await r.json();
      setHooks(data.webhooks || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resetForm = () => {
    setName('');
    setTgBotToken('');
    setTgChatId('');
    setUrl('');
    setMinSeverity('warning');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body =
      type === 'telegram'
        ? { name, type, config: { botToken: tgBotToken, chatId: tgChatId }, filters: { minSeverity } }
        : { name, type, config: { url }, filters: { minSeverity } };
    try {
      const r = await fetch(`${API_BASE}/webhooks`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggle = async (h: Hook) => {
    setBusyId(h.id);
    try {
      const r = await fetch(`${API_BASE}/webhooks/${encodeURIComponent(h.id)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ enabled: !h.enabled }),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (h: Hook) => {
    if (!window.confirm(t('webhooks.confirmDelete', { name: h.name }))) return;
    setBusyId(h.id);
    try {
      const r = await fetch(`${API_BASE}/webhooks/${encodeURIComponent(h.id)}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (h: Hook) => {
    setBusyId(h.id);
    try {
      const r = await fetch(`${API_BASE}/webhooks/${encodeURIComponent(h.id)}/test`, { method: 'POST', headers });
      const data = await r.json();
      if (!data.ok) {
        window.alert(t('webhooks.testFailed', { error: data.error || 'unknown error' }));
      } else {
        window.alert(t('webhooks.testOk', { name: h.name }));
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const typeBadge = (tp: WebhookType) => {
    const colors: Record<WebhookType, string> = {
      telegram: isDark ? 'bg-sky-500/10 border-sky-500/30 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-700',
      discord: isDark ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700',
      slack: isDark ? 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300' : 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',
      generic: isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-gray-100 border-gray-200 text-gray-700',
    };
    return (
      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border font-semibold ${colors[tp]}`}>
        {tp}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto py-4 sm:py-8 px-1 sm:pr-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight flex items-center gap-2`}>
            <Webhook className="w-5 h-5 text-blue-500" />
            {t('webhooks.title')}
          </h2>
          <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'} mt-1`}>{t('webhooks.subtitle')}</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition disabled:opacity-50 ${isDark ? 'border-zinc-700 hover:bg-zinc-900 text-zinc-300' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('webhooks.refresh')}
        </button>
      </div>

      {error && (
        <div className={`px-4 py-2 rounded-lg text-sm flex items-start gap-2 ${isDark ? 'bg-red-500/10 border border-red-500/30 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* New webhook form */}
      <form onSubmit={handleCreate} className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-xl p-4 space-y-3`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className={`text-[11px] uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{t('webhooks.type')}</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as WebhookType)}
              className={`mt-1 w-full px-2 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
            >
              <option value="telegram" className="bg-white text-gray-900">Telegram</option>
              <option value="discord" className="bg-white text-gray-900">Discord</option>
              <option value="slack" className="bg-white text-gray-900">Slack</option>
              <option value="generic" className="bg-white text-gray-900">Generic JSON</option>
            </select>
          </div>
          <div>
            <label className={`text-[11px] uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{t('webhooks.name')}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('webhooks.namePlaceholder')}
              className={`mt-1 w-full px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`}
            />
          </div>
        </div>

        {type === 'telegram' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input required value={tgBotToken} onChange={(e) => setTgBotToken(e.target.value)} placeholder={t('webhooks.tgBotToken')} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`} />
            <input required value={tgChatId} onChange={(e) => setTgChatId(e.target.value)} placeholder={t('webhooks.tgChatId')} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`} />
          </div>
        ) : (
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('webhooks.url')}
            className={`w-full px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`}
          />
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <label className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>{t('webhooks.minSeverity')}:</label>
            <select
              value={minSeverity}
              onChange={(e) => setMinSeverity(e.target.value as 'warning' | 'critical')}
              className={`text-xs px-2 py-1 rounded-md border ${isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            >
              <option value="warning" className="bg-white text-gray-900">{t('webhooks.severityWarning')}</option>
              <option value="critical" className="bg-white text-gray-900">{t('webhooks.severityCritical')}</option>
            </select>
          </div>
          <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors">
            <Plus className="w-4 h-4" />
            {t('webhooks.add')}
          </button>
        </div>

        {type === 'telegram' && (
          <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'} leading-relaxed`}>{t('webhooks.tgHelp')}</p>
        )}
      </form>

      {/* List */}
      <div className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={`text-left text-[11px] uppercase tracking-wider ${isDark ? 'text-zinc-500 border-b border-zinc-800' : 'text-gray-400 border-b border-gray-200'}`}>
              <th className="px-4 py-2.5">{t('webhooks.name')}</th>
              <th className="px-4 py-2.5">{t('webhooks.type')}</th>
              <th className="px-4 py-2.5">{t('webhooks.minSeverity')}</th>
              <th className="px-4 py-2.5">{t('webhooks.lastDelivery')}</th>
              <th className="px-4 py-2.5 text-right">{t('webhooks.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {hooks.map((h) => (
              <tr key={h.id} className={`${isDark ? 'border-b border-zinc-900 last:border-0' : 'border-b border-gray-100 last:border-0'}`}>
                <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {h.name}
                  {!h.enabled && (
                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                      {t('webhooks.disabled')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{typeBadge(h.type)}</td>
                <td className={`px-4 py-3 text-xs ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                  {h.filters?.minSeverity || 'warning'}
                </td>
                <td className={`px-4 py-3 text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                  {h.lastDelivery ? (
                    h.lastDelivery.ok ? (
                      <span className={isDark ? 'text-emerald-400' : 'text-emerald-600'}>
                        OK · {new Date(h.lastDelivery.at).toLocaleString()}
                      </span>
                    ) : (
                      <span className={isDark ? 'text-red-400' : 'text-red-600'} title={h.lastDelivery.error}>
                        FAIL · {new Date(h.lastDelivery.at).toLocaleString()}
                      </span>
                    )
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => handleTest(h)}
                    disabled={busyId === h.id}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border mr-1.5 transition disabled:opacity-50 ${isDark ? 'border-zinc-700 hover:bg-zinc-900 text-zinc-300' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
                  >
                    <Send className="w-3 h-3" />
                    {t('webhooks.test')}
                  </button>
                  <button
                    onClick={() => handleToggle(h)}
                    disabled={busyId === h.id}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border mr-1.5 transition disabled:opacity-50 ${
                      h.enabled
                        ? isDark ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        : isDark ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-900' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    {h.enabled ? t('webhooks.disable') : t('webhooks.enable')}
                  </button>
                  <button
                    onClick={() => handleDelete(h)}
                    disabled={busyId === h.id}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
            {hooks.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className={`px-4 py-8 text-center text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                  {t('webhooks.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
