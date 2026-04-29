import { useEffect, useState } from 'react';
import { getSocket } from '../api/socket';
import type { Agent } from '../types';
import Chat from './Chat';
import { Monitor, MessageSquare, ChevronDown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE = '/api';

export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { t } = useLanguage();
  const { isDark } = useTheme();

  useEffect(() => {
    // Fetch agents via REST API on mount
    const token = localStorage.getItem('pc-hub-token');
    if (token) {
      fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((list: Agent[]) => {
          setAgents(list);
          const first = list.find(a => a.status === 'online');
          if (first) setSelectedAgent(first.id);
        })
        .catch(() => {});
    }

    const socket = getSocket();
    if (!socket) return;
    socket.emit('agents:requestList');
    socket.on('agents:list', (list: Agent[]) => {
      setAgents(list);
      setSelectedAgent(prev => {
        if (prev && list.find(a => a.id === prev)) return prev;
        const first = list.find(a => a.status === 'online');
        return first ? first.id : prev;
      });
    });
    socket.on('agent:metrics', ({ agentId, metrics }: { agentId: string; metrics: Agent['metrics'] }) => {
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, metrics, status: 'online' } : a));
    });
    return () => { socket.off('agents:list'); socket.off('agent:metrics'); };
  }, []);

  const onlineAgents = agents.filter(a => a.status === 'online');
  const selected = agents.find(a => a.id === selectedAgent);

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto py-4 sm:py-8 px-1 sm:pr-8 space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight flex items-center gap-2`}>
            <MessageSquare className="w-5 sm:w-6 h-5 sm:h-6 text-blue-400" />
            {t('chat.title')}
          </h2>
          <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'} mt-1`}>{onlineAgents.length} {t('files.devicesAvailable')}</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex items-center gap-2 ${isDark ? 'bg-[#121212] border-zinc-800 hover:border-zinc-700' : 'bg-white border-gray-200 hover:border-gray-300'} border rounded-xl px-4 py-2.5 text-sm transition-colors w-full sm:min-w-[220px]`}
          >
            {selected ? (
              <>
                <div className={`w-2 h-2 rounded-full ${selected.status === 'online' ? 'bg-emerald-400 shadow-[0_0_4px_#34d399]' : 'bg-zinc-600'}`} />
                <Monitor className={`w-4 h-4 ${isDark ? 'text-zinc-400' : 'text-gray-400'}`} />
                <span className={`${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>{selected.hostname}</span>
              </>
            ) : (
              <span className={isDark ? 'text-zinc-500' : 'text-gray-400'}>{t('files.selectDevice')}</span>
            )}
            <ChevronDown className={`w-4 h-4 ${isDark ? 'text-zinc-500' : 'text-gray-400'} ml-auto transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {dropdownOpen && (
            <div className={`absolute right-0 mt-2 w-full ${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200'} border rounded-xl shadow-2xl z-50 overflow-hidden`}>
              {onlineAgents.length === 0 ? (
                <div className={`px-4 py-3 text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{t('files.noDevicesOnline')}</div>
              ) : (
                onlineAgents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => { setSelectedAgent(agent.id); setDropdownOpen(false); }}
                    className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left transition-colors ${isDark ? 'hover:bg-zinc-800/80' : 'hover:bg-gray-50'} ${
                      agent.id === selectedAgent ? (isDark ? 'bg-zinc-800/50 text-white' : 'bg-blue-50 text-blue-700') : (isDark ? 'text-zinc-400' : 'text-gray-600')
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]" />
                    <Monitor className={`w-3.5 h-3.5 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
                    <span className="font-medium">{agent.hostname}</span>
                    <span className={`${isDark ? 'text-zinc-600' : 'text-gray-400'} font-mono text-xs ml-auto`}>{agent.ip}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {selectedAgent ? (
        <div className="flex-1 min-h-0">
          <Chat agentId={selectedAgent} agentHostname={selected?.hostname || ''} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className={`w-16 h-16 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'} rounded-2xl flex items-center justify-center mx-auto mb-3 border`}>
              <MessageSquare className={`w-8 h-8 ${isDark ? 'text-zinc-700' : 'text-gray-400'}`} />
            </div>
            <p className={`${isDark ? 'text-zinc-500' : 'text-gray-400'} text-sm`}>{t('chat.selectDevice')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
