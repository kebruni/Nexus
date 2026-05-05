import { useEffect, useState } from 'react';
import { Bell, Send, BellOff } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  isPushSupported,
  getPushStatus,
  enablePush,
  disablePush,
  sendTestPush,
  type PushStatus,
} from '../api/push';

function getToken(): string {
  return localStorage.getItem('pc-hub-token') || '';
}

export default function NotificationsPanel() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'enable' | 'disable' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const supported = isPushSupported();

  async function refresh() {
    if (!supported) return;
    try {
      setLoading(true);
      const s = await getPushStatus(getToken());
      setStatus(s);
    } catch {
      setStatus({ enabled: false, deviceCount: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleEnable() {
    setError(null);
    setInfo(null);
    setBusy('enable');
    try {
      await enablePush(getToken());
      setInfo(t('push.enableSuccess'));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDisable() {
    setError(null);
    setInfo(null);
    setBusy('disable');
    try {
      await disablePush(getToken());
      setInfo(t('push.disableSuccess'));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleTest() {
    setError(null);
    setInfo(null);
    setBusy('test');
    try {
      const r = await sendTestPush(getToken());
      setInfo(t('push.testSent').replace('{n}', String(r.delivered)).replace('{total}', String(r.total)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (!supported) {
    return (
      <div className="nx-settings-action-card">
        <div className="nx-settings-action-icon">
          <BellOff className="w-4 h-4" strokeWidth={1.8} />
        </div>
        <div className="nx-settings-action-body">
          <div className="nx-settings-action-title">{t('push.title')}</div>
          <div className="nx-settings-action-desc">{t('push.unsupported')}</div>
        </div>
      </div>
    );
  }

  const enabled = !!status?.enabled;

  return (
    <div className="nx-settings-action-card">
      <div className="nx-settings-action-icon">
        <Bell className="w-4 h-4" strokeWidth={1.8} />
      </div>
      <div className="nx-settings-action-body">
        <div className="nx-settings-action-title">{t('push.title')}</div>
        <div className="nx-settings-action-desc">
          {loading
            ? t('push.loading')
            : enabled
            ? t('push.enabledOn').replace('{n}', String(status?.deviceCount ?? 0))
            : t('push.desc')}
        </div>
        {error && <div className="nx-settings-action-error">{error}</div>}
        {info && <div className="nx-settings-action-info">{info}</div>}
      </div>
      <div className="nx-settings-action-buttons">
        {enabled ? (
          <>
            <button
              type="button"
              onClick={handleTest}
              disabled={busy !== null}
              className="nx-btn"
            >
              <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
              {busy === 'test' ? '…' : t('push.testButton')}
            </button>
            <button
              type="button"
              onClick={handleDisable}
              disabled={busy !== null}
              className="nx-btn is-danger-ghost"
            >
              {busy === 'disable' ? '…' : t('push.disableButton')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy !== null}
            className="nx-btn is-primary"
          >
            {busy === 'enable' ? '…' : t('push.enableButton')}
          </button>
        )}
      </div>
    </div>
  );
}
