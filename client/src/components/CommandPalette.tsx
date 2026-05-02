import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MonitorSmartphone,
  FolderOpen,
  TerminalSquare,
  Tv,
  ArrowLeftRight,
  MessageSquare,
  FileCode,
  Activity,
  BellRing,
  Users,
  ShieldCheck,
  Webhook,
  Search,
  ArrowRight,
  Cpu,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { getSocket } from '../api/socket';
import type { Agent } from '../types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type NavCommand = {
  kind: 'nav';
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  to: string;
  keywords: string;
};

type AgentCommand = {
  kind: 'agent';
  id: string;
  label: string;
  hint?: string;
  online: boolean;
  to: string;
  keywords: string;
};

type ActionCommand = {
  kind: 'action';
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
  keywords: string;
};

type Command = NavCommand | AgentCommand | ActionCommand;

const API_BASE = '/api';

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Load agents while open
  useEffect(() => {
    if (!open) return;
    const token = localStorage.getItem('pc-hub-token');
    if (token) {
      fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setAgents)
        .catch(() => {});
    }
    const socket = getSocket();
    if (!socket) return;
    socket.emit('agents:requestList');
    const onList = (list: Agent[]) => setAgents(list);
    socket.on('agents:list', onList);
    return () => {
      socket.off('agents:list', onList);
    };
  }, [open]);

  // Lock scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const navCommands: NavCommand[] = useMemo(
    () => [
      { kind: 'nav', id: 'nav-dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, to: '/dashboard', keywords: 'home main overview' },
      { kind: 'nav', id: 'nav-devices', label: t('nav.devices'), icon: MonitorSmartphone, to: '/dashboard/devices', keywords: 'agents fleet hosts machines' },
      { kind: 'nav', id: 'nav-files', label: t('nav.fileExplorer'), icon: FolderOpen, to: '/dashboard/files', keywords: 'files browser explorer' },
      { kind: 'nav', id: 'nav-terminal', label: t('nav.terminal'), icon: TerminalSquare, to: '/dashboard/terminal', keywords: 'shell cmd command' },
      { kind: 'nav', id: 'nav-remote', label: t('nav.remoteDesktop'), icon: Tv, to: '/dashboard/remote', keywords: 'screen rdp vnc remote' },
      { kind: 'nav', id: 'nav-sftp', label: t('nav.sftp'), icon: ArrowLeftRight, to: '/dashboard/sftp', keywords: 'transfer upload download files' },
      { kind: 'nav', id: 'nav-chat', label: t('nav.chat'), icon: MessageSquare, to: '/dashboard/chat', keywords: 'message message conversation' },
      { kind: 'nav', id: 'nav-scripts', label: t('nav.scripts'), icon: FileCode, to: '/dashboard/scripts', keywords: 'script automation runbook' },
      { kind: 'nav', id: 'nav-events', label: t('nav.events'), icon: Activity, to: '/dashboard/events', keywords: 'log events history audit' },
      { kind: 'nav', id: 'nav-alerts', label: t('nav.alerts'), icon: BellRing, to: '/dashboard/alerts', keywords: 'alerts notifications rules' },
      { kind: 'nav', id: 'nav-groups', label: t('nav.groups'), icon: Users, to: '/dashboard/groups', keywords: 'groups bulk team' },
      { kind: 'nav', id: 'nav-users', label: t('nav.users'), icon: ShieldCheck, to: '/dashboard/users', keywords: 'users members access role admin' },
      { kind: 'nav', id: 'nav-webhooks', label: t('nav.webhooks'), icon: Webhook, to: '/dashboard/webhooks', keywords: 'webhooks telegram discord slack' },
      { kind: 'nav', id: 'nav-settings', label: t('settings.title'), icon: Settings, to: '/dashboard/settings', keywords: 'settings preferences profile security password' },
    ],
    [t],
  );

  const agentCommands: AgentCommand[] = useMemo(
    () =>
      agents.map((a) => {
        const ip = a.ip || '';
        return {
          kind: 'agent' as const,
          id: `agent-${a.id}`,
          label: a.hostname || a.id,
          hint: ip ? `${ip} · ${a.id.slice(0, 8)}` : a.id.slice(0, 12),
          online: a.status === 'online',
          to: `/dashboard/computer/${a.id}`,
          keywords: `${a.hostname} ${a.id} ${ip} device host agent ${a.platform || ''}`.toLowerCase(),
        };
      }),
    [agents],
  );

  const filtered = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const all: Command[] = [...navCommands, ...agentCommands];
    if (!q) return all.slice(0, 25);
    return all
      .filter((c) =>
        `${c.label} ${'keywords' in c ? c.keywords : ''}`.toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [query, navCommands, agentCommands]);

  // Keep active index in range when filtered changes
  useEffect(() => {
    setActive((idx) => Math.min(idx, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cmd-idx='${active}']`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Global open hotkey is owned by Layout; here we only handle in-palette keys.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((idx) => (idx + 1) % Math.max(filtered.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((idx) => (idx - 1 + filtered.length) % Math.max(filtered.length, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) runCommand(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const runCommand = (cmd: Command) => {
    if (cmd.kind === 'action') {
      cmd.run();
    } else {
      navigate(cmd.to);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="nx-cmdk-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="nx-cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="nx-cmdk-input-row">
          <Search className="w-4 h-4 text-[color:var(--fg-dim)]" strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('cmdk.placeholder')}
            className="nx-cmdk-input"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="nx-kbd">ESC</kbd>
        </div>

        <div ref={listRef} className="nx-cmdk-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="nx-cmdk-empty">
              <Search className="w-5 h-5 text-[color:var(--fg-dim)] mb-2" />
              <span>{t('cmdk.noResults')}</span>
            </div>
          ) : (
            <>
              {(() => {
                const navs = filtered.filter((c) => c.kind === 'nav');
                const agentsList = filtered.filter((c) => c.kind === 'agent');
                let idx = 0;
                return (
                  <>
                    {navs.length > 0 && (
                      <div className="nx-cmdk-group">
                        <div className="nx-cmdk-group-label">{t('cmdk.groupNav')}</div>
                        {navs.map((c) => {
                          const myIdx = idx++;
                          const isActive = myIdx === active;
                          const Icon = (c as NavCommand).icon;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              data-cmd-idx={myIdx}
                              role="option"
                              aria-selected={isActive}
                              className={`nx-cmdk-item${isActive ? ' is-active' : ''}`}
                              onMouseEnter={() => setActive(myIdx)}
                              onClick={() => runCommand(c)}
                            >
                              <Icon className="w-4 h-4 nx-cmdk-icon" strokeWidth={1.8} />
                              <span className="nx-cmdk-label">{c.label}</span>
                              <ArrowRight className="w-3.5 h-3.5 nx-cmdk-go" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {agentsList.length > 0 && (
                      <div className="nx-cmdk-group">
                        <div className="nx-cmdk-group-label">
                          {t('cmdk.groupAgents', { n: agentsList.length })}
                        </div>
                        {agentsList.map((c) => {
                          const myIdx = idx++;
                          const isActive = myIdx === active;
                          const ac = c as AgentCommand;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              data-cmd-idx={myIdx}
                              role="option"
                              aria-selected={isActive}
                              className={`nx-cmdk-item${isActive ? ' is-active' : ''}`}
                              onMouseEnter={() => setActive(myIdx)}
                              onClick={() => runCommand(c)}
                            >
                              <span className={`nx-cmdk-dot${ac.online ? ' is-online' : ''}`} />
                              <span className="nx-cmdk-label">{c.label}</span>
                              {c.hint && <span className="nx-cmdk-hint num-mono">{c.hint}</span>}
                              <ArrowRight className="w-3.5 h-3.5 nx-cmdk-go" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>

        <div className="nx-cmdk-footer">
          <span className="nx-cmdk-hint-row">
            <kbd className="nx-kbd">↑</kbd>
            <kbd className="nx-kbd">↓</kbd>
            <span>{t('cmdk.hintNavigate')}</span>
          </span>
          <span className="nx-cmdk-hint-row">
            <kbd className="nx-kbd">↵</kbd>
            <span>{t('cmdk.hintOpen')}</span>
          </span>
          <span className="nx-cmdk-hint-row ml-auto">
            <Cpu className="w-3 h-3" />
            <span>
              {agents.filter((a) => a.status === 'online').length} / {agents.length} {t('cmdk.online')}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteHint() {
  const { t } = useLanguage();
  return (
    <span className="nx-cmdk-trigger-hint">
      <Search className="w-3.5 h-3.5" strokeWidth={2} />
      <span>{t('cmdk.openHint')}</span>
      <kbd className="nx-kbd">⌘K</kbd>
    </span>
  );
}
