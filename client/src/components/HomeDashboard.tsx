import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../api/socket';
import type { Agent, Alert, SystemEvent } from '../types';
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Cpu,
  Download,
  Gauge,
  HardDrive,
  Laptop,
  MemoryStick,
  Package,
  Server,
  Wifi,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const API_BASE = '/api';

function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current;
    const diff = target - start;
    const t0 = performance.now();
    let raf: number;
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + diff * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    prev.current = target;
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

type InstallerInfo = {
  available: boolean;
  fileName?: string;
  version?: string;
  size?: number;
  modified?: string;
  hint?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildSparkPath(values: number[], width = 100, height = 32) {
  if (values.length < 2) return '';
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(height - (v / max) * (height - 2)).toFixed(2)}`)
    .join(' ');
}

function relativeTime(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HomeDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [installer, setInstaller] = useState<InstallerInfo | null>(null);
  const [cpuTrend, setCpuTrend] = useState<number[]>([]);
  const [memTrend, setMemTrend] = useState<number[]>([]);
  const [netTrend, setNetTrend] = useState<number[]>([]);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    fetch(`${API_BASE}/agent/installer/info`)
      .then((r) => r.json())
      .then((data: InstallerInfo) => setInstaller(data))
      .catch(() => setInstaller({ available: false }));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('pc-hub-token');
    if (token) {
      fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setAgents)
        .catch(console.error);

      fetch(`${API_BASE}/events?limit=10`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setEvents)
        .catch(console.error);

      fetch(`${API_BASE}/alerts/unread`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setAlerts)
        .catch(console.error);
    }

    const socket = getSocket();
    if (!socket) return;

    socket.emit('agents:requestList');
    const onList = (list: Agent[]) => setAgents(list);
    const onMetrics = ({ agentId, metrics }: { agentId: string; metrics: Agent['metrics'] }) => {
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, metrics, status: 'online' } : a)));
    };

    socket.on('agents:list', onList);
    socket.on('agent:metrics', onMetrics);

    return () => {
      socket.off('agents:list', onList);
      socket.off('agent:metrics', onMetrics);
    };
  }, []);

  // Aggregate fleet trend (push average load every refresh)
  useEffect(() => {
    if (agents.length === 0) return;
    const onlineAgents = agents.filter((a) => a.status === 'online' && a.metrics);
    if (onlineAgents.length === 0) return;
    const avgCpu =
      onlineAgents.reduce((acc, a) => acc + (a.metrics?.cpu?.load ?? 0), 0) / onlineAgents.length;
    const avgMem =
      onlineAgents.reduce((acc, a) => acc + (a.metrics?.memory?.usedPercent ?? 0), 0) / onlineAgents.length;
    const totalNet =
      onlineAgents.reduce(
        (acc, a) => acc + (a.metrics?.network?.rxSec ?? 0) + (a.metrics?.network?.txSec ?? 0),
        0,
      ) / 1024;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCpuTrend((prev) => [...prev.slice(-29), avgCpu]);
    setMemTrend((prev) => [...prev.slice(-29), avgMem]);
    setNetTrend((prev) => [...prev.slice(-29), totalNet]);
  }, [agents]);

  const onlineCount = agents.filter((a) => a.status === 'online').length;
  const animTotal = useCountUp(agents.length);
  const animOnline = useCountUp(onlineCount);
  const animAlerts = useCountUp(alerts.length);

  const fleetCpu = useMemo(() => {
    const online = agents.filter((a) => a.status === 'online' && a.metrics);
    if (online.length === 0) return 0;
    return online.reduce((acc, a) => acc + (a.metrics?.cpu?.load ?? 0), 0) / online.length;
  }, [agents]);
  const fleetMem = useMemo(() => {
    const online = agents.filter((a) => a.status === 'online' && a.metrics);
    if (online.length === 0) return 0;
    return online.reduce((acc, a) => acc + (a.metrics?.memory?.usedPercent ?? 0), 0) / online.length;
  }, [agents]);

  const onlinePct = agents.length === 0 ? 0 : Math.round((onlineCount / agents.length) * 100);

  return (
    <div className="nx-page">
      <header className="nx-page-head">
        <div>
          <div className="nx-eyebrow">Overview</div>
          <h1 className="text-[24px] font-bold tracking-tight text-[color:var(--fg-strong)] mt-1">
            {t('home.title')}
          </h1>
          <p className="text-[13px] text-[color:var(--fg-muted)] mt-1">{t('home.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/dashboard/devices')} className="nx-btn">
            <Server className="w-4 h-4" /> {t('home.goToDevices')}
          </button>
        </div>
      </header>

      {/* Prominent agent download CTA */}
      <InstallBanner installer={installer} t={t} />

      {/* KPI strip */}
      <section className="nx-kpi-strip">
        <KpiCard
          label={t('home.totalDevices')}
          value={animTotal}
          icon={<Laptop className="w-4 h-4" />}
          accent="accent"
          sub={`${animOnline} online · ${agents.length - animOnline} offline`}
          spark={cpuTrend}
        />
        <KpiCard
          label={t('home.onlineNow')}
          value={`${animOnline}`}
          unit={`/${animTotal}`}
          icon={<Wifi className="w-4 h-4" />}
          accent="ok"
          sub={`${onlinePct}% reachable`}
        />
        <KpiCard
          label="Avg CPU"
          value={fleetCpu.toFixed(1)}
          unit="%"
          icon={<Cpu className="w-4 h-4" />}
          accent={fleetCpu > 80 ? 'danger' : fleetCpu > 50 ? 'warn' : 'accent'}
          sub="cluster load"
          spark={cpuTrend}
        />
        <KpiCard
          label="Avg Memory"
          value={fleetMem.toFixed(1)}
          unit="%"
          icon={<MemoryStick className="w-4 h-4" />}
          accent={fleetMem > 85 ? 'danger' : fleetMem > 65 ? 'warn' : 'warm'}
          sub="cluster pressure"
          spark={memTrend}
        />
        <KpiCard
          label="Network I/O"
          value={netTrend.length ? netTrend[netTrend.length - 1].toFixed(1) : '0'}
          unit="KB/s"
          icon={<Activity className="w-4 h-4" />}
          accent="warm"
          sub="rx + tx"
          spark={netTrend}
        />
        <KpiCard
          label={t('home.activeAlerts')}
          value={animAlerts}
          icon={<BellRing className="w-4 h-4" />}
          accent={alerts.length > 0 ? 'danger' : 'accent'}
          sub={alerts.length > 0 ? 'requires attention' : 'all clear'}
        />
      </section>

      {/* Main grid */}
      <section className="nx-page-grid">
        {/* Fleet load */}
        <div className="nx-panel" style={{ gridColumn: 'span 2' }}>
          <div className="nx-panel-head">
            <div className="nx-panel-title">
              <Gauge className="w-4 h-4 text-[color:var(--accent)]" />
              Fleet load
            </div>
            <button
              onClick={() => navigate('/dashboard/devices')}
              className="nx-btn nx-btn-sm nx-btn-ghost"
            >
              {t('home.viewAll')} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="nx-panel-body">
            {agents.length === 0 ? (
              <div className="nx-empty">
                <Server className="w-6 h-6 text-[color:var(--fg-dim)] mb-2" />
                <span>No agents connected yet</span>
              </div>
            ) : (
              <div className="nx-fleet-list">
                {agents.slice(0, 6).map((agent) => {
                  const cpu = agent.metrics?.cpu?.load ?? 0;
                  const mem = agent.metrics?.memory?.usedPercent ?? 0;
                  const disk = agent.metrics?.disk?.usedPercent ?? 0;
                  const isOnline = agent.status === 'online';
                  return (
                    <button
                      key={agent.id}
                      onClick={() => navigate(`/dashboard/computer/${agent.id}`)}
                      className="nx-fleet-row"
                    >
                      <div className="nx-fleet-row-head">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`nx-pill ${isOnline ? 'is-ok is-pulse' : 'is-muted'}`}>
                            <span className="nx-dot" />
                            {isOnline ? 'live' : 'offline'}
                          </span>
                          <span className="text-[13px] font-semibold truncate text-[color:var(--fg-strong)]">
                            {agent.hostname}
                          </span>
                          <span className="num-mono text-[11px] text-[color:var(--fg-dim)] hidden md:inline">
                            {agent.ip || agent.id.slice(0, 14)}
                          </span>
                        </div>
                        <span className="nx-tag">{agent.platform || 'unknown'}</span>
                      </div>
                      <div className="nx-fleet-row-bars">
                        <Stat icon={<Cpu className="w-3 h-3" />} label="CPU" value={cpu} accent="accent" />
                        <Stat icon={<MemoryStick className="w-3 h-3" />} label="MEM" value={mem} accent="warm" />
                        <Stat icon={<HardDrive className="w-3 h-3" />} label="DSK" value={disk} accent="info" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Activity stream */}
        <div className="nx-panel">
          <div className="nx-panel-head">
            <div className="nx-panel-title">
              <Activity className="w-4 h-4 text-[color:var(--info)]" /> {t('home.recentActivity')}
            </div>
            <button
              onClick={() => navigate('/dashboard/events')}
              className="nx-btn nx-btn-sm nx-btn-ghost"
            >
              {t('home.viewAll')}
            </button>
          </div>
          <div className="nx-panel-body" style={{ padding: 0 }}>
            {events.length === 0 ? (
              <div className="nx-empty" style={{ padding: '32px 16px' }}>
                <Activity className="w-6 h-6 text-[color:var(--fg-dim)] mb-2" />
                <span>{t('home.noActivity')}</span>
              </div>
            ) : (
              <ul className="nx-event-list">
                {events.slice(0, 8).map((event) => (
                  <li key={event.id}>
                    <span className="nx-event-dot" />
                    <div className="min-w-0">
                      <div className="text-[13px] truncate text-[color:var(--fg)]">{event.message}</div>
                      <div className="num-mono text-[11px] text-[color:var(--fg-dim)] mt-0.5">
                        {relativeTime(event.timestamp)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="nx-quick-actions">
          <ActionCard
            title={t('home.manageDevices')}
            sub={t('home.manageDesc')}
            cta={t('home.goToDevices')}
            icon={<Server className="w-5 h-5" />}
            onClick={() => navigate('/dashboard/devices')}
            accent="accent"
          />
          <ActionCard
            title={t('home.recentActivity')}
            sub={`${events.length} recent events · ${alerts.length} active alerts`}
            cta={t('home.viewAll')}
            icon={<Activity className="w-5 h-5" />}
            onClick={() => navigate('/dashboard/events')}
            accent={alerts.length > 0 ? 'warn' : 'ok'}
          />
        </div>
      </section>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function KpiCard({
  label,
  value,
  unit,
  icon,
  accent,
  sub,
  spark,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  accent?: 'accent' | 'warm' | 'ok' | 'warn' | 'danger';
  sub?: string;
  spark?: number[];
}) {
  return (
    <div className={`nx-kpi ${accent ? `is-${accent}` : ''}`}>
      <div className="flex items-center justify-between">
        <span className="nx-kpi-label">
          {icon} {label}
        </span>
      </div>
      <div className="nx-kpi-value">
        {value}
        {unit && <span className="nx-kpi-unit">{unit}</span>}
      </div>
      {spark && spark.length > 1 ? (
        <svg className="nx-spark mt-1" viewBox="0 0 100 32" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`grad-${accent}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={
                  accent === 'warm' ? 'var(--warm)' :
                  accent === 'ok' ? 'var(--ok)' :
                  accent === 'warn' ? 'var(--warn)' :
                  accent === 'danger' ? 'var(--danger)' :
                  'var(--accent)'
                }
                stopOpacity="0.5"
              />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <path
            d={`${buildSparkPath(spark)} L100,32 L0,32 Z`}
            fill={`url(#grad-${accent})`}
            stroke="none"
          />
          <path
            d={buildSparkPath(spark)}
            fill="none"
            stroke={
              accent === 'warm' ? 'var(--warm)' :
              accent === 'ok' ? 'var(--ok)' :
              accent === 'warn' ? 'var(--warn)' :
              accent === 'danger' ? 'var(--danger)' :
              'var(--accent)'
            }
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
      {sub && <div className="nx-kpi-sub">{sub}</div>}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: 'accent' | 'warm' | 'info';
}) {
  const tone = value > 85 ? 'danger' : value > 65 ? 'warn' : accent;
  return (
    <div className="nx-fleet-stat">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.10em] text-[color:var(--fg-muted)]">
        {icon} {label}
      </div>
      <div className="num-mono text-[12px] text-[color:var(--fg)]">{value.toFixed(0)}<span className="text-[color:var(--fg-muted)]">%</span></div>
      <div className={`nx-bar is-${tone}`}>
        <span style={{ ['--pct' as never]: `${Math.min(100, value)}%` } as React.CSSProperties} />
      </div>
    </div>
  );
}

