import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Play,
  Square,
  XCircle,
} from 'lucide-react';
import { getSocket } from '../api/socket';
import { useTheme } from '../contexts/ThemeContext';
import type { ServiceItem } from '../types';

interface ServicesProps {
  agentId: string;
}

export default function Services({ agentId }: ServicesProps) {
  const { isDark } = useTheme();
  const refreshTimerRef = useRef<number | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadServices = useCallback((showLoader = true) => {
    const socket = getSocket();
    if (!socket) return;

    if (showLoader) setLoading(true);
    socket.emit('services:list', { agentId });
  }, [agentId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleList = (data: { agentId: string; error?: string; services: ServiceItem[]; success: boolean }) => {
      if (data.agentId !== agentId) return;

      setLoading(false);
      if (!data.success) {
        setMessage(`Error: ${data.error || 'Unable to load services'}`);
        return;
      }

      setServices(data.services);
    };

    const handleAction = (data: { action: string; agentId: string; message: string; serviceName: string; success: boolean }) => {
      if (data.agentId !== agentId) return;

      setActionLoading(null);
      setMessage(data.success ? `Done: ${data.action} ${data.serviceName} - ${data.message}` : `Error: ${data.message}`);

      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => loadServices(false), 1000);
    };

    socket.on('services:list:result', handleList);
    socket.on('service:action:result', handleAction);
    socket.emit('services:list', { agentId });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      socket.off('services:list:result', handleList);
      socket.off('service:action:result', handleAction);
    };
  }, [agentId, loadServices]);

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return services.filter((service) => {
      if (filter === 'running' && service.status !== 'Running') return false;
      if (filter === 'stopped' && service.status !== 'Stopped') return false;
      if (!query) return true;

      return (
        service.name.toLowerCase().includes(query) ||
        service.displayName.toLowerCase().includes(query)
      );
    });
  }, [filter, search, services]);

  const handleAction = (serviceName: string, action: 'restart' | 'start' | 'stop') => {
    const socket = getSocket();
    if (!socket) return;

    setActionLoading(`${serviceName}-${action}`);
    setMessage('');
    socket.emit('service:action', { agentId, serviceName, action });
  };

  const runningCount = services.filter((service) => service.status === 'Running').length;
  const stoppedCount = services.filter((service) => service.status === 'Stopped').length;

  return (
    <div className={`${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border rounded-xl overflow-hidden`}>
      <div className={`p-3 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50 border-gray-200'} border-b space-y-2`}>
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
            <Settings className="w-4 h-4 text-blue-400" />
            <span>Windows Services</span>
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              ({runningCount} running, {stoppedCount} stopped)
            </span>
          </div>
          <button
            className={`flex items-center gap-1 text-xs ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'} transition px-2 py-1 rounded`}
            disabled={loading}
            onClick={() => loadServices()}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className={`w-full ${isDark ? 'bg-slate-900/50 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500`}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search services..."
              type="text"
              value={search}
            />
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'running', 'stopped'] as const).map((item) => (
              <button
                key={item}
                className={`px-3 py-1.5 text-xs rounded-lg transition ${
                  filter === item
                    ? 'bg-blue-600 text-white'
                    : `${isDark ? 'bg-slate-700/50 text-slate-400 hover:text-white' : 'bg-gray-200 text-gray-500 hover:text-gray-900'}`
                }`}
                onClick={() => setFilter(item)}
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 px-4 py-2 border-b ${
            message.startsWith('Done:')
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : message.startsWith('Error:')
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-blue-500/10 border-blue-500/20'
          }`}
        >
          {message.startsWith('Done:') ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : message.startsWith('Error:') ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : null}
          <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{message}</span>
        </div>
      )}

      <div className="max-h-[500px] overflow-auto">
        {loading ? (
          <div className={`p-8 text-center ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading services...
          </div>
        ) : filteredServices.length === 0 ? (
          <div className={`p-8 text-center ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>No services found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className={`${isDark ? 'bg-slate-800/60 text-slate-400' : 'bg-gray-50 text-gray-500'} sticky top-0`}>
              <tr>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Display Name</th>
                <th className="text-left px-4 py-2 font-medium w-24">Start Type</th>
                <th className="text-center px-4 py-2 font-medium w-32">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-700/30' : 'divide-gray-100'}`}>
              {filteredServices.map((service) => (
                <tr key={service.name} className={`${isDark ? 'hover:bg-slate-700/20' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-2">
                    {service.status === 'Running' ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle className="w-3.5 h-3.5" /> Running
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-500 text-xs">
                        <XCircle className="w-3.5 h-3.5" /> Stopped
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-2 ${isDark ? 'text-slate-300' : 'text-gray-600'} font-mono text-xs`}>{service.name}</td>
                  <td className={`px-4 py-2 ${isDark ? 'text-slate-300' : 'text-gray-600'} text-xs truncate max-w-[200px]`}>{service.displayName}</td>
                  <td className={`px-4 py-2 ${isDark ? 'text-slate-500' : 'text-gray-400'} text-xs`}>{service.startType}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {service.status === 'Stopped' ? (
                        <button
                          className="p-1 text-emerald-500 hover:bg-emerald-500/20 rounded transition"
                          disabled={actionLoading === `${service.name}-start`}
                          onClick={() => handleAction(service.name, 'start')}
                          title="Start"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          className="p-1 text-red-400 hover:bg-red-500/20 rounded transition"
                          disabled={actionLoading === `${service.name}-stop`}
                          onClick={() => handleAction(service.name, 'stop')}
                          title="Stop"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        className="p-1 text-orange-400 hover:bg-orange-500/20 rounded transition"
                        disabled={Boolean(actionLoading)}
                        onClick={() => handleAction(service.name, 'restart')}
                        title="Restart"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={`px-4 py-2 ${isDark ? 'bg-slate-800/60 border-slate-700 text-slate-500' : 'bg-gray-50 border-gray-200 text-gray-400'} border-t text-xs`}>
        {filteredServices.length} of {services.length} services
      </div>
    </div>
  );
}
