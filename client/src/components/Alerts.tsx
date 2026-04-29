import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSocket } from '../api/socket';
import type { Alert, AlertRule, Agent } from '../types';
import {
  Bell,
  BellRing,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  XCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

const API_BASE = '/api';

export default function Alerts() {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showNewRule, setShowNewRule] = useState(false);
  const [activeTab, setActiveTab] = useState<'alerts' | 'rules'>('alerts');

  // New rule form
  const [newRule, setNewRule] = useState({
    name: '',
    metric: 'cpu' as 'cpu' | 'ram' | 'disk',
    operator: 'gt' as 'gt' | 'lt',
    threshold: 80,
    duration: 0,
    agentId: '',
  });

  const token = localStorage.getItem('pc-hub-token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  const loadData = useCallback(() => {
    if (!token) return;
    fetch(`${API_BASE}/alerts`, { headers }).then((r) => r.json()).then(setAlerts).catch(console.error);
    fetch(`${API_BASE}/alert-rules`, { headers }).then((r) => r.json()).then(setRules).catch(console.error);
    fetch(`${API_BASE}/agents`, { headers }).then((r) => r.json()).then(setAgents).catch(console.error);
  }, [headers, token]);

  useEffect(() => {
    loadData();

    const socket = getSocket();
    if (!socket) return;

    socket.on('alert:new', (alert: Alert) => {
      setAlerts((prev) => [alert, ...prev]);
    });

    socket.on('agents:list', (list: Agent[]) => setAgents(list));

    return () => {
      socket.off('alert:new');
      socket.off('agents:list');
    };
  }, [loadData]);

  const createRule = async () => {
    const body = { ...newRule, agentId: newRule.agentId || null };
    const res = await fetch(`${API_BASE}/alert-rules`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const rule = await res.json();
    setRules((prev) => [...prev, rule]);
    setShowNewRule(false);
    setNewRule({ name: '', metric: 'cpu', operator: 'gt', threshold: 80, duration: 0, agentId: '' });
  };

  const deleteRule = async (id: string) => {
    await fetch(`${API_BASE}/alert-rules/${id}`, { method: 'DELETE', headers });
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleRule = async (rule: AlertRule) => {
    const res = await fetch(`${API_BASE}/alert-rules/${rule.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    const updated = await res.json();
    setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const acknowledgeAlert = async (id: string) => {
    await fetch(`${API_BASE}/alerts/${id}/acknowledge`, { method: 'POST', headers });
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  };

  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} flex items-center gap-2`}>
            <BellRing className="w-6 h-6 text-orange-400" />
            Alerts & Notifications
          </h1>
          <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} text-sm mt-1`}>
            Configure threshold alerts and view notifications
          </p>
        </div>
        {unreadCount > 0 && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-full px-4 py-1.5 text-red-400 text-sm font-medium">
            {unreadCount} unread alert{unreadCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'alerts'
              ? 'border-blue-500 text-blue-400'
              : `border-transparent ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`
          }`}
        >
          <Bell className="w-4 h-4" />
          Alerts
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'rules'
              ? 'border-blue-500 text-blue-400'
              : `border-transparent ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Rules ({rules.length})
        </button>
      </div>

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-2">
          {alerts.length === 0 ? (
            <div className={`${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border border-dashed rounded-2xl py-16 flex flex-col items-center justify-center`}>
              <div className={`w-14 h-14 ${isDark ? 'bg-zinc-900' : 'bg-gray-100'} rounded-full flex items-center justify-center mb-4`}>
                <Bell className={`w-6 h-6 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
              </div>
              <p className={`font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{t('alerts.noRules')}</p>
              <p className={`text-sm mt-1 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{t('alerts.createFirst')}</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`${isDark ? 'bg-slate-800/50' : 'bg-white'} border rounded-xl p-4 flex items-start gap-3 ${
                  alert.acknowledged
                    ? `${isDark ? 'border-slate-700' : 'border-gray-200'} opacity-60`
                    : alert.severity === 'critical'
                    ? 'border-red-500/40 bg-red-500/5'
                    : 'border-orange-500/40 bg-orange-500/5'
                }`}
              >
                {alert.severity === 'critical' ? (
                  <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{alert.agentHostname}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        alert.severity === 'critical'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-orange-500/20 text-orange-400'
                      }`}
                    >
                      {alert.severity}
                    </span>
                    {alert.acknowledged && (
                      <span className={`text-[10px] px-2 py-0.5 ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-500'} rounded-full`}>
                        acknowledged
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'} mt-1`}>{alert.message}</p>
                  <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'} mt-1`}>
                    Rule: {alert.ruleName} • {new Date(alert.timestamp).toLocaleString()}
                  </p>
                </div>
                {!alert.acknowledged && (
                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className={`p-1.5 ${isDark ? 'text-slate-400' : 'text-gray-400'} hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition`}
                    title="Acknowledge"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowNewRule(!showNewRule)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" />
            New Rule
          </button>

          {/* New Rule Form */}
          {showNewRule && (
            <div className={`${isDark ? 'bg-slate-800/50' : 'bg-white'} border border-blue-500/30 rounded-xl p-4 space-y-3`}>
              <input
                type="text"
                placeholder="Rule name (e.g. High CPU Alert)"
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                className={`w-full ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-900'} border rounded-lg px-3 py-2 text-sm`}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <select
                  value={newRule.metric}
                  onChange={(e) => setNewRule({ ...newRule, metric: e.target.value as 'cpu' | 'ram' | 'disk' })}
                  className={`${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-900'} border rounded-lg px-3 py-2 text-sm`}
                >
                  <option value="cpu">CPU</option>
                  <option value="ram">RAM</option>
                  <option value="disk">Disk</option>
                </select>
                <select
                  value={newRule.operator}
                  onChange={(e) => setNewRule({ ...newRule, operator: e.target.value as 'gt' | 'lt' })}
                  className={`${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-900'} border rounded-lg px-3 py-2 text-sm`}
                >
                  <option value="gt">Greater than</option>
                  <option value="lt">Less than</option>
                </select>
                <input
                  type="number"
                  placeholder="Threshold %"
                  value={newRule.threshold}
                  onChange={(e) => setNewRule({ ...newRule, threshold: Number(e.target.value) })}
                  className={`${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-900'} border rounded-lg px-3 py-2 text-sm`}
                />
                <select
                  value={newRule.agentId}
                  onChange={(e) => setNewRule({ ...newRule, agentId: e.target.value })}
                  className={`${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-900'} border rounded-lg px-3 py-2 text-sm`}
                >
                  <option value="">All computers</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.hostname}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Duration (sec):</label>
                <input
                  type="number"
                  value={newRule.duration}
                  onChange={(e) => setNewRule({ ...newRule, duration: Number(e.target.value) })}
                  className={`w-20 ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-900'} border rounded-lg px-3 py-2 text-sm`}
                />
                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>How long must condition persist before alert</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createRule}
                  disabled={!newRule.name}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Create Rule
                </button>
                <button
                  onClick={() => setShowNewRule(false)}
                  className={`px-4 py-2 ${isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'} text-sm rounded-lg transition`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Rules List */}
          {rules.length === 0 ? (
            <div className={`${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border border-dashed rounded-2xl py-16 flex flex-col items-center justify-center`}>
              <div className={`w-14 h-14 ${isDark ? 'bg-zinc-900' : 'bg-gray-100'} rounded-full flex items-center justify-center mb-4`}>
                <AlertTriangle className={`w-6 h-6 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
              </div>
              <p className={`font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{t('alerts.noRules')}</p>
              <p className={`text-sm mt-1 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{t('alerts.createFirst')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border rounded-xl p-4 flex items-center gap-4 ${
                    !rule.enabled ? 'opacity-50' : ''
                  }`}
                >
                  <button onClick={() => toggleRule(rule)} className="shrink-0" title="Toggle rule">
                    {rule.enabled ? (
                      <ToggleRight className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-slate-500" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{rule.name}</p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'} mt-0.5`}>
                      {rule.metric.toUpperCase()} {rule.operator === 'gt' ? '>' : '<'} {rule.threshold}%
                      {rule.duration > 0 && ` for ${rule.duration}s`}
                      {rule.agentId ? ` • Specific agent` : ' • All agents'}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className={`p-1.5 ${isDark ? 'text-slate-500' : 'text-gray-400'} hover:text-red-400 hover:bg-red-400/10 rounded-lg transition`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