function ActionCard({
  title,
  sub,
  cta,
  icon,
  onClick,
  accent,
}: {
  title: string;
  sub: string;
  cta?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  accent: 'accent' | 'ok' | 'warn';
}) {
  return (
    <button
      onClick={onClick}
      className={`nx-action-card is-${accent} ${onClick ? '' : 'is-static'}`}
    >
      <div className="nx-action-icon">{icon}</div>
      <div className="text-left flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-[color:var(--fg-strong)] truncate">{title}</div>
        <div className="text-[12px] text-[color:var(--fg-muted)] mt-1 line-clamp-2">{sub}</div>
      </div>
      {onClick && (
        <span className="nx-action-cta">
          {cta} <ArrowRight className="w-3.5 h-3.5" />
        </span>
      )}
    </button>
  );
}

function InstallBanner({
  installer,
  t,
}: {
  installer: InstallerInfo | null;
  t: (key: Parameters<ReturnType<typeof useLanguage>['t']>[0]) => string;
}) {
  const available = !!installer?.available;
  return (
    <section
      className={`nx-install-banner ${available ? '' : 'is-unavailable'}`}
      aria-label={t('home.downloadAgent')}
    >
      <div className="nx-install-banner-icon" aria-hidden>
        <Package className="w-7 h-7" strokeWidth={1.8} />
      </div>
      <div className="nx-install-banner-body">
        <div className="nx-install-banner-title">
          <span>{t('home.downloadAgent')}</span>
          {available ? (
            <span className="nx-pill is-ok">
              <CheckCircle2 className="w-3 h-3" /> Ready
            </span>
          ) : (
            <span className="nx-pill is-warn">Building…</span>
          )}
          {available && installer?.version && (
            <span className="nx-tag num-mono">v{installer.version}</span>
          )}
        </div>
        <div className="nx-install-banner-meta">
          {available ? (
            <>
              <span className="nx-install-banner-meta-item">
                <HardDrive className="w-3 h-3" />
                <span className="num-mono">
                  {installer?.size ? formatBytes(installer.size) : '—'}
                </span>
              </span>
              <span className="nx-install-banner-meta-item">
                <span className="text-[color:var(--fg-dim)]">Windows x64 · NSIS installer</span>
              </span>
              {installer?.modified && (
                <span className="nx-install-banner-meta-item">
                  <span className="text-[color:var(--fg-dim)]">
                    Updated {relativeTime(installer.modified)}
                  </span>
                </span>
              )}
            </>
          ) : (
            <span className="text-[color:var(--fg-muted)]">
              {t('home.downloadAgentUnavailable')}
            </span>
          )}
        </div>
      </div>
      <div className="nx-install-banner-actions">
        {available ? (
          <a
            href={`${API_BASE}/agent/installer/download`}
            className="nx-btn is-primary"
            download
          >
            <Download className="w-4 h-4" />
            {t('home.downloadAgent')}
          </a>
        ) : (
          <span className="nx-btn is-primary is-disabled" aria-disabled>
            <Download className="w-4 h-4" />
            {t('home.downloadAgent')}
          </span>
        )}
      </div>
    </section>
  );
}
