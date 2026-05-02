import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, ShieldAlert, CheckCheck } from 'lucide-react';
import { getSocket } from '../api/socket';
import { useLanguage } from '../contexts/LanguageContext';
import type { Alert } from '../types';

const API_BASE = '/api';

function formatRelative(ts: string): string {
  const diff = Math.max(0, Date.now() - new Date(ts).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchAlerts = useMemo(
    () => () => {
      const token = localStorage.getItem('pc-hub-token');
      if (!token) return;
      fetch(`${API_BASE}/alerts/unread`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : []))
        .then((list: Alert[]) => setAlerts(Array.isArray(list) ? list : []))
        .catch(() => {});
    },
    [],
  );

  useEffect(() => {
    fetchAlerts();
    const socket = getSocket();
    if (!socket) return;
    const onAlert = (a: Alert) => setAlerts((prev) => [a, ...prev].slice(0, 50));
    socket.on('alert:new', onAlert);
    return () => {
      socket.off('alert:new', onAlert);
    };
  }, [fetchAlerts]);

  // Refresh on open
  useEffect(() => {
    if (open) fetchAlerts();
  }, [open, fetchAlerts]);

  const unreadCount = alerts.length;
  const critical = alerts.some((a) => a.severity === 'critical');

  const handleAcknowledgeAll = async () => {
    const token = localStorage.getItem('pc-hub-token');
    if (!token) return;
    try {
      await fetch(`${API_BASE}/alerts/acknowledge-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts([]);
    } catch {
      /* swallow */
    }
  };

  const open5 = alerts.slice(0, 6);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`nx-btn nx-btn-icon nx-btn-sm nx-bell${critical ? ' has-critical' : unreadCount > 0 ? ' has-unread' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('notifications.title')}
        aria-label={t('notifications.title')}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="nx-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="nx-dropdown nx-dropdown-bell" role="menu">
            <div className="nx-dropdown-bell-head">
              <div className="nx-dropdown-bell-title">{t('notifications.title')}</div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleAcknowledgeAll}
                  className="nx-bell-clear"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {t('notifications.markAll')}
                </button>
              )}
            </div>
            <div className="nx-dropdown-bell-body">
              {open5.length === 0 ? (
                <div className="nx-dropdown-bell-empty">
                  <CheckCheck className="w-5 h-5 text-[color:var(--ok)] mb-2" />
                  <div className="nx-dropdown-bell-empty-title">{t('notifications.allClear')}</div>
                  <div className="nx-dropdown-bell-empty-desc">{t('notifications.allClearDesc')}</div>
                </div>
              ) : (
                <ul className="nx-bell-list">
                  {open5.map((a) => {
                    const isCritical = a.severity === 'critical';
                    return (
                      <li
                        key={a.id}
                        className={`nx-bell-item${isCritical ? ' is-critical' : ' is-warning'}`}
                      >
                        <span className="nx-bell-item-icon">
                          {isCritical ? (
                            <ShieldAlert className="w-4 h-4" strokeWidth={2.2} />
                          ) : (
                            <AlertTriangle className="w-4 h-4" strokeWidth={2.2} />
                          )}
                        </span>
                        <div className="nx-bell-item-body">
                          <div className="nx-bell-item-title">{a.ruleName}</div>
                          <div className="nx-bell-item-msg">{a.message}</div>
                          <div className="nx-bell-item-meta">
                            <span>{a.agentHostname}</span>
                            <span>·</span>
                            <span>{formatRelative(a.timestamp)}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="nx-dropdown-bell-foot">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/dashboard/alerts');
                }}
                className="nx-bell-viewall"
              >
                {t('notifications.viewAll')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
