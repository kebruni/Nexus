import { useEffect, useMemo, useState } from 'react';
import type { Agent } from '../types';
import { Plus, Trash2, FolderOpen, UserPlus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE = 'http://localhost:3000/api';

interface Group {
  name: string;
  color: string;
  createdAt: string;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [assignAgent, setAssignAgent] = useState<{ agentId: string; group: string } | null>(null);
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
  const unassigned = agents.filter((a) => !a.group);

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

                {/* Assign dropdown */}
                {assignAgent?.group === group.name && (
                  <div className={`mb-3 flex items-center gap-2`}>
                    <select
                      value={assignAgent.agentId}
                      onChange={(e) => setAssignAgent({ ...assignAgent, agentId: e.target.value })}
                      className={`flex-1 px-2 py-1.5 text-sm rounded-lg border ${isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
                    >
                      <option value="">{t('scripts.selectDevice')}</option>
                      {unassigned.map((a) => (
                        <option key={a.id} value={a.id}>{a.hostname}</option>
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
