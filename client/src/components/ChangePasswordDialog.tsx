import { useState } from 'react';
import { X, Lock, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';

interface Props {
  open: boolean;
  onClose: () => void;
  username: string;
}

export default function ChangePasswordDialog({ open, onClose, username }: Props) {
  const { t } = useLanguage();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setShowCurrent(false);
    setShowNext(false);
    setErr(null);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (next.length < 8) {
      setErr(t('changePwd.errTooShort'));
      return;
    }
    if (next !== confirm) {
      setErr(t('changePwd.errMismatch'));
      return;
    }
    if (next === current) {
      setErr(t('changePwd.errSame'));
      return;
    }

    setBusy(true);
    try {
      const token = localStorage.getItem('pc-hub-token');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(t('changePwd.successTitle'), t('changePwd.successDesc'));
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nx-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cp-title" onClick={close}>
      <div className="nx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nx-modal-head">
          <div className="nx-modal-icon">
            <Lock className="w-4 h-4" strokeWidth={2.2} />
          </div>
          <div className="nx-modal-titles">
            <h3 id="cp-title" className="nx-modal-title">{t('changePwd.title')}</h3>
            <p className="nx-modal-desc">{t('changePwd.descPrefix')} <strong>{username}</strong></p>
          </div>
          <button type="button" onClick={close} className="nx-modal-close" aria-label={t('layout.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="nx-modal-body">
          <label className="nx-field">
            <span className="nx-field-label">{t('changePwd.current')}</span>
            <div className="nx-field-input-wrap">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
                className="nx-input"
              />
              <button type="button" className="nx-input-affix" onClick={() => setShowCurrent((v) => !v)} aria-label="Toggle visibility">
                {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </label>

          <label className="nx-field">
            <span className="nx-field-label">{t('changePwd.next')}</span>
            <div className="nx-field-input-wrap">
              <input
                type={showNext ? 'text' : 'password'}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="nx-input"
              />
              <button type="button" className="nx-input-affix" onClick={() => setShowNext((v) => !v)} aria-label="Toggle visibility">
                {showNext ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <span className="nx-field-hint">{t('changePwd.hint')}</span>
          </label>

          <label className="nx-field">
            <span className="nx-field-label">{t('changePwd.confirm')}</span>
            <input
              type={showNext ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="nx-input"
            />
          </label>

          {err && <div className="nx-form-error">{err}</div>}

          <div className="nx-modal-actions">
            <button type="button" className="nx-btn" onClick={close} disabled={busy}>
              {t('layout.cancel')}
            </button>
            <button type="submit" className="nx-btn is-primary" disabled={busy}>
              {busy ? t('changePwd.saving') : t('changePwd.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
