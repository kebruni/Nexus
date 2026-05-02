import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  Activity,
  BellRing,
  MonitorSmartphone,
  FolderOpen,
  TerminalSquare,
  Tv,
  ArrowLeftRight,
  MessageSquare,
  Menu,
  X,
  Sun,
  Moon,
  Globe,
  ChevronRight,
  FileCode,
  Users,
  ShieldCheck,
  Webhook,
  Wifi,
  WifiOff,
  Server,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getSocket } from '../api/socket';
import type { Agent } from '../types';
import type { Language, TranslationKey } from '../i18n/translations';

interface LayoutProps {
  onLogout: () => void;
}

const LANG_LABELS: Record<Language, string> = { en: 'EN', ru: 'RU', kz: 'KZ' };
const LANG_ORDER: Language[] = ['en', 'ru', 'kz'];

type NavItem = { to: string; key: TranslationKey; icon: typeof LayoutDashboard; end?: boolean };
type NavGroup = { label: TranslationKey; items: NavItem[]; admin?: boolean };

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'nav.main',
    items: [{ to: '/dashboard', end: true, key: 'nav.dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'nav.tools',
    items: [
      { to: '/dashboard/devices', key: 'nav.devices', icon: MonitorSmartphone },
      { to: '/dashboard/files', key: 'nav.fileExplorer', icon: FolderOpen },
      { to: '/dashboard/terminal', key: 'nav.terminal', icon: TerminalSquare },
      { to: '/dashboard/remote', key: 'nav.remoteDesktop', icon: Tv },
      { to: '/dashboard/sftp', key: 'nav.sftp', icon: ArrowLeftRight },
      { to: '/dashboard/chat', key: 'nav.chat', icon: MessageSquare },
      { to: '/dashboard/scripts', key: 'nav.scripts', icon: FileCode },
    ],
  },
  {
    label: 'nav.insights',
    items: [
      { to: '/dashboard/events', key: 'nav.events', icon: Activity },
      { to: '/dashboard/alerts', key: 'nav.alerts', icon: BellRing },
      { to: '/dashboard/groups', key: 'nav.groups', icon: Users },
    ],
  },
  {
    label: 'nav.admin',
    admin: true,
    items: [
      { to: '/dashboard/users', key: 'nav.users', icon: ShieldCheck },
      { to: '/dashboard/webhooks', key: 'nav.webhooks', icon: Webhook },
    ],
  },
];

