import { useEffect, useState } from 'react';
import { getSocket } from '../api/socket';
import type { Agent } from '../types';
import { Plus, Play, Trash2, FileCode, Terminal } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import EmptyState from './EmptyState';
import { useHasRole } from '../hooks/useCurrentUser';

const API_BASE = '/api';

interface Script {
  id: string;
  name: string;
  code: string;
  createdAt: string;
}

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const canRun = useHasRole('operator');

  useEffect(() => {
    const token = localStorage.getItem('pc-hub-token');
    if (token) {
      fetch(`${API_BASE}/scripts`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setScripts)
        .catch(console.error);

      fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setAgents)
        .catch(console.error);
    }

    const socket = getSocket();
    if (socket) {
      socket.emit('agents:requestList');
      socket.on('agents:list', setAgents);
      socket.on('command:result', (data: { stdout?: string; stderr?: string; command?: string }) => {
        setRunning(false);
        setOutput((data.stdout || '') + (data.stderr ? `\n[stderr] ${data.stderr}` : ''));
      });
    }
    return () => {
      if (socket) {
        socket.off('agents:list');
        socket.off('command:result');
      }
    };
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) return;
    const token = localStorage.getItem('pc-hub-token');
    const res = await fetch(`${API_BASE}/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, code }),
    });
    const script = await res.json();
    setScripts((prev) => [...prev, script]);
    setName('');
    setCode('');
    setEditing(false);
  };

  const handleDelete = async (id: string) => {
    const token = localStorage.getItem('pc-hub-token');
    await fetch(`${API_BASE}/scripts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setScripts((prev) => prev.filter((s) => s.id !== id));
  };

  const handleRun = (scriptCode: string) => {
    if (!selectedAgent) return;
    const socket = getSocket();
    if (socket) {
      setRunning(true);
      setOutput(null);
      socket.emit('command:execute', { agentId: selectedAgent, command: scriptCode });
    }
  };

  const onlineAgents = agents.filter((a) => a.status === 'online');

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto py-4 sm:py-8 px-1 sm:pr-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>{t('scripts.title')}</h2>
          <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'} mt-1`}>{t('scripts.subtitle')}</p>
        </div>
        {canRun && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('scripts.new')}
          </button>
        )}
      </div>

      {/* Device selector */}
      <div className={`flex items-center gap-3 ${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-xl p-3`}>
        <Terminal className={`w-4 h-4 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className={`flex-1 text-sm ${isDark ? 'bg-transparent text-white' : 'bg-transparent text-gray-900'} outline-none`}
        >
          <option value="" className="text-gray-900 bg-white">{t('scripts.selectDevice')}</option>
          {onlineAgents.map((a) => (
            <option key={a.id} value={a.id} className="text-gray-900 bg-white">{a.hostname} ({a.ip})</option>
          ))}
        </select>
      </div>

      {/* New script form */}
      {editing && (
        <div className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl p-4 sm:p-6 space-y-3`}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('scripts.name')}
            className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} outline-none focus:ring-2 focus:ring-blue-500/40`}
          />
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('scripts.code')}
            rows={6}
            className={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} outline-none focus:ring-2 focus:ring-blue-500/40 resize-none`}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setEditing(false); setName(''); setCode(''); }} className={`px-4 py-2 text-sm rounded-lg ${isDark ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'} transition`}>
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors">
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* Output panel */}
      {(output !== null || running) && (
        <div className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl p-4 overflow-hidden`}>
          <div className="flex justify-between items-center mb-2">
            <p className={`text-xs font-medium ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{t('scripts.output')}</p>
          </div>
          <div className={`p-3 rounded-xl border ${isDark ? 'bg-black border-zinc-800' : 'bg-gray-50 border-gray-200'} overflow-x-auto`}>
            <pre className={`text-sm font-mono whitespace-pre max-h-64 overflow-y-auto ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
              {running ? '...' : output || '(no output)'}
            </pre>
          </div>
        </div>
      )}

      {/* Scripts list */}
      {scripts.length === 0 && !editing ? (
        <div className="nx-empty-panel">
          <EmptyState
            icon={FileCode}
            title={t('scripts.emptyTitle')}
            description={t('scripts.emptyDesc')}
            action={
              <button
                type="button"
                className="nx-btn is-primary"
                onClick={() => setEditing(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('scripts.create')}
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {scripts.map((s) => (
            <div key={s.id} className={`${isDark ? 'bg-[#121212] border-zinc-800 hover:border-zinc-700' : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'} border rounded-2xl p-4 transition-colors`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{s.name}</h3>
                <div className="flex items-center gap-2">
                  {canRun && (
                    <>
                      <button
                        onClick={() => handleRun(s.code)}
                        disabled={!selectedAgent || running}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg hover:bg-emerald-500/20 transition disabled:opacity-40"
                      >
                        <Play className="w-3 h-3" />
                        {t('scripts.run')}
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg hover:bg-red-500/20 transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <pre className={`text-xs font-mono ${isDark ? 'text-zinc-500' : 'text-gray-400'} whitespace-pre-wrap max-h-24 overflow-auto`}>{s.code}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
