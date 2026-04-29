import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSocket } from '../api/socket';
import type { Agent, Metrics } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import {
  ArrowLeft,
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Monitor,
  Power,
  RotateCcw,
  Settings,
  Thermometer,
  Gauge,
  Zap,
  Clock,
  ArrowDown,
  ArrowUp,
  Fan,
  Lock,
  Volume2,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import Services from './Services';

const API_BASE = '/api';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatBytesPerSec(bytes: number): string {
  return formatBytes(bytes) + '/s';
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type Tab = 'monitoring' | 'services';

function formatPercentTooltip(value: number | string, label: string): [string, string] {
  return [`${Number(value).toFixed(1)}%`, label];
}

function formatNetworkTooltip(value: number | string, label: string): [string, string] {
  return [`${Number(value).toFixed(1)} KB/s`, label];
}

function formatTemperatureTooltip(value: number | string, label: string): [string, string] {
  return [`${Number(value).toFixed(1)}°C`, label];
}

export default function ComputerDetail() {
  const { id } = useParams<{ id: string }>();
  const { isDark } = useTheme();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<(Metrics & { timestamp: string })[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('monitoring');
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !id) return;

    socket.emit('agents:requestList');

    // Get agent from list
    socket.on('agents:list', (list: Agent[]) => {
      const found = list.find((a) => a.id === id);
      if (found) setAgent(found);
    });

    // Real-time metrics
    socket.on('agent:metrics', ({ agentId, metrics }: { agentId: string; metrics: Metrics }) => {
      if (agentId !== id) return;
      setAgent((prev) =>
        prev ? { ...prev, metrics, status: 'online', lastSeen: new Date().toISOString() } : prev
      );
      setMetricsHistory((prev) => {
        const next = [...prev, { ...metrics, timestamp: new Date().toISOString() }];
        return next.slice(-60); // Keep last 60 data points (3 minutes at 3s interval)
      });
    });

    socket.on('agent:disconnected', ({ agentId }: { agentId: string }) => {
      if (agentId === id) {
        setAgent((prev) => (prev ? { ...prev, status: 'offline' } : prev));
      }
    });

    // Fetch current agent info
    const token = localStorage.getItem('pc-hub-token');
    if (token) {
      fetch(`${API_BASE}/agents/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          if (data.id) setAgent(data);
        })
        .catch(console.error);

      // Fetch metrics history
      fetch(`${API_BASE}/agents/${id}/metrics?limit=60`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setMetricsHistory)
        .catch(console.error);
    }

    return () => {
      socket.off('agents:list');
      socket.off('agent:metrics');
      socket.off('agent:disconnected');
    };
  }, [id]);

  const handleReboot = () => {
    const socket = getSocket();
    if (socket && id) {
      socket.emit('command:reboot', { agentId: id });
      setConfirmAction(null);
    }
  };

  const handleShutdown = () => {
    const socket = getSocket();
    if (socket && id) {
      socket.emit('command:shutdown', { agentId: id });
      setConfirmAction(null);
    }
  };

  const handleLock = () => {
    const socket = getSocket();
    if (socket && id) {
      socket.emit('command:lockscreen', { agentId: id });
    }
  };

  const handleAlarm = () => {
    const socket = getSocket();
    if (socket && id) {
      socket.emit('command:alarm', { agentId: id });
    }
  };

  if (!agent) {
    return (
      <div className="p-6">
        <Link to="/dashboard" className="text-blue-400 hover:text-blue-300 flex items-center gap-2 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <div className={`${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border rounded-xl p-12 text-center`}>
          <Monitor className={`w-12 h-12 ${isDark ? 'text-slate-600' : 'text-gray-300'} mx-auto mb-3`} />
          <p className={isDark ? 'text-slate-400' : 'text-gray-500'}>Loading computer details...</p>
        </div>
      </div>
    );
  }

  const isOnline = agent.status === 'online';
  const m = agent.metrics;

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: 'monitoring', label: 'Monitoring', icon: <Cpu className="w-4 h-4" /> },
    { key: 'services', label: 'Services', icon: <Settings className="w-4 h-4" /> },
  ];

  // Chart data
  const chartData = metricsHistory.map((m, i) => ({
    time: i,
    cpu: m.cpu.load,
    ram: m.memory.usedPercent,
    disk: m.disk.usedPercent,
    netRx: m.network.rxSec / 1024,
    netTx: m.network.txSec / 1024,
    gpu: m.gpus && m.gpus.length > 0 ? m.gpus[0].load : 0,
    gpuTemp: m.gpus && m.gpus.length > 0 ? m.gpus[0].temperature : 0,
  }));

  const hasGpu = m?.gpus && m.gpus.length > 0;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className={`${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'} transition`}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-blue-400" />
              <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{agent.hostname}</h1>
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isOnline ? 'bg-emerald-400 pulse-online' : 'bg-slate-500'
                }`}
              />
              <span className={`text-sm ${isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} mt-0.5`}>
              {agent.osVersion} • {agent.ip} • {agent.cpuModel} ({agent.cpuCores} cores) •{' '}
              {formatBytes(agent.totalMemory)} RAM
              {agent.gpuModel && agent.gpuModel !== 'N/A' && ` • ${agent.gpuModel}`}
            </p>
          </div>
        </div>

        {/* Actions */}
        {isOnline && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleLock}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm rounded-lg hover:bg-blue-500/20 transition"
              title="Lock Screen"
            >
              <Lock className="w-4 h-4" />
              Lock
            </button>

            <button
              onClick={handleAlarm}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm rounded-lg hover:bg-purple-500/20 transition"
              title="Sound Alarm"
            >
              <Volume2 className="w-4 h-4" />
              Alarm
            </button>

            {confirmAction === 'reboot' ? (
              <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-1.5">
                <span className="text-sm text-orange-400">Confirm reboot?</span>
                <button onClick={handleReboot} className="px-2 py-1 bg-orange-600 text-white text-xs rounded">
                  Yes
                </button>
                <button onClick={() => setConfirmAction(null)} className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-slate-600 text-white' : 'bg-gray-300 text-gray-700'}`}>
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmAction('reboot')}
                className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm rounded-lg hover:bg-orange-500/20 transition"
              >
                <RotateCcw className="w-4 h-4" />
                Reboot
              </button>
            )}

            {confirmAction === 'shutdown' ? (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
                <span className="text-sm text-red-400">Confirm shutdown?</span>
                <button onClick={handleShutdown} className="px-2 py-1 bg-red-600 text-white text-xs rounded">
                  Yes
                </button>
                <button onClick={() => setConfirmAction(null)} className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-slate-600 text-white' : 'bg-gray-300 text-gray-700'}`}>
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmAction('shutdown')}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg hover:bg-red-500/20 transition"
              >
                <Power className="w-4 h-4" />
                Shutdown
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      {m && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard
            icon={<Cpu className="w-4 h-4" />}
            label="CPU"
            value={m.cpu.load}
            suffix="%"
            color="#3b82f6"
            detail={`${agent.cpuCores} cores`}
          />
          <StatCard
            icon={<MemoryStick className="w-4 h-4" />}
            label="RAM"
            value={m.memory.usedPercent}
            suffix="%"
            color="#a855f7"
            detail={`${formatBytes(m.memory.used)} / ${formatBytes(m.memory.total)}`}
          />
          <StatCard
            icon={<HardDrive className="w-4 h-4" />}
            label="Disk"
            value={m.disk.usedPercent}
            suffix="%"
            color="#f97316"
            detail={`${formatBytes(m.disk.totalUsed)} / ${formatBytes(m.disk.totalSize)}`}
          />
          <StatCard
            icon={<Wifi className="w-4 h-4" />}
            label="Network"
            color="#10b981"
            isNetwork
            networkDown={m.network.rxSec}
            networkUp={m.network.txSec}
            detail={`Uptime: ${formatUptime(m.uptime)}`}
          />
          {hasGpu && m.gpus && m.gpus.length > 0 ? (
            <StatCard
              icon={<Gauge className="w-4 h-4" />}
              label="GPU"
              value={m.gpus[0].load}
              suffix="%"
              color="#ec4899"
              detail={`${m.gpus[0].temperature > 0 ? m.gpus[0].temperature + '°C • ' : ''}${m.gpus[0].name.split(' ').slice(-2).join(' ')}`}
            />
          ) : (
            <StatCard
              icon={<Clock className="w-4 h-4" />}
              label="Uptime"
              color="#06b6d4"
              isText
              textValue={formatUptime(m.uptime)}
              detail={new Date(now - m.uptime * 1000).toLocaleDateString()}
            />
          )}
        </div>
      )}

      {/* Tabs */}
      <div className={`border-b ${isDark ? 'border-zinc-800/80' : 'border-gray-200'}`}>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-400'
                  : `border-transparent ${isDark ? 'text-slate-400 hover:text-white hover:border-slate-600' : 'text-gray-400 hover:text-gray-900 hover:border-gray-300'}`
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'monitoring' && <MonitoringTab data={chartData} metrics={m} />}
        {activeTab === 'services' && <Services agentId={id!} />}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   STAT CARD — top-level metric with animated ring
   ───────────────────────────────────────────────────────── */
function StatCard({
  icon, label, value, suffix, color, detail, isNetwork, networkDown, networkUp, isText, textValue,
}: {
  icon: ReactNode;
  label: string;
  value?: number;
  suffix?: string;
  color: string;
  detail?: string;
  isNetwork?: boolean;
  networkDown?: number;
  networkUp?: number;
  isText?: boolean;
  textValue?: string;
}) {
  const { isDark } = useTheme();
  const pct = Math.min(value ?? 0, 100);
  const r = 22;
  const circ = 2 * Math.PI * r;
  const off = circ - (pct / 100) * circ;

  return (
    <div className="metric-card group relative rounded-2xl p-4 transition-all duration-300 hover:translate-y-[-2px]" style={{ '--accent': color } as CSSProperties}>
      <div className="flex items-start gap-3">
        {/* ring / icon */}
        <div className="relative flex-shrink-0 w-12 h-12 flex items-center justify-center">
          {!isNetwork && !isText ? (
            <>
              <svg width="48" height="48" className="absolute inset-0 -rotate-90">
                <circle cx="24" cy="24" r={r} fill="none" strokeWidth="3.5" stroke="rgba(255,255,255,0.04)" />
                <circle
                  cx="24" cy="24" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
                  stroke={color}
                  strokeDasharray={circ}
                  strokeDashoffset={off}
                  className="ring-progress"
                />
              </svg>
              <span className={`text-[11px] font-bold ${isDark ? 'text-white/90' : 'text-gray-700'} z-10`}>{Math.round(pct)}</span>
            </>
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
              <span style={{ color }}>{icon}</span>
            </div>
          )}
        </div>
        {/* text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {!isNetwork && !isText && <span style={{ color }}>{icon}</span>}
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
          </div>
          {isNetwork ? (
            <div className="flex items-baseline gap-2">
              <span className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'} tabular-nums flex items-center gap-1`}>
                <ArrowDown className="w-3 h-3 text-emerald-400" />{formatBytesPerSec(networkDown ?? 0)}
              </span>
            </div>
          ) : isText ? (
            <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{textValue}</p>
          ) : (
            <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tabular-nums`}>{(value ?? 0).toFixed(1)}<span className="text-sm text-zinc-500">{suffix}</span></p>
          )}
          {detail && <p className="text-[10px] text-zinc-600 mt-0.5 truncate">{detail}</p>}
          {isNetwork && (
            <p className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1">
              <ArrowUp className="w-2.5 h-2.5 text-orange-400" />{formatBytesPerSec(networkUp ?? 0)}{detail ? ` • ${detail}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   MONITORING TAB
   ───────────────────────────────────────────────────────── */
function MonitoringTab({
  data,
  metrics,
}: {
  data: { time: number; cpu: number; ram: number; disk: number; netRx: number; netTx: number; gpu: number; gpuTemp: number }[];
  metrics: Metrics | null;
}) {
  const { isDark } = useTheme();
  const hasGpu = metrics?.gpus && metrics.gpus.length > 0;

  const tooltipStyle: CSSProperties = isDark
    ? {
        background: '#0c0c0f',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '10px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
        padding: '8px 12px',
        fontSize: '12px',
      }
    : {
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        padding: '8px 12px',
        fontSize: '12px',
      };

  return (
    <div className="space-y-4">
      {/* ── Charts Row ── */}
      <div className={`grid grid-cols-1 ${hasGpu ? 'xl:grid-cols-3' : 'xl:grid-cols-2'} gap-4`}>
        <ChartCard label="CPU" color="#3b82f6" value={metrics?.cpu.load} icon={<Cpu className="w-3.5 h-3.5" />}>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 100]} tick={{ fill: '#3f3f46', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ''} formatter={(value: number | string) => formatPercentTooltip(value, 'CPU')} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#gc)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#3b82f6' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard label="RAM" color="#a855f7" value={metrics?.memory.usedPercent} icon={<MemoryStick className="w-3.5 h-3.5" />}>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 100]} tick={{ fill: '#3f3f46', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ''} formatter={(value: number | string) => formatPercentTooltip(value, 'RAM')} />
              <Area type="monotone" dataKey="ram" stroke="#a855f7" fill="url(#gr)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#a855f7' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {hasGpu && (
          <ChartCard label="GPU" color="#ec4899" value={metrics?.gpus?.[0]?.load} icon={<Gauge className="w-3.5 h-3.5" />}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 100]} tick={{ fill: '#3f3f46', fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ''} formatter={(value: number | string) => formatPercentTooltip(value, 'GPU')} />
                <Area type="monotone" dataKey="gpu" stroke="#ec4899" fill="url(#gg)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#ec4899' }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* ── Network ── */}
      <ChartCard label="Network" color="#10b981" icon={<Wifi className="w-3.5 h-3.5" />}
        extra={
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-400"><ArrowDown className="w-3 h-3" /> Download</span>
            <span className="flex items-center gap-1 text-orange-400"><ArrowUp className="w-3 h-3" /> Upload</span>
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gnu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" hide />
            <YAxis tick={{ fill: '#3f3f46', fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ''} formatter={(value: number | string, name: string) => formatNetworkTooltip(value, name)} />
            <Area type="monotone" dataKey="netRx" stroke="#10b981" fill="url(#gnd)" strokeWidth={2} dot={false} name="↓ Down" />
            <Area type="monotone" dataKey="netTx" stroke="#f97316" fill="url(#gnu)" strokeWidth={1.5} dot={false} name="↑ Up" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── GPU Cards ── */}
      {metrics?.gpus && metrics.gpus.length > 0 && (
        <div className="section-card">
          <SectionHeader icon={<Gauge className="w-4 h-4" />} color="#ec4899" label="GPU" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {metrics.gpus.map((gpu, i) => {
              const vramPct = gpu.vram > 0 && (gpu.vramUsed ?? 0) > 0
                ? Math.round(((gpu.vramUsed ?? 0) / gpu.vram) * 100) : 0;
              return (
                <div key={i} className="inner-card">
                  {/* header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${gpu.load > 0 ? 'bg-emerald-400 shadow-[0_0_4px_#34d399]' : 'bg-zinc-700'}`} />
                      <span className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'} truncate`}>{gpu.name}</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-pink-400">{gpu.load.toFixed(1)}%</span>
                  </div>
                  {/* load bar */}
                  <ProgressBar value={gpu.load} color="from-pink-500 via-fuchsia-500 to-purple-500" className="mb-3" />
                  {/* VRAM bar */}
                  {gpu.vram > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-zinc-500">VRAM</span>
                        <span className="text-purple-400 font-mono">
                          {(gpu.vramUsed ?? 0) > 0 ? `${formatBytes((gpu.vramUsed ?? 0) * 1024 * 1024)} / ` : ''}
                          {formatBytes(gpu.vram * 1024 * 1024)}
                        </span>
                      </div>
                      {vramPct > 0 && <ProgressBar value={vramPct} color="from-purple-500 to-violet-500" />}
                    </div>
                  )}
                  {/* detail chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {gpu.temperature > 0 && (
                      <Chip icon={<Thermometer className="w-3 h-3" />} value={`${gpu.temperature}°C`}
                        accent={gpu.temperature > 85 ? '#ef4444' : gpu.temperature > 70 ? '#f97316' : '#10b981'} />
                    )}
                    {(gpu.powerDraw ?? 0) > 0 && (
                      <Chip icon={<Zap className="w-3 h-3" />} value={`${gpu.powerDraw?.toFixed(0)}W`} accent="#eab308" />
                    )}
                    {(gpu.fanSpeed ?? 0) > 0 && (
                      <Chip icon={<Fan className="w-3 h-3" />} value={`${gpu.fanSpeed}%`} accent="#06b6d4" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── GPU Temperature Chart ── */}
      {hasGpu && data.some(d => d.gpuTemp > 0) && (
        <ChartCard label="GPU Temperature" color="#f43f5e" value={metrics?.gpus?.[0]?.temperature} valueSuffix="°C" icon={<Thermometer className="w-3.5 h-3.5" />}>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" hide />
              <YAxis tick={{ fill: '#3f3f46', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ''} formatter={(value: number | string) => formatTemperatureTooltip(value, 'GPU')} />
              <Area type="monotone" dataKey="gpuTemp" stroke="#f43f5e" fill="url(#gt)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── Disks ── */}
      {metrics && metrics.disk.disks.length > 0 && (
        <div className="section-card">
          <SectionHeader icon={<HardDrive className="w-4 h-4" />} color="#f97316" label="Disk Partitions" />
          <div className="space-y-3">
            {metrics.disk.disks.map((disk, i) => {
              const p = disk.usedPercent;
              const barCls = p > 90 ? 'from-red-500 to-rose-600' : p > 70 ? 'from-orange-500 to-amber-500' : 'from-sky-500 to-blue-500';
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[13px] ${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>{disk.mount} <span className={`${isDark ? 'text-zinc-600' : 'text-gray-400'} text-xs`}>({disk.fs})</span></span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      {formatBytes(disk.used)}<span className="text-zinc-700"> / </span>{formatBytes(disk.size)}
                      <span className={`ml-1.5 font-bold ${p > 90 ? 'text-red-400' : p > 70 ? 'text-orange-400' : 'text-sky-400'}`}>{p.toFixed(1)}%</span>
                    </span>
                  </div>
                  <ProgressBar value={p} color={barCls} height="h-[6px]" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CPU Cores ── */}
      {metrics && metrics.cpu.cores.length > 0 && (
        <div className="section-card">
          <SectionHeader icon={<Cpu className="w-4 h-4" />} color="#3b82f6" label={`CPU Cores (${metrics.cpu.cores.length})`} />
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-2">
            {metrics.cpu.cores.map((core) => {
              const l = core.load;
              const clr = l > 90 ? '#ef4444' : l > 70 ? '#f97316' : l > 40 ? '#3b82f6' : '#10b981';
              return (
                <div key={core.core} className="core-cell">
                  <div className="text-[9px] text-zinc-600 font-medium uppercase tracking-widest mb-1">C{core.core}</div>
                  <div className="text-[15px] font-mono font-bold" style={{ color: clr }}>{l.toFixed(0)}%</div>
                  <div className="w-full h-[3px] bg-zinc-800/80 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${l}%`, background: clr }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Memory ── */}
      {metrics && (
        <div className="section-card">
          <SectionHeader icon={<MemoryStick className="w-4 h-4" />} color="#a855f7" label="Memory" />
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-zinc-500">Physical Memory</span>
              <span className="text-[11px] font-mono text-purple-400">{formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}</span>
            </div>
            <ProgressBar value={metrics.memory.usedPercent} color="from-purple-500 to-violet-500" height="h-[6px]" />
          </div>
          {metrics.memory.swapTotal > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-zinc-500">Swap</span>
                <span className="text-[11px] font-mono text-orange-400">{formatBytes(metrics.memory.swapUsed)} / {formatBytes(metrics.memory.swapTotal)}</span>
              </div>
              <ProgressBar value={metrics.memory.swapTotal > 0 ? (metrics.memory.swapUsed / metrics.memory.swapTotal * 100) : 0} color="from-orange-500 to-amber-500" height="h-[3px]" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <MiniBox label="Free" value={formatBytes(metrics.memory.free)} color="#10b981" />
            <MiniBox label="Available" value={formatBytes(metrics.memory.available)} color="#3b82f6" />
            <MiniBox label="Cached" value={formatBytes(metrics.memory.total - metrics.memory.used - metrics.memory.free)} color="#8b5cf6" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   PRIMITIVES
   ───────────────────────────────────────────────────────── */

function ProgressBar({ value, color, height = 'h-[4px]', className = '' }: { value: number; color: string; height?: string; className?: string }) {
  return (
    <div className={`w-full ${height} bg-zinc-800/80 rounded-full overflow-hidden ${className}`}>
      <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700 ease-out`} style={{ width: `${Math.max(value, 0.5)}%` }} />
    </div>
  );
}

function SectionHeader({ icon, color, label }: { icon: ReactNode; color: string; label: string }) {
  const { isDark } = useTheme();
  return (
    <div className="flex items-center gap-2 mb-4">
      <span style={{ color }}>{icon}</span>
      <h3 className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{label}</h3>
    </div>
  );
}

function Chip({ icon, value, accent }: { icon: ReactNode; value: string; accent: string }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold"
      style={{ background: `${accent}10`, color: accent }}>
      {icon}{value}
    </div>
  );
}

function MiniBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="inner-card text-center py-2.5">
      <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-[13px] font-mono font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function ChartCard({ label, color, value, valueSuffix = '%', icon, extra, children }: {
  label: string; color: string; value?: number; valueSuffix?: string; icon: ReactNode; extra?: ReactNode; children: ReactNode;
}) {
  const { isDark } = useTheme();
  return (
    <div className="section-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ color }}>{icon}</span>
          <span className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{label}</span>
        </div>
        <div className="flex items-center gap-3">
          {extra}
          {value !== undefined && (
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md" style={{ color, background: `${color}12` }}>
              {value.toFixed(1)}{valueSuffix}
            </span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
