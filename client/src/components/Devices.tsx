import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ChevronUp,
  ChevronDown,
  Server,
  TerminalSquare,
  FolderOpen,
  Monitor,
  ExternalLink,
  Download,
} from 'lucide-react';
import { getSocket } from '../api/socket';
import { useLanguage } from '../contexts/LanguageContext';
import type { Agent } from '../types';

const API_BASE = '/api';

function OsIcon({ className }: { className?: string; platform?: string }) {
  // Nexus targets Windows only — we always render the Windows logo so the
  // dashboard stays visually consistent even if an agent reports an
  // unexpected `process.platform` string.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M3 12.5h8V21l-8-1.22V12.5zm0-1h8V3L3 4.22V11.5zm9 1h9V22l-9-1.37V12.5zm0-1h9V2l-9 1.37V11.5z" />
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
                <th style={{ width: 156, textAlign: 'right' }} aria-label="actions" />
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
                  navigate={navigate}
                  t={t}
                />
              ))}
              {sorted.length === 0 && (
                <tr className="nx-grid-empty-row">
                  <td colSpan={10}>
                    <div className="nx-empty-rich">
                      <div className="nx-empty-rich-icon">
                        <Server className="w-7 h-7" strokeWidth={1.6} />
                      </div>
                      <div className="nx-empty-rich-body">
                        <h3 className="nx-empty-rich-title">{t('devices.firstRunTitle')}</h3>
                        <p className="nx-empty-rich-desc">{t('devices.firstRunDesc')}</p>
                        <div className="nx-empty-rich-actions">
                          <a
                            href={`${API_BASE}/agent/installer/download`}
                            className="nx-btn is-primary"
                            download
                          >
                            <Download className="w-4 h-4" />
                            {t('devices.downloadCta')}
                          </a>
                        </div>
                      </div>
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
  navigate,
  t,
}: {
  agent: Agent;
  latency?: number;
  spark: number[];
  now: number;
  onClick: () => void;
  navigate: (path: string) => void;
  t: ReturnType<typeof useLanguage>['t'];
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
            <OsIcon platform={agent.platform || 'win32'} className="w-4 h-4" />
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
      <BarCell value={cpu} accent="accent" label="CPU" />
      <BarCell value={mem} accent="warm" label="MEM" />
      <BarCell value={disk} accent="info" label="DISK" />
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
      <td className="nx-row-actions" style={{ width: 156, textAlign: 'right' }}>
        <div className="nx-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="nx-act-btn"
            disabled={!isOnline}
            title={isOnline ? t('devices.actShell') : t('devices.actOfflineHint')}
            aria-label={t('devices.actShell')}
            onClick={() => navigate(`/dashboard/terminal?agent=${agent.id}`)}
          >
            <TerminalSquare className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="nx-act-btn"
            disabled={!isOnline}
            title={isOnline ? t('devices.actFiles') : t('devices.actOfflineHint')}
            aria-label={t('devices.actFiles')}
            onClick={() => navigate(`/dashboard/files?agent=${agent.id}`)}
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="nx-act-btn"
            disabled={!isOnline}
            title={isOnline ? t('devices.actRemote') : t('devices.actOfflineHint')}
            aria-label={t('devices.actRemote')}
            onClick={() => navigate(`/dashboard/remote?agent=${agent.id}`)}
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="nx-act-btn is-primary"
            title={t('devices.actDetails')}
            aria-label={t('devices.actDetails')}
            onClick={onClick}
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function BarCell({
  value,
  accent,
  label,
}: {
  value: number;
  accent: 'accent' | 'warm' | 'info';
  label?: string;
}) {
  const tone = value > 85 ? 'danger' : value > 65 ? 'warn' : accent;
  return (
    <td style={{ minWidth: 130 }} data-label={label}>
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
