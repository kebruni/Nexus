import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, HardDrive, Laptop, Monitor, Clock } from 'lucide-react';
import { getSocket } from '../api/socket';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import type { TranslationKey } from '../i18n/translations';
import type { Agent } from '../types';

const API_BASE = 'http://localhost:3000/api';

function OsIcon({ platform, className }: { className?: string; platform: string }) {
  if (platform === 'win32') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M3 12.5h8V21l-8-1.22V12.5zm0-1h8V3L3 4.22V11.5zm9 1h9V22l-9-1.37V12.5zm0-1h9V2l-9 1.37V11.5z" />
      </svg>
    );
  }

  if (platform === 'darwin') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12.5 2c-1.77 0-3.15 1.38-3.45 3.22-.18 1.12.2 2.25.89 3.03.38.43.26 1.1-.04 1.53-.62.87-1.6 1.51-2.43 2.36C6.25 13.4 5.5 15.09 5.5 17c0 .58.05 1.12.15 1.63.22 1.16.73 2.16 1.47 2.89.38.38.88.53 1.38.53h7c.5 0 1-.15 1.38-.53.74-.73 1.25-1.73 1.47-2.89.1-.51.15-1.05.15-1.63 0-1.91-.75-3.6-1.97-4.86-.83-.85-1.81-1.49-2.43-2.36-.3-.43-.42-1.1-.04-1.53.69-.78 1.07-1.91.89-3.03C14.65 3.38 13.27 2 12.5 2z" />
    </svg>
  );
}

