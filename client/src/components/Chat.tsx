import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../api/socket';
import type { ChatMessage } from '../types';
import { Send, MessageSquare } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

const API_BASE = 'http://localhost:3000/api';

interface ChatProps {
  agentId: string;
  agentHostname: string;
}

export default function Chat({ agentId, agentHostname }: ChatProps) {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load chat history
    const token = localStorage.getItem('pc-hub-token');
    if (token) {
      fetch(`${API_BASE}/chat/${agentId}?limit=100`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          setMessages(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setTimeout(() => setLoading(false), 0);
    }

    // Listen for new messages
    const socket = getSocket();
    if (!socket) return;

    const handleMessage = (msg: ChatMessage) => {
      if (msg.agentId !== agentId) return;
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    socket.on('chat:message', handleMessage);

    return () => {
      socket.off('chat:message', handleMessage);
    };
  }, [agentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;

    const socket = getSocket();
    if (!socket) return;

    socket.emit('chat:send', { agentId, text });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={`${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border rounded-xl flex flex-col h-[500px]`}>
      {/* Header */}
      <div className={`flex items-center gap-2 p-3 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
        <MessageSquare className="w-4 h-4 text-blue-400" />
        <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Chat with {agentHostname}</span>
        <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'} ml-auto`}>{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {loading && (
          <div className={`text-center ${isDark ? 'text-slate-500' : 'text-gray-400'} text-sm py-8`}>Loading messages...</div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className={`w-14 h-14 ${isDark ? 'bg-zinc-900' : 'bg-gray-100'} rounded-full flex items-center justify-center mb-4`}>
              <MessageSquare className={`w-6 h-6 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
            </div>
            <p className={`font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{t('chat.noMessages')}</p>
            <p className={`text-sm mt-1 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{t('chat.startConvo')}</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                msg.sender === 'admin'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : isDark
                  ? 'bg-slate-700 text-slate-200 rounded-bl-md'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              }`}
            >
              <div className="text-xs opacity-70 mb-0.5">{msg.senderName}</div>
              <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
              <div className="text-[10px] opacity-50 mt-1 text-right">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`p-3 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className={`flex-1 ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-400'} border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition`}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
