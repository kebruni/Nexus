import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../api/socket';
import type { Agent } from '../types';
import { Monitor, ArrowRight, Laptop } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isDark } = useTheme();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

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

  const filteredAgents = agents;

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto py-4 sm:py-8 px-1 sm:pr-8">
      
      {/* Header */}
      <div className="mb-4 sm:mb-8">
        <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>{t('devices.title')}</h2>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'} mt-1`}>{agents.length} {t('devices.connected')}</p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredAgents.map(agent => (
          <AgentCard key={agent.id} agent={agent} onClick={() => navigate(`/dashboard/computer/${agent.id}`)} />
        ))}
        {filteredAgents.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center bg-[#121212] border border-dashed border-zinc-800 rounded-2xl">
            <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center mb-3">
              <Laptop className="w-5 h-5 text-zinc-600" strokeWidth={1.5} />
            </div>
            <p className="text-zinc-400 font-medium">No devices found</p>
            <p className="text-zinc-600 text-sm mt-1">Start the agent on a remote machine</p>
          </div>
        )}
      </div>

    </div>
  );
}

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const isOnline = agent.status === 'online';

  return (
    <div 
      className="bg-[#121212] border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 hover:bg-[#151515] transition-all cursor-pointer group flex flex-col h-40 relative"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-auto">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          isOnline ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-zinc-800 text-zinc-500'
        }`}>
          <Monitor className="w-5 h-5" strokeWidth={1.5} />
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
          isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-zinc-600'}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider">
            {isOnline ? 'Ready' : 'Offline'}
          </span>
        </div>
      </div>
      
      <div>
        <h3 className="font-semibold text-white text-base mb-0.5 truncate group-hover:text-blue-400 transition-colors">{agent.hostname}</h3>
        <p className="text-sm text-zinc-500 font-mono truncate">{agent.ip}</p>
      </div>

      {/* Mini Metrics */}
      {agent.metrics && (
        <div className="absolute top-5 right-5 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
             <span className="w-6">CPU</span>
             <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
               <div className="h-full bg-blue-500 rounded-full" style={{width: `${agent.metrics.cpu.load}%`}}></div>
             </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
             <span className="w-6">RAM</span>
             <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
               <div className="h-full bg-emerald-500 rounded-full" style={{width: `${agent.metrics.memory.usedPercent}%`}}></div>
             </div>
          </div>
          {agent.metrics.gpus && agent.metrics.gpus.length > 0 && agent.metrics.gpus.map((gpu, idx) => (
            <div key={idx} className="flex items-center gap-2 text-[10px] font-mono text-zinc-400" title={gpu.name}>
               <span className="w-6">GPU</span>
               <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
                 <div className="h-full bg-purple-500 rounded-full" style={{width: `${gpu.load || 0}%`}}></div>
               </div>
            </div>
          ))}
        </div>
      )}

      {/* Hover Action */}
      <div className="absolute bottom-5 right-5 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
        <div className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full flex items-center justify-center shadow-sm border border-zinc-700">
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
