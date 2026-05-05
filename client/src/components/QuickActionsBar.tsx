/**
 * One-click command buttons shown on the agent detail page.
 *
 * Quick actions are admin-curated short commands (e.g. "Flush DNS",
 * "Restart Explorer"). Operators click → confirmation → command runs
 * on the targeted agent via the same single-agent fan-out path used
 * by the bulk endpoint.
 */
import { useEffect, useMemo, useState } from 'react';
import * as Icons from 'lucide-react';
import { Play, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrentUser } from '../hooks/useCurrentUser';

const API = '/api';

function authHeaders() {
  const t = localStorage.getItem('pc-hub-token') || '';
  return { Authorization: `Bearer ${t}` };
}

interface QuickAction {
  id: string;
  name: string;
  description: string | null;
  command: string;
  os: 'windows' | 'linux' | 'macos' | 'all';
  icon: string | null;
}

interface Props {
  agentId: string;
  agentOs?: string; // 'win32' | 'linux' | 'darwin' from agent metrics
}

function osMatches(actionOs: string, agentOs?: string): boolean {
  if (actionOs === 'all') return true;
  if (!agentOs) return true; // unknown — show all
  if (actionOs === 'windows') return agentOs.startsWith('win');
  if (actionOs === 'macos') return agentOs === 'darwin';
  if (actionOs === 'linux') return agentOs === 'linux';
  return true;
}

function pickIcon(name: string | null | undefined) {
  if (!name) return Play;
  // lucide-react exports each icon as a named React component. Look it up
  // by name and fall back to Play if not found.
  const Comp = (Icons as unknown as Record<string, typeof Play>)[name];
  return Comp || Play;
}

export default function QuickActionsBar({ agentId, agentOs }: Props) {
  const { t } = useLanguage();
  const user = useCurrentUser();
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('quickActions.collapsed') === '1';
  });

  const canRun = user?.role === 'operator' || user?.role === 'admin';

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/quick-actions`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setActions(Array.isArray(d.actions) ? d.actions : []))
      .catch(() => setActions([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => actions.filter((a) => osMatches(a.os, agentOs)),
    [actions, agentOs],
  );

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('quickActions.collapsed', next ? '1' : '0');
  }

  async function run(a: QuickAction) {
    if (!canRun) return;
    const ok = window.confirm(
      `${t('quickActions.confirmRun').replace('{name}', a.name)}\n\n${a.command}`,
    );
    if (!ok) return;
    setRunning(a.id);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`${API}/quick-actions/${a.id}/run/${agentId}`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setInfo(t('quickActions.runSuccess').replace('{name}', a.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
      setTimeout(() => {
        setInfo(null);
        setError(null);
      }, 4000);
    }
  }

  if (!loading && visible.length === 0) return null;

  return (
    <div className="nx-quick-actions">
      <div className="nx-quick-actions-head">
        <button
          type="button"
          className="nx-quick-actions-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          <span className="nx-quick-actions-title">{t('quickActions.title')}</span>
          <span className="nx-quick-actions-count">{visible.length}</span>
        </button>
        {error && (
          <span className="nx-quick-actions-error">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </span>
        )}
        {info && <span className="nx-quick-actions-info">{info}</span>}
      </div>
      {!collapsed && (
        <div className="nx-quick-actions-grid">
          {visible.map((a) => {
            const Icon = pickIcon(a.icon);
            return (
              <button
                key={a.id}
                type="button"
                className="nx-quick-action-btn"
                onClick={() => run(a)}
                disabled={!canRun || running !== null}
                title={a.description || a.command}
              >
                <Icon className="w-4 h-4" strokeWidth={1.8} />
                <span className="nx-quick-action-label">
                  {running === a.id ? t('quickActions.running') : a.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
