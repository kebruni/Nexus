import { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, RefreshCw, Search, X, AlertTriangle, Pause, Play } from 'lucide-react';
import { getSocket } from '../api/socket';
import type { Agent } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useHasRole } from '../hooks/useCurrentUser';

const API_BASE = '/api';

interface Proc {
  pid: number;
  parentPid: number;
  name: string;
  cpu: number;
  mem: number;
  memRssMb: number;
  user: string;
  state: string;
  command: string;
}

interface Summary {
  all: number;
  running: number;
  blocked: number;
  sleeping: number;
}

type SortKey = 'cpu' | 'mem' | 'name' | 'pid';

const REFRESH_MS = 5000;

export default function ProcessesPage() {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const canKill = useHasRole('operator');

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [list, setList] = useState<Proc[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [paused, setPaused] = useState(false);
  const [busyKill, setBusyKill] = useState<number | null>(null);

  const reqIdRef = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // initial agent fetch
  useEffect(() => {
    const token = localStorage.getItem('pc-hub-token');
    if (!token) return;
    fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setAgents)
      .catch(() => undefined);

    const socket = getSocket();
    if (!socket) return;
    socket.emit('agents:requestList');
    socket.on('agents:list', setAgents);
    return () => {
      socket.off('agents:list', setAgents);
    };
  }, []);

  // Auto-pick first online agent if nothing chosen.
  // Derive synchronously instead of via setState-in-effect so the lint rule
  // `react-hooks/set-state-in-effect` is happy.
  const effectiveAgentId = useMemo(() => {
    if (selectedAgent) return selectedAgent;
    return agents.find((a) => a.status === 'online')?.id || '';
  }, [agents, selectedAgent]);

  // Wire up result handlers + periodic refresh
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !effectiveAgentId) return;

    const onResult = (data: { agentId: string; success: boolean; error?: string; list?: Proc[]; summary?: Summary }) => {
      if (data.agentId !== effectiveAgentId) return;
      setLoading(false);
      if (!data.success) {
        setError(data.error || 'failed to list processes');
        return;
      }
      setError(null);
      setList(data.list || []);
      setSummary(data.summary || null);
    };

    const onKillResult = (data: { agentId: string; success: boolean; pid?: number; error?: string }) => {
      if (data.agentId !== effectiveAgentId) return;
      setBusyKill(null);
      if (!data.success) {
        setError(data.error || 'kill failed');
      } else {
        // Refresh immediately after a successful kill
        requestList();
      }
    };

    const requestList = () => {
      if (paused) return;
      setLoading(true);
      reqIdRef.current += 1;
      socket.emit('processes:list', { agentId: effectiveAgentId, limit: 200, requestId: reqIdRef.current });
    };

    socket.on('processes:list:result', onResult);
    socket.on('processes:kill:result', onKillResult);
    requestList();

    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(requestList, REFRESH_MS);

    return () => {
      socket.off('processes:list:result', onResult);
      socket.off('processes:kill:result', onKillResult);
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [effectiveAgentId, paused]);

  const requestList = () => {
    const socket = getSocket();
    if (!socket || !effectiveAgentId) return;
    setLoading(true);
    reqIdRef.current += 1;
    socket.emit('processes:list', { agentId: effectiveAgentId, limit: 200, requestId: reqIdRef.current });
  };

  const handleKill = (pid: number, name: string) => {
    if (!canKill) return;
    if (!window.confirm(t('processes.confirmKill', { pid: String(pid), name }))) return;
    const socket = getSocket();
    if (!socket || !effectiveAgentId) return;
    setBusyKill(pid);
    reqIdRef.current += 1;
    socket.emit('processes:kill', { agentId: effectiveAgentId, pid, requestId: reqIdRef.current });
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = list;
    if (q) {
      out = out.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q) || (p.user || '').toLowerCase().includes(q));
    }
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case 'cpu': return b.cpu - a.cpu;
        case 'mem': return b.mem - a.mem;
        case 'pid': return a.pid - b.pid;
        case 'name': return a.name.localeCompare(b.name);
      }
    });
    return out;
  }, [list, filter, sortKey]);

  const onlineAgents = agents.filter((a) => a.status === 'online');

  // styling
  const cardBg = isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm';
  const muted = isDark ? 'text-zinc-500' : 'text-gray-500';
  const headBorder = isDark ? 'border-zinc-800' : 'border-gray-200';

  const sortBtn = (key: SortKey, label: string) => (
    <button
      onClick={() => setSortKey(key)}
      className={`text-[11px] uppercase tracking-wider px-2 py-1 rounded-md border transition ${
        sortKey === key
          ? isDark ? 'border-blue-500/50 text-blue-300 bg-blue-500/10' : 'border-blue-300 text-blue-700 bg-blue-50'
          : isDark ? 'border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'border-gray-300 text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );

  const cpuBar = (val: number) => (
    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-zinc-800' : 'bg-gray-200'}`}>
      <div
        className={`h-full ${val > 50 ? 'bg-red-500' : val > 20 ? 'bg-amber-500' : 'bg-emerald-500'}`}
        style={{ width: `${Math.min(100, val)}%` }}
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col max-w-6xl mx-auto py-4 sm:py-8 px-1 sm:pr-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight flex items-center gap-2`}>
            <Cpu className="w-5 h-5 text-blue-500" />
            {t('processes.title')}
          </h2>
          <p className={`text-sm ${muted} mt-1`}>{t('processes.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition ${isDark ? 'border-zinc-700 hover:bg-zinc-900 text-zinc-300' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
            title={paused ? t('processes.resume') : t('processes.pause')}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? t('processes.resume') : t('processes.pause')}
          </button>
          <button
            onClick={requestList}
            disabled={loading || !effectiveAgentId}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition disabled:opacity-50 ${isDark ? 'border-zinc-700 hover:bg-zinc-900 text-zinc-300' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('processes.refresh')}
          </button>
        </div>
      </div>

      {/* Agent picker + filter */}
      <div className={`${cardBg} border rounded-xl p-3 flex flex-wrap items-center gap-3`}>
        <select
          value={effectiveAgentId}
          onChange={(e) => { setSelectedAgent(e.target.value); setList([]); setSummary(null); }}
          className={`text-sm flex-1 min-w-[12rem] px-2 py-1.5 rounded-lg border ${isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
        >
          <option value="" className="bg-white text-gray-900">{t('processes.selectDevice')}</option>
          {onlineAgents.map((a) => (
            <option key={a.id} value={a.id} className="bg-white text-gray-900">{a.hostname} ({a.ip})</option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 flex-1 min-w-[12rem]">
          <Search className={`w-4 h-4 ${muted}`} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('processes.filterPlaceholder')}
            className={`flex-1 text-sm px-2 py-1 rounded-md border ${isDark ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`}
          />
          {filter && (
            <button onClick={() => setFilter('')} className={muted}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] uppercase tracking-wider ${muted}`}>{t('processes.sort')}:</span>
          {sortBtn('cpu', 'CPU')}
          {sortBtn('mem', 'MEM')}
          {sortBtn('name', t('processes.name'))}
          {sortBtn('pid', 'PID')}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className={`text-xs ${muted} flex flex-wrap gap-4`}>
          <span>{t('processes.summaryAll')}: <strong className={isDark ? 'text-zinc-300' : 'text-gray-700'}>{summary.all}</strong></span>
          <span>{t('processes.summaryRunning')}: <strong className={isDark ? 'text-zinc-300' : 'text-gray-700'}>{summary.running}</strong></span>
          <span>{t('processes.summarySleeping')}: <strong className={isDark ? 'text-zinc-300' : 'text-gray-700'}>{summary.sleeping}</strong></span>
          <span>{t('processes.summaryShown')}: <strong className={isDark ? 'text-zinc-300' : 'text-gray-700'}>{filtered.length}</strong></span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={`px-4 py-2 rounded-lg text-sm flex items-start gap-2 ${isDark ? 'bg-red-500/10 border border-red-500/30 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Process table */}
      <div className={`${cardBg} border rounded-2xl overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-left text-[11px] uppercase tracking-wider ${muted} border-b ${headBorder}`}>
                <th className="px-3 py-2.5 w-16">PID</th>
                <th className="px-3 py-2.5">{t('processes.name')}</th>
                <th className="px-3 py-2.5 w-24">{t('processes.user')}</th>
                <th className="px-3 py-2.5 w-32">CPU %</th>
                <th className="px-3 py-2.5 w-28">{t('processes.memory')}</th>
                {canKill && <th className="px-3 py-2.5 w-20 text-right">{t('processes.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.pid} className={`border-b ${isDark ? 'border-zinc-900 last:border-0' : 'border-gray-100 last:border-0'}`}>
                  <td className={`px-3 py-2 font-mono text-xs ${muted}`}>{p.pid}</td>
                  <td className={`px-3 py-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    <div className="font-medium truncate max-w-[20rem]">{p.name}</div>
                    {p.command && p.command !== p.name && (
                      <div className={`text-[10px] ${muted} truncate max-w-[28rem]`} title={p.command}>{p.command}</div>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-xs ${muted}`}>{p.user || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono w-10 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>{p.cpu.toFixed(1)}</span>
                      <div className="flex-1">{cpuBar(p.cpu)}</div>
                    </div>
                  </td>
                  <td className={`px-3 py-2 text-xs ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                    {p.mem.toFixed(1)}% <span className={muted}>({p.memRssMb} MB)</span>
                  </td>
                  {canKill && (
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleKill(p.pid, p.name)}
                        disabled={busyKill === p.pid}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                        {t('processes.kill')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canKill ? 6 : 5} className={`px-3 py-8 text-center text-sm ${muted}`}>
                    {effectiveAgentId ? (loading ? t('processes.loading') : t('processes.empty')) : t('processes.selectDeviceFirst')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
