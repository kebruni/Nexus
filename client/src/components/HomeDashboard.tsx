import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../api/socket';
import type { Agent, Alert, SystemEvent } from '../types';
import { Laptop, Wifi, Activity, BellRing, ArrowRight, Download } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

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
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
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

export default function HomeDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [installer, setInstaller] = useState<InstallerInfo | null>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isDark } = useTheme();

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

      fetch(`${API_BASE}/events?limit=5`, { headers: { Authorization: `Bearer ${token}` } })
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

  const onlineCount = agents.filter((a) => a.status === 'online').length;
  const animTotal = useCountUp(agents.length);
  const animOnline = useCountUp(onlineCount);
  const animAlerts = useCountUp(alerts.length);

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto py-4 sm:py-8 px-1 sm:pr-8 space-y-4 sm:space-y-6">
      
      {/* Header */}
      <div>
        <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>{t('home.title')}</h2>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'} mt-1`}>{t('home.subtitle')}</p>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
        {/* Total Devices */}
        <div className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex items-center justify-between`}>
          <div>
            <p className={`${isDark ? 'text-zinc-500' : 'text-gray-500'} text-sm font-medium mb-1`}>{t('home.totalDevices')}</p>
            <h3 className={`text-3xl sm:text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>{animTotal}</h3>
          </div>
          <div className={`w-11 h-11 sm:w-12 sm:h-12 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'} rounded-full flex items-center justify-center border`}>
            <Laptop className={`w-5 h-5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`} />
          </div>
        </div>

        {/* Online Devices */}
        <div className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex items-center justify-between`}>
          <div>
            <p className={`${isDark ? 'text-zinc-500' : 'text-gray-500'} text-sm font-medium mb-1`}>{t('home.onlineNow')}</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl sm:text-4xl font-bold text-emerald-400 tracking-tight">{animOnline}</h3>
              <span className={`${isDark ? 'text-zinc-600' : 'text-gray-400'} text-sm font-medium mb-1`}>/ {animTotal}</span>
            </div>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
            <Wifi className="w-5 h-5 text-emerald-500" />
          </div>
        </div>

        {/* Unread Alerts */}
        <div className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex items-center justify-between sm:col-span-2 md:col-span-1`}>
          <div>
            <p className={`${isDark ? 'text-zinc-500' : 'text-gray-500'} text-sm font-medium mb-1`}>{t('home.activeAlerts')}</p>
            <h3 className={`text-3xl sm:text-4xl font-bold tracking-tight ${alerts.length > 0 ? 'text-red-400' : isDark ? 'text-zinc-400' : 'text-gray-400'}`}>
              {animAlerts}
            </h3>
          </div>
          <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border ${alerts.length > 0 ? 'bg-red-500/10 border-red-500/20' : isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'}`}>
            <BellRing className={`w-5 h-5 ${alerts.length > 0 ? 'text-red-500' : isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
          </div>
        </div>
      </div>

            {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

        {/* Quick Action / Jump to Devices */}
        <div className={`${isDark ? 'bg-gradient-to-br from-blue-600/20 to-blue-900/10 border-blue-500/20' : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'} border rounded-2xl sm:rounded-3xl p-5 sm:p-8 relative overflow-hidden flex flex-col justify-center min-h-[200px] sm:min-h-[250px] group cursor-pointer`} onClick={() => navigate('/dashboard/devices')}>
           <div className="absolute top-0 right-0 p-8 opacity-10">
             <Laptop className="w-24 sm:w-32 h-24 sm:h-32" />
           </div>
           <h3 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>{t('home.manageDevices')}</h3>
           <p className={`${isDark ? 'text-blue-200/60' : 'text-blue-700/60'} max-w-sm mb-4 sm:mb-6 text-sm sm:text-base`}>{t('home.manageDesc')}</p>
           <div className={`mt-auto flex items-center gap-2 ${isDark ? 'text-blue-400 group-hover:text-blue-300' : 'text-blue-600 group-hover:text-blue-700'} font-medium transition-colors`}>
             {t('home.goToDevices')} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
           </div>
        </div>

        {/* Install New Agent Action */}
        <div
          className={`${isDark ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-900/10 border-emerald-500/20' : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200'} border rounded-2xl sm:rounded-3xl p-5 sm:p-8 relative overflow-hidden flex flex-col justify-center min-h-[200px] sm:min-h-[250px] group ${installer && !installer.available ? 'opacity-90' : 'cursor-pointer'}`}
          onClick={() => {
            if (installer && !installer.available) return;
            window.location.href = `${API_BASE}/agent/installer/download`;
          }}
        >
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Download className="w-24 sm:w-32 h-24 sm:h-32 text-emerald-500" />
          </div>
          <h3 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>{t('home.downloadAgent')}</h3>
          {installer && installer.available ? (
            <>
              <p className={`${isDark ? 'text-emerald-200/60' : 'text-emerald-700/60'} max-w-sm mb-3 text-sm sm:text-base`}>
                {t('home.downloadAgentDesc')}
              </p>
              <p className={`text-xs ${isDark ? 'text-emerald-200/40' : 'text-emerald-700/50'} mb-4 sm:mb-6 font-mono`}>
                v{installer.version} · {formatBytes(installer.size || 0)}
                {installer.modified ? ` · ${new Date(installer.modified).toLocaleDateString()}` : ''}
              </p>
              <div className={`mt-auto flex items-center gap-2 ${isDark ? 'text-emerald-400 group-hover:text-emerald-300' : 'text-emerald-600 group-hover:text-emerald-700'} font-medium transition-colors`}>
                {t('home.downloadAgentCta')} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </>
          ) : (
            <>
              <p className={`${isDark ? 'text-emerald-200/60' : 'text-emerald-700/60'} max-w-sm mb-3 text-sm sm:text-base`}>
                {t('home.downloadAgentUnavailable')}
              </p>
              <p className={`text-[11px] ${isDark ? 'text-emerald-200/40' : 'text-emerald-700/50'} font-mono mb-4 sm:mb-6`}>
                npm --prefix agent run build
              </p>
              <div className={`mt-auto flex items-center gap-2 ${isDark ? 'text-emerald-400/60' : 'text-emerald-600/60'} font-medium`}>
                {t('home.downloadAgentBuildHint')}
              </div>
            </>
          )}
        </div>

        {/* Recent Events (Make it span to align properly if needed, or leave it normal) */}
        <div className={`${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl sm:rounded-3xl p-4 sm:p-6`}>
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t('home.recentActivity')}</h3>
            <button onClick={() => navigate('/dashboard/events')} className={`text-xs ${isDark ? 'text-zinc-500 hover:text-white' : 'text-gray-400 hover:text-gray-700'} transition-colors`}>{t('home.viewAll')}</button>
          </div>
          
          <div className="space-y-3 sm:space-y-4">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className={`w-12 h-12 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'} border rounded-full flex items-center justify-center mb-3`}>
                  <Activity className={`w-5 h-5 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`} />
                </div>
                <p className={`text-sm font-medium ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{t('home.noActivity')}</p>
              </div>
            ) : (
              events.map((event) => (
                <div key={event.id} className="flex gap-3 sm:gap-4 items-start">
                  <div className={`w-8 h-8 rounded-full ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-blue-50 border-blue-100'} border flex items-center justify-center shrink-0`}>
                    <Activity className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm ${isDark ? 'text-zinc-300' : 'text-gray-700'} leading-tight truncate`}>{event.message}</p>
                    <p className={`text-[11px] ${isDark ? 'text-zinc-600' : 'text-gray-400'} mt-1`}>{new Date(event.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}