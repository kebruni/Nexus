import { useEffect, useMemo, useState } from 'react';
import type { Agent } from '../types';
import { Plus, Trash2, FolderOpen, UserPlus, Power, Lock, Terminal as TerminalIcon, RotateCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE = '/api';

interface Group {
  name: string;
  color: string;
  createdAt: string;
}

type BulkAction = 'execute' | 'reboot' | 'shutdown' | 'lockscreen';

interface BulkResult {
  group: string;
  action: BulkAction;
  sent: number;
  total: number;
  skipped: number;
  ts: number;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [assignAgent, setAssignAgent] = useState<{ agentId: string; group: string } | null>(null);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [lastBulk, setLastBulk] = useState<Record<string, BulkResult>>({});
  const { t } = useLanguage();
  const { isDark } = useTheme();

  const token = localStorage.getItem('pc-hub-token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/groups`, { headers }).then((r) => r.json()).then(setGroups).catch(console.error);
    fetch(`${API_BASE}/agents`, { headers }).then((r) => r.json()).then(setAgents).catch(console.error);
  }, [headers, token]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const res = await fetch(`${API_BASE}/groups`, { method: 'POST', headers, body: JSON.stringify({ name: newName, color: newColor }) });
    const group = await res.json();
    setGroups((prev) => [...prev, group]);
    setNewName('');
  };

  const handleDelete = async (name: string) => {
    await fetch(`${API_BASE}/groups/${encodeURIComponent(name)}`, { method: 'DELETE', headers });
    setGroups((prev) => prev.filter((g) => g.name !== name));
    setAgents((prev) => prev.map((a) => a.group === name ? { ...a, group: undefined } : a));
  };

  const handleAssignAgent = async (agentId: string, groupName: string | null) => {
    await fetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/group`, { method: 'PUT', headers, body: JSON.stringify({ group: groupName }) });
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, group: groupName || undefined } : a));
    setAssignAgent(null);
  };

  const agentsInGroup = (groupName: string) => agents.filter((a) => a.group === groupName);
  const onlineInGroup = (groupName: string) => agentsInGroup(groupName).filter((a) => a.status === 'online');
  const unassigned = agents.filter((a) => !a.group);

  const runBulk = async (group: Group, action: BulkAction, command?: string) => {
    const members = agentsInGroup(group.name);
    if (members.length === 0) {
      window.alert(t('groups.bulkEmpty'));
      return;
    }
    const online = onlineInGroup(group.name);
    if (online.length === 0) {
      window.alert(t('groups.bulkNoOnline'));
      return;
    }
    const actionLabel: Record<BulkAction, string> = {
      execute: t('groups.bulkRun'),
      reboot: t('groups.bulkReboot'),
      shutdown: t('groups.bulkShutdown'),
      lockscreen: t('groups.bulkLock'),
    };
    if (!window.confirm(t('groups.bulkConfirm', { action: actionLabel[action], count: online.length, group: group.name }))) {
      return;
    }
    setBusyGroup(group.name);
    try {
      const body: Record<string, unknown> = { action, groupName: group.name };
      if (action === 'execute' && command) body.command = command;
      const res = await fetch(`${API_BASE}/bulk/command`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || 'Failed');
        return;
      }
      setLastBulk((prev) => ({
        ...prev,
        [group.name]: {
          group: group.name,
          action,
          sent: data.sent || 0,
          total: data.total || 0,
          skipped: (data.skipped || []).length,
          ts: Date.now(),
        },
      }));
    } catch (err) {
      window.alert(String(err));
    } finally {
      setBusyGroup(null);
    }
  };

  const promptAndRun = (group: Group) => {
    const cmd = window.prompt(t('groups.bulkCommandPrompt'));
    if (!cmd || !cmd.trim()) return;
    runBulk(group, 'execute', cmd.trim());
  };

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto py-4 sm:py-8 px-1 sm:pr-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>{t('groups.title')}</h2>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'} mt-1`}>{t('groups.subtitle')}</p>
      </div>

      {/* New group form */}
      <div className={`flex items-center gap-3 ${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-xl p-3`}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('groups.name')}
          className={`flex-1 px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} outline-none`}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
        <button onClick={handleCreate} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors">
          <Plus className="w-4 h-4" />
          {t('groups.new')}
        </button>
      </div>

      {/* Groups list */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className={`w-14 h-14 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'} border rounded-2xl flex items-center justify-center mb-4`}>
            <FolderOpen className={`w-6 h-6 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`} />
          </div>
          <p className={`font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{t('groups.noGroups')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const members = agentsInGroup(group.name);
            return (
              <div key={group.name} className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl p-4 sm:p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                    <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{group.name}</h3>
                    <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{members.length} {t('groups.devices')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAssignAgent({ agentId: '', group: group.name })}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs rounded-lg hover:bg-blue-500/20 transition"
                    >
                      <UserPlus className="w-3 h-3" />
                      {t('groups.addDevice')}
                    </button>
                    <button
                      onClick={() => handleDelete(group.name)}
                      className="p-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bulk actions */}
                {members.length > 0 && (
                  <div className={`mb-3 flex flex-wrap items-center gap-2 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                    <span className={`text-[11px] uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'} mr-1`}>
                      {t('groups.bulkActions')}:
                    </span>
                    <button
                      onClick={() => promptAndRun(group)}
                      disabled={busyGroup === group.name}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition disabled:opacity-50 ${isDark ? 'border-zinc-700 hover:bg-zinc-900 text-zinc-200' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
                      title={t('groups.bulkRun')}
                    >
                      <TerminalIcon className="w-3.5 h-3.5" />
                      {t('groups.bulkRun')}
                    </button>
                    <button
                      onClick={() => runBulk(group, 'reboot')}
                      disabled={busyGroup === group.name}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-50"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      {t('groups.bulkReboot')}
                    </button>
                    <button
                      onClick={() => runBulk(group, 'shutdown')}
                      disabled={busyGroup === group.name}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                    >
                      <Power className="w-3.5 h-3.5" />
                      {t('groups.bulkShutdown')}
                    </button>
                    <button
                      onClick={() => runBulk(group, 'lockscreen')}
                      disabled={busyGroup === group.name}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition disabled:opacity-50 ${isDark ? 'border-zinc-700 hover:bg-zinc-900 text-zinc-200' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {t('groups.bulkLock')}
                    </button>
                    {lastBulk[group.name] && (
                      <span className={`text-[11px] ml-1 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                        {t('groups.bulkResult', {
                          sent: lastBulk[group.name].sent,
                          total: lastBulk[group.name].total,
                          skipped: lastBulk[group.name].skipped > 0
                            ? t('groups.bulkResultSkipped', { skipped: lastBulk[group.name].skipped })
                            : '',
                        })}
                      </span>
                    )}
                  </div>
                )}

                {/* Assign dropdown */}
                {assignAgent?.group === group.name && (
                  <div className={`mb-3 flex items-center gap-2`}>
                    <select
                      value={assignAgent.agentId}
                      onChange={(e) => setAssignAgent({ ...assignAgent, agentId: e.target.value })}
                      className={`flex-1 px-2 py-1.5 text-sm rounded-lg border ${isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
                    >
                      <option value="" className="text-gray-900 bg-white">{t('scripts.selectDevice')}</option>
                      {unassigned.map((a) => (
                        <option key={a.id} value={a.id} className="text-gray-900 bg-white">{a.hostname}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => assignAgent.agentId && handleAssignAgent(assignAgent.agentId, group.name)}
                      disabled={!assignAgent.agentId}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-40"
                    >
                      OK
                    </button>
                    <button onClick={() => setAssignAgent(null)} className={`px-3 py-1.5 text-xs rounded-lg ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                      {t('common.cancel')}
                    </button>
                  </div>
                )}

                {/* Members */}
                {members.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {members.map((a) => (
                      <div key={a.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isDark ? 'bg-zinc-900 text-zinc-300' : 'bg-gray-100 text-gray-700'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${a.status === 'online' ? 'bg-emerald-500' : isDark ? 'bg-zinc-600' : 'bg-gray-400'}`} />
                        {a.hostname}
                        <button
                          onClick={() => handleAssignAgent(a.id, null)}
                          className={`ml-1 ${isDark ? 'text-zinc-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500'} transition`}
                          title="Remove from group"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
