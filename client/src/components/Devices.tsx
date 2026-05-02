import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ChevronUp,
  ChevronDown,
  Server,
} from 'lucide-react';
import { getSocket } from '../api/socket';
import { useLanguage } from '../contexts/LanguageContext';
import type { Agent } from '../types';

const API_BASE = '/api';

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

function buildSparkPath(values: number[], width = 100, height = 28) {
  if (values.length < 2) return '';
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(height - (v / max) * (height - 2)).toFixed(2)}`)
    .join(' ');
}

function formatRelativeTime(ts?: string, now: number = Date.now()): string {
  if (!ts) return '—';
  const diff = now - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type SortKey = 'host' | 'status' | 'cpu' | 'mem' | 'disk' | 'lat' | 'last';
type SortDir = 'asc' | 'desc';

export default function Devices() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [latencies, setLatencies] = useState<Record<string, number>>({});
  const [sparkDataByAgent, setSparkDataByAgent] = useState<Record<string, number[]>>({});
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

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

    const onList = (list: Agent[]) => setAgents(list);
    const onMetrics = ({ agentId, metrics }: { agentId: string; metrics: Agent['metrics'] }) => {
      if (!metrics) return;
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, metrics, status: 'online' } : a)));
      setSparkDataByAgent((prev) => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []).slice(-29), metrics.cpu.load],
      }));
    };
    const onLatency = ({ agentId, latency }: { agentId: string; latency: number }) => {
      setLatencies((prev) => ({ ...prev, [agentId]: latency }));
    };

    socket.on('agents:list', onList);
    socket.on('agent:metrics', onMetrics);
    socket.on('agent:latency', onLatency);

    return () => {
      socket.off('agents:list', onList);
      socket.off('agent:metrics', onMetrics);
      socket.off('agent:latency', onLatency);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (statusFilter === 'online' && a.status !== 'online') return false;
      if (statusFilter === 'offline' && a.status === 'online') return false;
      if (!q) return true;
      return (
        a.hostname.toLowerCase().includes(q) ||
        (a.ip && a.ip.includes(q)) ||
        a.id.toLowerCase().includes(q) ||
        (a.platform && a.platform.toLowerCase().includes(q))
      );
    });
  }, [agents, query, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const get = (x: Agent): number | string => {
        switch (sortKey) {
          case 'host': return x.hostname.toLowerCase();
          case 'status': return x.status === 'online' ? 1 : 0;
          case 'cpu': return x.metrics?.cpu?.load ?? -1;
          case 'mem': return x.metrics?.memory?.usedPercent ?? -1;
          case 'disk': return x.metrics?.disk?.usedPercent ?? -1;
          case 'lat': return latencies[x.id] ?? -1;
          case 'last': return x.connectedAt ? new Date(x.connectedAt).getTime() : 0;
        }
      };
      const av = get(a);
      const bv = get(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return copy;
  }, [filtered, sortKey, sortDir, latencies]);

  const onlineCount = agents.filter((a) => a.status === 'online').length;
  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(k);
      setSortDir(k === 'host' ? 'asc' : 'desc');
    }
  };

  const renderTh = (k: SortKey, label: string, align?: 'right') => (
    <th key={k} onClick={() => setSort(k)} style={{ textAlign: align ?? 'left', cursor: 'pointer' }}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k &&
          (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  return (
    <div className="nx-page">
      <header className="nx-page-head">
        <div>
          <div className="nx-eyebrow">{t('devices.eyebrow')}</div>
          <h1 className="text-[24px] font-bold tracking-tight text-[color:var(--fg-strong)] mt-1">
            {t('devices.title')}
          </h1>
          <p className="text-[13px] text-[color:var(--fg-muted)] mt-1">
            {agents.length} {t('devices.connected')} · {onlineCount} {t('devices.online')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="nx-search">
            <Search className="w-4 h-4 text-[color:var(--fg-dim)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('devices.searchPlaceholder')}
              className="nx-search-input"
            />
          </div>
          <div className="nx-segmented">
            {(['all', 'online', 'offline'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={`nx-segmented-item ${statusFilter === v ? 'is-active' : ''}`}
              >
                {v === 'all' ? t('devices.filterAll') : v === 'online' ? t('devices.filterOnline') : t('devices.filterOffline')}
                <span className="num-mono text-[10px] text-[color:var(--fg-dim)] ml-1.5">
                  {v === 'all' ? agents.length : v === 'online' ? onlineCount : agents.length - onlineCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="nx-panel">
        <div className="nx-panel-head">
          <div className="nx-panel-title">
            <Server className="w-4 h-4 text-[color:var(--accent)]" /> {t('devices.agentsPanel')}
            <span className="nx-tag ml-2">{sorted.length}</span>
          </div>
        </div>
        <div className="nx-grid-wrap">
          <table className="nx-grid">
            <thead>
              <tr>
                {renderTh('status', t('devices.colStatus'))}
                {renderTh('host', t('devices.colHost'))}
                <th>{t('devices.colPlatform')}</th>
                {renderTh('cpu', t('devices.colCpu'))}
                {renderTh('mem', t('devices.colMemory'))}
                {renderTh('disk', t('devices.colDisk'))}
                <th>{t('devices.colTrend')}</th>
                {renderTh('lat', t('devices.colLat'), 'right')}
                {renderTh('last', t('devices.colUp'), 'right')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((agent) => (
                <DeviceRow
                  key={agent.id}
                  agent={agent}
                  latency={latencies[agent.id]}
                  spark={sparkDataByAgent[agent.id] || []}
                  now={now}
                  onClick={() => navigate(`/dashboard/computer/${agent.id}`)}
                />
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="nx-empty" style={{ padding: '38px 12px' }}>
                      <Server className="w-6 h-6 text-[color:var(--fg-dim)] mb-2" />
                      <span>{t('devices.noDevices')}</span>
                      <span className="text-[12px] text-[color:var(--fg-dim)] mt-1">{t('devices.startAgent')}</span>
                    </div>
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

function DeviceRow({
  agent,
  latency,
  spark,
  now,
  onClick,
}: {
  agent: Agent;
  latency?: number;
  spark: number[];
  now: number;
  onClick: () => void;
}) {
  const isOnline = agent.status === 'online';
  const cpu = agent.metrics?.cpu?.load ?? 0;
  const mem = agent.metrics?.memory?.usedPercent ?? 0;
  const disk = agent.metrics?.disk?.usedPercent ?? 0;
  const sparkPath = useMemo(() => buildSparkPath(spark), [spark]);
  const latencyTone = latency == null ? '' : latency < 50 ? 'is-ok' : latency < 150 ? 'is-warn' : 'is-danger';
  const uptime = formatRelativeTime(agent.connectedAt, now);

  return (
    <tr onClick={onClick}>
      <td style={{ width: 96 }}>
        <span className={`nx-pill ${isOnline ? 'is-ok is-pulse' : 'is-muted'}`}>
          <span className="nx-dot" />
          {isOnline ? 'live' : 'off'}
        </span>
      </td>
      <td>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`nx-row-icon ${isOnline ? 'is-on' : ''}`}>
            <OsIcon platform={agent.platform || 'linux'} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[color:var(--fg-strong)] truncate">
              {agent.hostname}
            </div>
            <div className="num-mono text-[11px] text-[color:var(--fg-dim)] truncate">
              {agent.ip || agent.id.slice(0, 18)}
            </div>
          </div>
        </div>
      </td>
      <td>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="nx-tag">{agent.platform || 'unknown'}</span>
          {agent.cpuCores != null && (
            <span className="nx-tag">{agent.cpuCores}c</span>
          )}
          {agent.totalMemory != null && (
            <span className="nx-tag">{(agent.totalMemory / 1024 ** 3).toFixed(1)}gb</span>
          )}
        </div>
      </td>
      <BarCell value={cpu} accent="accent" />
      <BarCell value={mem} accent="warm" />
      <BarCell value={disk} accent="info" />
      <td style={{ width: 110 }}>
        {sparkPath ? (
          <svg viewBox="0 0 100 28" className="block w-full h-7" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`tg-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${sparkPath} L100,28 L0,28 Z`} fill={`url(#tg-${agent.id})`} />
            <path d={sparkPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        ) : (
          <span className="num-mono text-[11px] text-[color:var(--fg-dim)]">—</span>
        )}
      </td>
      <td className="num-mono text-right" style={{ width: 70 }}>
        {latency == null ? (
          <span className="text-[color:var(--fg-dim)]">—</span>
        ) : (
          <span className={`nx-pill ${latencyTone}`}>{latency}ms</span>
        )}
      </td>
      <td className="num-mono text-right text-[color:var(--fg-muted)]" style={{ width: 64 }}>
        {isOnline ? uptime : '—'}
      </td>
    </tr>
  );
}

function BarCell({ value, accent }: { value: number; accent: 'accent' | 'warm' | 'info' }) {
  const tone = value > 85 ? 'danger' : value > 65 ? 'warn' : accent;
  return (
    <td style={{ minWidth: 130 }}>
      <div className="flex items-center gap-2">
        <div className="num-mono text-[12px] text-[color:var(--fg)] w-9 text-right">
          {value > 0 ? value.toFixed(0) : '—'}
        </div>
        <div className={`nx-bar is-${tone} flex-1`}>
          <span style={{ ['--pct' as never]: `${Math.min(100, value)}%` } as React.CSSProperties} />
        </div>
      </div>
    </td>
  );
}
