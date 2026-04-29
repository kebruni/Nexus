import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../api/socket';
import type { Agent, GpuInfo } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Gauge,
  Monitor,
  Thermometer,
  Server,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

const API_BASE = '/api';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatBps(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}

const tooltipStyle: React.CSSProperties = {
  background: '#0c0c0f',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '10px',
  boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
  padding: '8px 12px',
  fontSize: '12px',
};

export default function Analytics() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const { isDark } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('pc-hub-token');
    if (token) {
      fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setAgents)
        .catch(console.error);
    }

    const socket = getSocket();
    if (!socket) return;

    socket.emit('agents:requestList');
    socket.on('agents:list', (list: Agent[]) => setAgents(list));
    socket.on('agent:metrics', ({ agentId, metrics }: { agentId: string; metrics: Agent['metrics'] }) => {
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, metrics, status: 'online' } : a))
      );
    });

    return () => {
      socket.off('agents:list');
      socket.off('agent:metrics');
    };
  }, []);

  const onlineAgents = agents.filter(a => a.status === 'online');
  const offlineAgents = agents.filter(a => a.status === 'offline');

  // Aggregate metrics
  const totalCpu = onlineAgents.length > 0
    ? onlineAgents.reduce((s, a) => s + (a.metrics?.cpu.load ?? 0), 0) / onlineAgents.length : 0;
  const totalRamUsed = onlineAgents.reduce((s, a) => s + (a.metrics?.memory.used ?? 0), 0);
  const totalRam = onlineAgents.reduce((s, a) => s + (a.metrics?.memory.total ?? 0), 0);
  const totalRamPct = totalRam > 0 ? (totalRamUsed / totalRam) * 100 : 0;
  const totalDiskUsed = onlineAgents.reduce((s, a) => s + (a.metrics?.disk.totalUsed ?? 0), 0);
  const totalDisk = onlineAgents.reduce((s, a) => s + (a.metrics?.disk.totalSize ?? 0), 0);
  const totalDiskPct = totalDisk > 0 ? (totalDiskUsed / totalDisk) * 100 : 0;
  const totalNetDown = onlineAgents.reduce((s, a) => s + (a.metrics?.network.rxSec ?? 0), 0);
  const totalNetUp = onlineAgents.reduce((s, a) => s + (a.metrics?.network.txSec ?? 0), 0);

  // All GPUs across agents
  const allGpus: { agent: Agent; gpu: GpuInfo }[] = [];
  onlineAgents.forEach(a => {
    a.metrics?.gpus?.forEach(g => allGpus.push({ agent: a, gpu: g }));
  });

  // Per-agent chart data for bar chart
  const agentBarData = onlineAgents.map(a => ({
    name: a.hostname.length > 12 ? a.hostname.slice(0, 12) + '…' : a.hostname,
    cpu: a.metrics?.cpu.load ?? 0,
    ram: a.metrics?.memory.usedPercent ?? 0,
    disk: a.metrics?.disk.usedPercent ?? 0,
  }));

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto py-8 pr-8 space-y-6">
      {/* Header */}
      <div>
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>Аналитика</h2>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'} mt-1`}>
          {onlineAgents.length} онлайн • {offlineAgents.length} оффлайн • {agents.length} всего
        </p>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <AggCard icon={<Server className="w-4 h-4" />} label="Устройства" color="#3b82f6"
          main={`${onlineAgents.length}`} sub={`${agents.length} всего`} />
        <AggCard icon={<Cpu className="w-4 h-4" />} label="Ср. CPU" color="#3b82f6"
          main={`${totalCpu.toFixed(1)}%`} sub={`по ${onlineAgents.length} устр.`} pct={totalCpu} />
        <AggCard icon={<MemoryStick className="w-4 h-4" />} label="RAM" color="#a855f7"
          main={`${totalRamPct.toFixed(1)}%`} sub={`${formatBytes(totalRamUsed)} / ${formatBytes(totalRam)}`} pct={totalRamPct} />
        <AggCard icon={<HardDrive className="w-4 h-4" />} label="Диск" color="#f97316"
          main={`${totalDiskPct.toFixed(1)}%`} sub={`${formatBytes(totalDiskUsed)} / ${formatBytes(totalDisk)}`} pct={totalDiskPct} />
        <AggCard icon={<Wifi className="w-4 h-4" />} label="Сеть" color="#10b981"
          main={formatBps(totalNetDown * 1024)} sub={`↑ ${formatBps(totalNetUp * 1024)}`} />
      </div>

      {/* Per-agent comparison */}
      {agentBarData.length > 0 && (
        <div className="section-card">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-blue-400"><Monitor className="w-4 h-4" /></span>
            <h3 className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Нагрузка по устройствам</h3>
            <div className="ml-auto flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" /> CPU</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-500 inline-block" /> RAM</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500 inline-block" /> Disk</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={agentBarData} barGap={2}>
              <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#3f3f46', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={isDark ? tooltipStyle : { ...tooltipStyle, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} labelFormatter={() => ''} />
              <Bar dataKey="cpu" fill="#3b82f6" radius={[4, 4, 0, 0]} name="CPU %" />
              <Bar dataKey="ram" fill="#a855f7" radius={[4, 4, 0, 0]} name="RAM %" />
              <Bar dataKey="disk" fill="#f97316" radius={[4, 4, 0, 0]} name="Disk %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* All devices table */}
      <div className="section-card">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-blue-400"><Monitor className="w-4 h-4" /></span>
            <h3 className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Все устройства</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-zinc-600 border-zinc-800/80' : 'text-gray-400 border-gray-200'} border-b`}>
                <th className="text-left py-2 px-3 font-semibold">Устройство</th>
                <th className="text-left py-2 px-3 font-semibold">Статус</th>
                <th className="text-right py-2 px-3 font-semibold">CPU</th>
                <th className="text-right py-2 px-3 font-semibold">RAM</th>
                <th className="text-right py-2 px-3 font-semibold">Диск</th>
                <th className="text-right py-2 px-3 font-semibold">Сеть ↓</th>
                <th className="text-right py-2 px-3 font-semibold">GPU</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => {
                const m = agent.metrics;
                const online = agent.status === 'online';
                return (
                  <tr key={agent.id}
                    className={`border-b ${isDark ? 'border-zinc-800/40 hover:bg-white/[0.02]' : 'border-gray-100 hover:bg-gray-50'} cursor-pointer transition-colors`}
                    onClick={() => navigate(`/dashboard/computer/${agent.id}`)}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_4px_#34d399]' : 'bg-zinc-700'}`} />
                        <span className={`${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>{agent.hostname}</span>
                        <span className={`${isDark ? 'text-zinc-600' : 'text-gray-400'} text-xs font-mono`}>{agent.ip}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        online ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 bg-zinc-800'
                      }`}>
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {m ? <MetricCell value={m.cpu.load} color="#3b82f6" /> : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {m ? <MetricCell value={m.memory.usedPercent} color="#a855f7" /> : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {m ? <MetricCell value={m.disk.usedPercent} color="#f97316" /> : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {m ? (
                        <span className="text-zinc-400 font-mono text-xs">{formatBps(m.network.rxSec * 1024)}</span>
                      ) : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {m?.gpus && m.gpus.length > 0 ? (
                        <span className="text-pink-400 font-mono text-xs font-bold">{m.gpus[0].load.toFixed(0)}%</span>
                      ) : <span className="text-zinc-700">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* GPUs across all agents */}
      {allGpus.length > 0 && (
        <div className="section-card">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-pink-400"><Gauge className="w-4 h-4" /></span>
            <h3 className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Все GPU</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {allGpus.map((item, i) => (
              <div key={i} className="inner-card">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.gpu.name}</span>
                    <span className="text-[10px] text-zinc-600 ml-2">{item.agent.hostname}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-pink-400">{item.gpu.load.toFixed(1)}%</span>
                </div>
                <div className="w-full h-[4px] bg-zinc-800/80 rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 transition-all duration-700"
                    style={{ width: `${Math.max(item.gpu.load, 0.5)}%` }} />
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                  {item.gpu.temperature > 0 && (
                    <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                      item.gpu.temperature > 85 ? 'text-red-400 bg-red-500/10' : item.gpu.temperature > 70 ? 'text-orange-400 bg-orange-500/10' : 'text-emerald-400 bg-emerald-500/10'
                    }`}><Thermometer className="w-2.5 h-2.5" />{item.gpu.temperature}°C</span>
                  )}
                  {item.gpu.vram > 0 && (
                    <span className="text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                      VRAM {item.gpu.vramUsed ? `${formatBytes((item.gpu.vramUsed) * 1024 * 1024)} / ` : ''}{formatBytes(item.gpu.vram * 1024 * 1024)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AggCard({ icon, label, color, main, sub, pct }: {
  icon: React.ReactNode; label: string; color: string; main: string; sub: string; pct?: number;
}) {
  const { isDark } = useTheme();
  return (
    <div className="metric-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tabular-nums mb-0.5`}>{main}</p>
      <p className="text-[10px] text-zinc-600">{sub}</p>
      {pct !== undefined && (
        <div className="w-full h-[3px] bg-zinc-800/80 rounded-full overflow-hidden mt-2">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

function MetricCell({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-10 h-[3px] bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="font-mono text-xs font-bold tabular-nums" style={{ color }}>{value.toFixed(0)}%</span>
    </div>
  );
}