function formatMemory(bytes: number) {
  if (!bytes) return '--';
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function buildSparkPath(sparkData: number[]) {
  if (sparkData.length < 2) return null;

  const width = 100;
  const height = 28;
  const maxValue = Math.max(...sparkData, 1);
  const step = width / (sparkData.length - 1);
  const points = sparkData.map((value, index) => `${index * step},${height - (value / maxValue) * (height - 2)}`);

  return `M${points.join(' L')}`;
}

export default function Devices() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [latencies, setLatencies] = useState<Record<string, number>>({});
  const [sparkDataByAgent, setSparkDataByAgent] = useState<Record<string, number[]>>({});
  const [now, setNow] = useState(() => Date.now());
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isDark } = useTheme();

  useEffect(() => {
    const updateClock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(updateClock);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('pc-hub-token');
    if (token) {
      fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => response.json())
        .then(setAgents)
        .catch(console.error);
    }

    const socket = getSocket();
    if (!socket) return;

    socket.emit('agents:requestList');

    const handleAgentsList = (list: Agent[]) => setAgents(list);

    const handleMetrics = ({ agentId, metrics }: { agentId: string; metrics: Agent['metrics'] }) => {
      if (!metrics) return;

      setAgents((previousAgents) =>
        previousAgents.map((agent) => (agent.id === agentId ? { ...agent, metrics, status: 'online' } : agent)),
      );
      setSparkDataByAgent((previous) => ({
        ...previous,
        [agentId]: [...(previous[agentId] || []).slice(-19), metrics.cpu.load],
      }));
    };

    const handleLatency = ({ agentId, latency }: { agentId: string; latency: number }) => {
      setLatencies((previous) => ({ ...previous, [agentId]: latency }));
    };

    socket.on('agents:list', handleAgentsList);
    socket.on('agent:metrics', handleMetrics);
    socket.on('agent:latency', handleLatency);

    return () => {
      socket.off('agents:list', handleAgentsList);
      socket.off('agent:metrics', handleMetrics);
      socket.off('agent:latency', handleLatency);
    };
  }, []);

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto py-4 sm:py-8 px-1 sm:pr-8">
      <div className="mb-4 sm:mb-8">
        <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>{t('devices.title')}</h2>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'} mt-1`}>{agents.length} {t('devices.connected')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isDark={isDark}
            latency={latencies[agent.id]}
            now={now}
            onClick={() => navigate(`/dashboard/computer/${agent.id}`)}
            sparkData={sparkDataByAgent[agent.id] || []}
            t={t}
          />
        ))}
        {agents.length === 0 && (
          <div className={`col-span-full py-16 sm:py-20 flex flex-col items-center justify-center ${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200'} border border-dashed rounded-2xl`}>
            <div className={`w-12 h-12 ${isDark ? 'bg-zinc-900' : 'bg-gray-100'} rounded-full flex items-center justify-center mb-3`}>
              <Laptop className={`w-5 h-5 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`} strokeWidth={1.5} />
            </div>
            <p className={`${isDark ? 'text-zinc-400' : 'text-gray-600'} font-medium`}>{t('devices.noDevices')}</p>
            <p className={`${isDark ? 'text-zinc-600' : 'text-gray-400'} text-sm mt-1`}>{t('devices.startAgent')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  isDark,
  latency,
  now,
  onClick,
  sparkData,
  t,
}: {
  agent: Agent;
  isDark: boolean;
  latency?: number;
  now: number;
  onClick: () => void;
  sparkData: number[];
  t: (key: TranslationKey) => string;
}) {
  const isOnline = agent.status === 'online';
  const sparkPath = useMemo(() => buildSparkPath(sparkData), [sparkData]);
  const uptimeLabel = useMemo(() => {
    if (!agent.connectedAt || !isOnline) return null;

    const elapsedMs = now - new Date(agent.connectedAt).getTime();
    const hours = Math.floor(elapsedMs / 3_600_000);
    const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000);

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }, [agent.connectedAt, isOnline, now]);

  const latencyColor = latency == null
    ? ''
    : latency < 50
      ? 'text-emerald-400'
      : latency < 150
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div
      className={`${isDark ? 'bg-[#121212] border-zinc-800 hover:border-zinc-700 hover:bg-[#151515]' : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50 shadow-sm'} border rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group flex flex-col relative`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          isOnline ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-400'
        }`}>
          {agent.platform ? (
            <OsIcon platform={agent.platform} className="w-5 h-5" />
          ) : (
            <Monitor className="w-5 h-5" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOnline && latency != null && (
            <span className={`text-[10px] font-bold ${latencyColor} tabular-nums`} title="Latency">
              {latency}ms
            </span>
          )}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
            isOnline ? 'bg-emerald-500/10 text-emerald-400' : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : isDark ? 'bg-zinc-600' : 'bg-gray-400'}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {isOnline ? t('devices.ready') : t('devices.offline')}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-2">
        <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'} text-base mb-0.5 truncate group-hover:text-blue-400 transition-colors`}>{agent.hostname}</h3>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'} font-mono truncate`}>{agent.ip}</p>
      </div>

      {isOnline && sparkPath && (
        <div className="mb-2 h-7 w-full overflow-hidden opacity-60 group-hover:opacity-100 transition-opacity">
          <svg viewBox="0 0 100 28" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`spark-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${sparkPath} L100,28 L0,28 Z`} fill={`url(#spark-${agent.id})`} />
            <path d={sparkPath} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${isDark ? 'text-zinc-500' : 'text-gray-400'} mt-auto pt-3 border-t ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
        {agent.platform && (
          <span className="truncate max-w-[120px]" title={agent.osVersion || agent.platform}>
            {agent.platform === 'win32' ? 'Windows' : agent.platform === 'darwin' ? 'macOS' : agent.platform}
          </span>
        )}
        {agent.cpuModel && (
          <span className="flex items-center gap-1 truncate max-w-[140px]" title={agent.cpuModel}>
            <Cpu className="w-3 h-3 shrink-0" />
            {agent.cpuCores || '?'}c
          </span>
        )}
        {agent.totalMemory > 0 && (
          <span className="flex items-center gap-1">
            <HardDrive className="w-3 h-3 shrink-0" />
            {formatMemory(agent.totalMemory)}
          </span>
        )}
        {uptimeLabel && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 shrink-0" />
            {uptimeLabel}
          </span>
        )}
      </div>
    </div>
  );
}
