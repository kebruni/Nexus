import { useEffect, useState } from 'react';
import type { SystemEvent } from '../types';
import { Activity, RefreshCw, Filter } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE = 'http://localhost:3000/api';

export default function EventLog() {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const { t, lang } = useLanguage();
  const { isDark } = useTheme();

  const loadEvents = async () => {
    setLoading(true);
    const token = localStorage.getItem('pc-hub-token');
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/events?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const filtered = filter
    ? events.filter(
        (e) =>
          e.type.toLowerCase().includes(filter.toLowerCase()) ||
          e.message.toLowerCase().includes(filter.toLowerCase())
      )
    : events;

  const typeColor: Record<string, string> = {
    agent_connected: 'text-emerald-400 bg-emerald-500/10',
    agent_disconnected: 'text-red-400 bg-red-500/10',
    admin_login: 'text-blue-400 bg-blue-500/10',
    command_sent: 'text-yellow-400 bg-yellow-500/10',
    command_result: 'text-slate-400 bg-slate-500/10',
    command_reboot: 'text-orange-400 bg-orange-500/10',
    command_shutdown: 'text-red-400 bg-red-500/10',
    file_download: 'text-cyan-400 bg-cyan-500/10',
    file_delete: 'text-red-400 bg-red-500/10',
    service_action: 'text-purple-400 bg-purple-500/10',
    screen_start: 'text-pink-400 bg-pink-500/10',
  };

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t('events.title')}</h1>
          <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} text-sm mt-1`}>{t('events.subtitle')}</p>
        </div>
        <button
          onClick={loadEvents}
          disabled={loading}
          className={`flex items-center gap-2 px-3 py-2 ${isDark ? 'bg-slate-700 text-slate-300 hover:text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200'} rounded-lg transition text-sm self-start sm:self-auto`}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('events.refresh')}
        </button>
      </div>

      {/* Filter */}
      <div className="relative">
        <Filter className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'} absolute left-3 top-1/2 -translate-y-1/2`} />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('events.filter')}
          className={`w-full ${isDark ? 'bg-slate-800/50 border-slate-700 text-white focus:ring-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:ring-blue-400'} border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1`}
        />
      </div>

      {/* Events Table */}
      <div className={`${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-sm'} border rounded-xl overflow-hidden`}>
        <div className="max-h-[600px] overflow-auto">
          {filtered.length === 0 ? (
            <div className={`py-16 sm:py-20 flex flex-col items-center justify-center ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
              <div className={`w-14 h-14 ${isDark ? 'bg-zinc-900' : 'bg-gray-100'} rounded-full flex items-center justify-center mb-4`}>
                <Activity className="w-6 h-6 opacity-60" />
              </div>
              <p className={`font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{t('events.noEvents')}</p>
              <p className={`text-sm mt-1 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                {filter ? (lang === 'ru' ? 'Попробуйте изменить фильтр' : lang === 'kz' ? 'Сүзгіні өзгертіп көріңіз' : 'Try changing the filter') : ''}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className={`${isDark ? 'bg-slate-800/80' : 'bg-gray-50'} sticky top-0`}>
                <tr className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                  <th className="text-left px-4 py-2.5 font-medium w-48 hidden sm:table-cell">{t('events.timestamp')}</th>
                  <th className="text-left px-4 py-2.5 font-medium w-40">{t('events.type')}</th>
                  <th className="text-left px-4 py-2.5 font-medium">{t('events.message')}</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-700/30' : 'divide-gray-100'}`}>
                {filtered.map((event) => (
                  <tr key={event.id} className={`${isDark ? 'hover:bg-slate-700/20' : 'hover:bg-gray-50'}`}>
                    <td className={`px-4 py-2.5 ${isDark ? 'text-slate-500' : 'text-gray-400'} text-xs font-mono hidden sm:table-cell`}>
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          typeColor[event.type] || 'text-slate-400 bg-slate-500/10'
                        }`}
                      >
                        {event.type}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 ${isDark ? 'text-slate-300' : 'text-gray-700'} text-xs`}>{event.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={`px-4 py-2 ${isDark ? 'bg-slate-800/60 border-slate-700 text-slate-500' : 'bg-gray-50 border-gray-200 text-gray-400'} border-t text-xs`}>
          {filtered.length} {t('events.count')}
        </div>
      </div>
    </div>
  );
}