export default function Layout({ onLogout }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, setLang, t } = useLanguage();
  const { setTheme, isDark } = useTheme();
  const { toast } = useToast();
  const currentUser = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const handleLogout = () => {
    onLogout();
    navigate('/');
  };

  const closeSidebar = () => setSidebarOpen(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nx-nav-link${isActive ? ' is-active' : ''}`;

  const getPageTitle = useCallback((): string => {
    const path = location.pathname;
    const map: [string, TranslationKey][] = [
      ['/dashboard/devices', 'nav.devices'],
      ['/dashboard/files', 'nav.fileExplorer'],
      ['/dashboard/terminal', 'nav.terminal'],
      ['/dashboard/remote', 'nav.remoteDesktop'],
      ['/dashboard/sftp', 'nav.sftp'],
      ['/dashboard/chat', 'nav.chat'],
      ['/dashboard/events', 'nav.events'],
      ['/dashboard/alerts', 'nav.alerts'],
      ['/dashboard/analytics', 'nav.analytics'],
      ['/dashboard/scripts', 'nav.scripts'],
      ['/dashboard/groups', 'nav.groups'],
      ['/dashboard/users', 'nav.users'],
      ['/dashboard/webhooks', 'nav.webhooks'],
      ['/dashboard/computer', 'nav.computerDetails'],
    ];
    for (const [prefix, key] of map) {
      if (path.startsWith(prefix)) return t(key);
    }
    if (path === '/dashboard') return t('nav.dashboard');
    return 'Nexus';
  }, [location.pathname, t]);

  // Dynamic browser title
  useEffect(() => {
    const title = getPageTitle();
    document.title = title === 'Nexus' ? 'Nexus' : `Nexus — ${title}`;
  }, [getPageTitle]);

  // Socket connection status + live agents counter
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocketConnected(socket.connected);

    const onAgentsList = (list: Agent[]) => setAgents(list);
    const onConnected = (agent: { hostname: string }) => {
      toast(t('layout.toastReady', { host: agent.hostname }), 'success');
    };
    const onDisconnected = () => toast(t('layout.toastDisconnected'), 'warning');
    const onSocketConnect = () => setSocketConnected(true);
    const onSocketDisconnect = () => setSocketConnected(false);
    const onMetrics = ({ agentId, metrics }: { agentId: string; metrics: Agent['metrics'] }) => {
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, metrics, status: 'online' } : a)),
      );
    };

    socket.emit('agents:requestList');
    socket.on('agents:list', onAgentsList);
    socket.on('agent:connected', onConnected);
    socket.on('agent:disconnected', onDisconnected);
    socket.on('agent:metrics', onMetrics);
    socket.on('connect', onSocketConnect);
    socket.on('disconnect', onSocketDisconnect);

    return () => {
      socket.off('agents:list', onAgentsList);
      socket.off('agent:connected', onConnected);
      socket.off('agent:disconnected', onDisconnected);
      socket.off('agent:metrics', onMetrics);
      socket.off('connect', onSocketConnect);
      socket.off('disconnect', onSocketDisconnect);
    };
  }, [toast, t]);

  // Close sidebar when route changes (mobile)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [location.pathname]);

  const onlineCount = useMemo(() => agents.filter((a) => a.status === 'online').length, [agents]);
  const totalAgents = agents.length;

  const visibleGroups = NAV_GROUPS.filter((g) => !g.admin || isAdmin);

  return (
    <div className="nx-shell">
      {/* Mobile overlay */}
      <div
        className={`nx-overlay ${sidebarOpen ? 'is-open' : ''}`}
        onClick={closeSidebar}
        aria-hidden
      />

      {/* Sidebar */}
      <aside className={`nx-rail ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="nx-rail-head">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="nx-logo-mark">
              <Server className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="nx-brand text-[15px] leading-none">Nexus</div>
              <div className="text-[10px] text-[color:var(--fg-dim)] tracking-[0.16em] uppercase mt-1 font-semibold">
                {t('layout.controlHub')}
              </div>
            </div>
          </div>
          <button onClick={closeSidebar} className="nx-btn nx-btn-icon nx-btn-sm nx-rail-close" aria-label={t('layout.closeSidebar')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="nx-rail-nav">
          {visibleGroups.map((group) => (
            <div className="nx-rail-section" key={group.label}>
              <div className="nx-eyebrow nx-rail-section-label">{t(group.label)}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                    <span className="truncate">{t(item.key)}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="nx-rail-foot">
          <div className="nx-rail-status">
            <div className="flex items-center justify-between">
              <span className="nx-eyebrow">{t('layout.cluster')}</span>
              <span className={`nx-pill ${socketConnected ? 'is-ok is-pulse' : 'is-danger'}`}>
                <span className="nx-dot" />
                {socketConnected ? t('layout.statusLive') : t('layout.statusDown')}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[12px] text-[color:var(--fg-muted)]">{t('layout.agents')}</span>
              <span className="num-mono text-[13px]">
                <span className="text-[color:var(--ok)]">{onlineCount}</span>
                <span className="text-[color:var(--fg-dim)]"> / {totalAgents}</span>
              </span>
            </div>
          </div>
          <button onClick={handleLogout} className="nx-btn nx-rail-logout">
            <LogOut className="w-4 h-4" />
            {t('nav.disconnect')}
          </button>
        </div>
      </aside>

      {/* Top bar */}
      <header className="nx-topbar">
        <button
          onClick={() => setSidebarOpen(true)}
          className="nx-btn nx-btn-icon nx-btn-sm nx-topbar-burger"
          aria-label={t('layout.openSidebar')}
        >
          <Menu className="w-4 h-4" />
        </button>

        <nav className="nx-breadcrumbs">
          <span className="nx-eyebrow text-[color:var(--fg-muted)]">Nexus</span>
          <ChevronRight className="w-3 h-3 text-[color:var(--fg-dim)]" />
          <span className="nx-section-title">{getPageTitle()}</span>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="nx-chip hidden md:inline-flex" title={t('layout.connectedAgents')}>
            {socketConnected ? <Wifi className="w-3.5 h-3.5 text-[color:var(--ok)]" /> : <WifiOff className="w-3.5 h-3.5 text-[color:var(--danger)]" />}
            <span className="text-[color:var(--fg-muted)]">{t('layout.online')}</span>
            <strong>{onlineCount}<span className="text-[color:var(--fg-dim)]"> / {totalAgents}</span></strong>
          </div>

          {currentUser && (
            <div
              className={`nx-pill ${
                currentUser.role === 'admin' ? 'is-accent' : currentUser.role === 'operator' ? 'is-ok' : 'is-muted'
              } hidden sm:inline-flex`}
              title={`${currentUser.username} — ${currentUser.role}`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span className="normal-case font-semibold tracking-normal">{currentUser.username}</span>
              <span className="opacity-60">·</span>
              <span>{currentUser.role}</span>
            </div>
          )}

          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="nx-btn nx-btn-icon nx-btn-sm"
            title={t('settings.theme')}
            aria-label={t('layout.toggleTheme')}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="relative">
            <button
              onClick={() => setLangMenuOpen((v) => !v)}
              className="nx-btn nx-btn-sm"
              title={t('settings.language')}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{LANG_LABELS[lang]}</span>
            </button>
            {langMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                <div className="nx-dropdown">
                  {LANG_ORDER.map((l) => (
                    <button
                      key={l}
                      onClick={() => {
                        setLang(l);
                        setLangMenuOpen(false);
                      }}
                      className={`nx-dropdown-item ${l === lang ? 'is-active' : ''}`}
                    >
                      <span className="num-mono text-[10px] text-[color:var(--fg-dim)] w-6">{LANG_LABELS[l]}</span>
                      <span>{l === 'en' ? 'English' : l === 'ru' ? 'Русский' : 'Қазақша'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="nx-main">
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
