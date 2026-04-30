import { useCallback, useEffect, useState } from 'react';
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
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getSocket } from '../api/socket';
import type { Language } from '../i18n/translations';
import type { TranslationKey } from '../i18n/translations';

interface LayoutProps {
  onLogout: () => void;
}

const LANG_LABELS: Record<Language, string> = { en: 'EN', ru: 'RU', kz: 'KZ' };
const LANG_ORDER: Language[] = ['en', 'ru', 'kz'];

export default function Layout({ onLogout }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
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
    `flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 ${
      isActive
        ? isDark
          ? 'bg-zinc-800 text-white shadow-md border border-zinc-700/50'
          : 'bg-blue-50 text-blue-700 shadow-sm border border-blue-200'
        : isDark
          ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
    }`;

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
      if (path.includes(prefix.replace('/dashboard/', '/dashboard/'))) {
        if (path.startsWith(prefix) || path.includes(prefix.split('/').pop()!)) return t(key);
      }
    }
    if (path === '/dashboard') return t('nav.dashboard');
    return 'Nexus';
  }, [location.pathname, t]);

  // Dynamic browser title
  useEffect(() => {
    const title = getPageTitle();
    document.title = title === 'Nexus' ? 'Nexus' : `Nexus — ${title}`;
  }, [getPageTitle]);

  // Toast notifications for agent events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onConnected = (agent: { hostname: string }) => {
      toast(`${agent.hostname} ${t('devices.ready').toLowerCase()}`, 'success');
    };
    const onDisconnected = () => {
      toast(`Agent disconnected`, 'warning');
    };

    socket.on('agent:connected', onConnected);
    socket.on('agent:disconnected', onDisconnected);

    return () => {
      socket.off('agent:connected', onConnected);
      socket.off('agent:disconnected', onDisconnected);
    };
  }, [toast, t]);

  // Theme-aware classes
  const bg = isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50';
  const textColor = isDark ? 'text-zinc-300' : 'text-gray-700';
  const sidebarBg = isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200';
  const headerBg = isDark ? 'bg-[#0A0A0A]/80 border-zinc-800/60' : 'bg-white/80 border-gray-200';
  const btnBg = isDark ? 'bg-[#1A1A1A] border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-100';
  const labelColor = isDark ? 'text-zinc-600' : 'text-gray-400';
  const closeBtnClass = isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100';
  const logoutBtnClass = isDark
    ? 'text-zinc-400 bg-[#1A1A1A] hover:bg-zinc-800 hover:text-red-400 border-zinc-800'
    : 'text-gray-500 bg-gray-100 hover:bg-red-50 hover:text-red-500 border-gray-200';
  const logoBg = isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-100 border-gray-200';
  const logoText = isDark ? 'text-white' : 'text-gray-900';
  const logoSub = isDark ? 'text-zinc-500' : 'text-gray-400';

  return (
    <div className={`relative h-screen ${bg} ${textColor} font-sans selection:bg-blue-500/30`}>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          isDark ? 'bg-black/60' : 'bg-black/30'
        } backdrop-blur-sm ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={closeSidebar}
      />

      {/* Sliding Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 w-[280px] sm:w-[300px] ${sidebarBg} border-r flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${logoBg} border rounded-[14px] flex items-center justify-center shadow-lg`}>
              <MonitorSmartphone className={`w-5 h-5 ${isDark ? 'text-zinc-200' : 'text-gray-600'}`} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className={`text-lg font-semibold tracking-tight leading-tight ${logoText}`}>Nexus</h1>
              <p className={`text-[11px] ${logoSub} font-medium tracking-wide`}>{t('nav.remoteAccess')}</p>
            </div>
          </div>
          <button onClick={closeSidebar} className={`w-9 h-9 flex items-center justify-center rounded-xl ${closeBtnClass} transition-all duration-200`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="mb-5">
            <p className={`px-4 py-2 text-[10px] font-bold ${labelColor} uppercase tracking-widest`}>{t('nav.main')}</p>
            <NavLink to="/dashboard" end className={linkClass} onClick={closeSidebar}>
              <LayoutDashboard className="w-4 h-4" />
              {t('nav.dashboard')}
            </NavLink>
          </div>

          <div className="mb-5">
            <p className={`px-4 py-2 text-[10px] font-bold ${labelColor} uppercase tracking-widest`}>{t('nav.tools')}</p>
            <NavLink to="/dashboard/devices" className={linkClass} onClick={closeSidebar}>
              <MonitorSmartphone className="w-4 h-4" />
              {t('nav.devices')}
            </NavLink>
            <NavLink to="/dashboard/files" className={linkClass} onClick={closeSidebar}>
              <FolderOpen className="w-4 h-4" />
              {t('nav.fileExplorer')}
            </NavLink>
            <NavLink to="/dashboard/terminal" className={linkClass} onClick={closeSidebar}>
              <TerminalSquare className="w-4 h-4" />
              {t('nav.terminal')}
            </NavLink>
            <NavLink to="/dashboard/remote" className={linkClass} onClick={closeSidebar}>
              <Tv className="w-4 h-4" />
              {t('nav.remoteDesktop')}
            </NavLink>
            <NavLink to="/dashboard/sftp" className={linkClass} onClick={closeSidebar}>
              <ArrowLeftRight className="w-4 h-4" />
              {t('nav.sftp')}
            </NavLink>
            <NavLink to="/dashboard/chat" className={linkClass} onClick={closeSidebar}>
              <MessageSquare className="w-4 h-4" />
              {t('nav.chat')}
            </NavLink>
            <NavLink to="/dashboard/scripts" className={linkClass} onClick={closeSidebar}>
              <FileCode className="w-4 h-4" />
              {t('nav.scripts')}
            </NavLink>
          </div>

          <div className="mb-5">
            <p className={`px-4 py-2 text-[10px] font-bold ${labelColor} uppercase tracking-widest`}>{t('nav.insights')}</p>
            <NavLink to="/dashboard/events" className={linkClass} onClick={closeSidebar}>
              <Activity className="w-4 h-4" />
              {t('nav.events')}
            </NavLink>
            <NavLink to="/dashboard/alerts" className={linkClass} onClick={closeSidebar}>
              <BellRing className="w-4 h-4" />
              {t('nav.alerts')}
            </NavLink>
            <NavLink to="/dashboard/groups" className={linkClass} onClick={closeSidebar}>
              <Users className="w-4 h-4" />
              {t('nav.groups')}
            </NavLink>
          </div>

          {isAdmin && (
            <div className="mb-5">
              <p className={`px-4 py-2 text-[10px] font-bold ${labelColor} uppercase tracking-widest`}>{t('nav.admin')}</p>
              <NavLink to="/dashboard/users" className={linkClass} onClick={closeSidebar}>
                <ShieldCheck className="w-4 h-4" />
                {t('nav.users')}
              </NavLink>
              <NavLink to="/dashboard/webhooks" className={linkClass} onClick={closeSidebar}>
                <Webhook className="w-4 h-4" />
                {t('nav.webhooks')}
              </NavLink>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="p-3 mx-3 mt-auto mb-3">
          <button
            onClick={handleLogout}
            className={`flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-medium ${logoutBtnClass} border rounded-2xl transition-all duration-300`}
          >
            <LogOut className="w-4 h-4" />
            {t('nav.disconnect')}
          </button>
        </div>
      </aside>

      {/* Top Bar */}
      <header className={`sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-5 py-2.5 ${headerBg} backdrop-blur-md border-b`}>
        <button
          onClick={() => setSidebarOpen(true)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border ${btnBg} transition-all duration-200 shrink-0`}
        >
          <Menu className="w-5 h-5" />
        </button>
        
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 min-w-0 truncate">
          <span className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'} shrink-0`}>Nexus</span>
          {location.pathname !== '/dashboard' && (
            <>
              <ChevronRight className={`w-3.5 h-3.5 ${isDark ? 'text-zinc-600' : 'text-gray-300'} shrink-0`} />
              <span className={`text-base font-semibold ${isDark ? 'text-zinc-300' : 'text-gray-700'} truncate`}>{getPageTitle()}</span>
            </>
          )}
        </nav>

        {/* Right side controls */}
        <div className="ml-auto flex items-center gap-2">
          {/* Current user / role badge */}
          {currentUser && (
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 h-9 rounded-xl border text-xs font-medium ${
              currentUser.role === 'admin'
                ? isDark ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'
                : currentUser.role === 'operator'
                  ? isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-gray-100 border-gray-200 text-gray-700'
            }`} title={`${currentUser.username} — ${currentUser.role}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="font-semibold">{currentUser.username}</span>
              <span className="opacity-60">·</span>
              <span className="uppercase tracking-wider text-[10px]">{currentUser.role}</span>
            </div>
          )}

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border ${btnBg} transition-all duration-200`}
            title={t('settings.theme')}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className={`h-9 flex items-center gap-1.5 px-2.5 rounded-xl border ${btnBg} transition-all duration-200 text-xs font-semibold`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{LANG_LABELS[lang]}</span>
            </button>
            {langMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                <div className={`absolute right-0 mt-1.5 z-50 ${isDark ? 'bg-[#1A1A1A] border-zinc-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl overflow-hidden min-w-[100px]`}>
                  {LANG_ORDER.map((l) => (
                    <button
                      key={l}
                      onClick={() => { setLang(l); setLangMenuOpen(false); }}
                      className={`flex items-center gap-2 w-full px-3.5 py-2 text-xs font-medium transition-colors ${
                        l === lang
                          ? isDark ? 'bg-zinc-800 text-white' : 'bg-blue-50 text-blue-700'
                          : isDark ? 'text-zinc-400 hover:bg-zinc-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {l === 'en' ? 'English' : l === 'ru' ? 'Русский' : 'Қазақша'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="overflow-auto p-3 sm:p-4" style={{ height: 'calc(100vh - 56px)' }}>
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
