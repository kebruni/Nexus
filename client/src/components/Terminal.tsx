import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../api/socket';
import type { CommandResult } from '../types';
import { TerminalSquare, Send, Trash2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface TerminalProps {
  agentId: string;
}

interface TerminalEntry {
  type: 'command' | 'stdout' | 'stderr' | 'info';
  text: string;
  timestamp: string;
}

export default function Terminal({ agentId }: TerminalProps) {
  const { isDark } = useTheme();
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<TerminalEntry[]>([
    { type: 'info', text: '--- PC Control Hub Remote Terminal ---', timestamp: new Date().toISOString() },
    { type: 'info', text: 'Type a command and press Enter to execute on remote computer.', timestamp: new Date().toISOString() },
  ]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleResult = (data: CommandResult) => {
      if (data.agentId !== agentId) return;
      setRunning(false);

      if (data.stdout) {
        setHistory((prev) => [...prev, { type: 'stdout', text: data.stdout, timestamp: new Date().toISOString() }]);
      }
      if (data.stderr) {
        setHistory((prev) => [...prev, { type: 'stderr', text: data.stderr, timestamp: new Date().toISOString() }]);
      }
      if (!data.success && !data.stderr) {
        setHistory((prev) => [
          ...prev,
          { type: 'stderr', text: `Command failed (exit code: ${data.code})`, timestamp: new Date().toISOString() },
        ]);
      }
    };

    socket.on('command:result', handleResult);
    return () => {
      socket.off('command:result', handleResult);
    };
  }, [agentId]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  const executeCommand = () => {
    if (!command.trim() || running) return;
    const socket = getSocket();
    if (!socket) return;

    // Add to history
    setHistory((prev) => [...prev, { type: 'command', text: `> ${command}`, timestamp: new Date().toISOString() }]);
    setCommandHistory((prev) => [command, ...prev.slice(0, 50)]);
    setHistoryIndex(-1);
    setRunning(true);

    socket.emit('command:execute', { agentId, command });
    setCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      } else {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  const clearTerminal = () => {
    setHistory([{ type: 'info', text: '--- Terminal cleared ---', timestamp: new Date().toISOString() }]);
  };

  return (
    <div className={`${isDark ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-200'} border rounded-xl overflow-hidden`}>
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-4 py-2 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-100 border-gray-200'} border-b`}>
        <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
          <TerminalSquare className="w-4 h-4 text-emerald-400" />
          <span>Remote Terminal</span>
          {running && (
            <span className="text-xs text-yellow-400 animate-pulse">executing...</span>
          )}
        </div>
        <button
          onClick={clearTerminal}
          className={`flex items-center gap-1 text-xs ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'} transition px-2 py-1 rounded`}
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="h-[400px] overflow-auto p-4 terminal-output"
        onClick={() => inputRef.current?.focus()}
      >
        {history.map((entry, i) => (
          <div
            key={i}
            className={
              entry.type === 'command'
                ? 'text-emerald-400 font-bold'
                : entry.type === 'stderr'
                ? 'text-red-400'
                : entry.type === 'info'
                ? (isDark ? 'text-slate-500 italic' : 'text-gray-400 italic')
                : (isDark ? 'text-slate-300' : 'text-gray-700')
            }
          >
            {entry.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className={`flex items-center border-t ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-100/50'}`}>
        <span className="pl-4 pr-2 text-emerald-400 font-mono text-sm">$</span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          className={`flex-1 bg-transparent ${isDark ? 'text-white placeholder-slate-600' : 'text-gray-900 placeholder-gray-400'} font-mono text-sm py-3 px-2 outline-none`}
          autoFocus
          disabled={!agentId}
        />
        <button
          onClick={executeCommand}
          disabled={running || !command.trim()}
          className={`px-4 py-3 text-blue-400 hover:text-blue-300 ${isDark ? 'disabled:text-slate-600' : 'disabled:text-gray-300'} transition`}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
