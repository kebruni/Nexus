import { useEffect, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, KeyRound, Copy, AlertTriangle, Check, RotateCcw, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const API_BASE = '/api';

interface Status {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
  pending: boolean;
}

type Mode = 'idle' | 'enrolling' | 'verifying' | 'showCodes' | 'disabling' | 'regenerating';

export default function TwoFactorPanel() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('pc-hub-token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/status`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setStatus(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const reset = () => {
    setMode('idle');
    setSecret(null);
    setQrDataUrl(null);
    setOtpauthUrl(null);
    setCode('');
    setPassword('');
    setRecoveryCodes([]);
    setError(null);
  };

  const startEnroll = async () => {
    setError(null);
    setBusy(true);
    try {
      const token = localStorage.getItem('pc-hub-token');
      const res = await fetch(`${API_BASE}/auth/2fa/enroll`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrollment failed');
      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
      const png = await QRCode.toDataURL(data.otpauthUrl, { errorCorrectionLevel: 'M', width: 256, margin: 1 });
      setQrDataUrl(png);
      setMode('enrolling');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const token = localStorage.getItem('pc-hub-token');
      const res = await fetch(`${API_BASE}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.replace(/\s+/g, '') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setRecoveryCodes(data.recoveryCodes || []);
      setMode('showCodes');
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitDisable = async () => {
    setError(null);
    setBusy(true);
    try {
      const token = localStorage.getItem('pc-hub-token');
      const res = await fetch(`${API_BASE}/auth/2fa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Disable failed');
      reset();
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitRegenerate = async () => {
    setError(null);
    setBusy(true);
    try {
      const token = localStorage.getItem('pc-hub-token');
      const res = await fetch(`${API_BASE}/auth/2fa/recovery-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Regeneration failed');
      setRecoveryCodes(data.recoveryCodes || []);
      setPassword('');
      setMode('showCodes');
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyAll = (codes: string[]) => {
    navigator.clipboard?.writeText(codes.join('\n')).catch(() => undefined);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="nx-settings-action-card is-stack">
      <div className="nx-settings-action-stack-head">
        <div className="nx-settings-action-icon">
          <ShieldCheck className="w-4 h-4" strokeWidth={1.8} />
        </div>
        <div className="nx-settings-action-body">
          <div className="nx-settings-action-title">
            {t('settings.twoFactor')}
            {status?.enabled ? (
              <span className="nx-pill is-ok ml-2">{t('twofa.enabledPill')}</span>
            ) : (
              <span className="nx-pill is-muted ml-2">{t('twofa.disabledPill')}</span>
            )}
          </div>
          <div className="nx-settings-action-desc">{t('settings.twoFactorDesc')}</div>
          {status?.enabled && (
            <div className="text-[11px] text-[color:var(--fg-muted)] mt-1">
              {t('twofa.recoveryRemaining', { count: String(status.recoveryCodesRemaining) })}
            </div>
          )}
        </div>
        {!status?.enabled && mode === 'idle' && (
          <button type="button" disabled={busy} onClick={startEnroll} className="nx-btn is-primary">
            {t('twofa.enable')}
          </button>
        )}
        {status?.enabled && mode === 'idle' && (
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => setMode('regenerating')} className="nx-btn">
              <RotateCcw className="w-3.5 h-3.5" /> {t('twofa.regenerate')}
            </button>
            <button type="button" onClick={() => setMode('disabling')} className="nx-btn is-danger">
              <X className="w-3.5 h-3.5" /> {t('twofa.disable')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="nx-login-error" style={{ marginTop: 0 }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {mode === 'enrolling' && (
        <div className="space-y-3">
          <p className="text-[13px] text-[color:var(--fg-muted)]">{t('twofa.scanHint')}</p>
          <div className="flex flex-wrap gap-4 items-start">
            {qrDataUrl && (
              <img src={qrDataUrl} alt="2FA QR" className="rounded-lg border border-[color:var(--border)] bg-white p-2" width={192} height={192} />
            )}
            <div className="flex-1 min-w-[12rem] space-y-2">
              <div>
                <div className="nx-eyebrow">{t('twofa.secretLabel')}</div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="num-mono text-sm break-all flex-1 px-2 py-1 rounded bg-[color:var(--bg-soft)] border border-[color:var(--border)]">{secret}</code>
                  <button type="button" className="nx-btn nx-btn-icon nx-btn-sm" onClick={() => navigator.clipboard?.writeText(secret || '')}>
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {otpauthUrl && (
                  <a href={otpauthUrl} className="text-[11px] text-[color:var(--accent)] mt-1 inline-block">{t('twofa.openInApp')}</a>
                )}
              </div>
              <div>
                <div className="nx-eyebrow">{t('twofa.codeLabel')}</div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="nx-input mt-1 num-mono tracking-[0.3em] text-center"
                  placeholder="123 456"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={busy || code.length < 6} onClick={submitCode} className="nx-btn is-primary flex-1">
                  <Check className="w-4 h-4" /> {t('twofa.verifyAndEnable')}
                </button>
                <button type="button" disabled={busy} onClick={reset} className="nx-btn">{t('common.cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === 'showCodes' && (
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-[13px] flex gap-2">
            <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <strong>{t('twofa.saveCodesTitle')}</strong>
              <div className="text-[12px] mt-1 opacity-90">{t('twofa.saveCodesDesc')}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((c) => (
              <code key={c} className="num-mono text-sm px-2 py-1.5 rounded bg-[color:var(--bg-soft)] border border-[color:var(--border)] text-center">{c}</code>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => copyAll(recoveryCodes)} className="nx-btn flex-1">
              <Copy className="w-3.5 h-3.5" /> {t('twofa.copyAll')}
            </button>
            <button type="button" onClick={reset} className="nx-btn is-primary flex-1">{t('twofa.savedAndDone')}</button>
          </div>
        </div>
      )}

      {mode === 'disabling' && (
        <div className="space-y-2">
          <p className="text-[13px] text-[color:var(--fg-muted)]">{t('twofa.confirmDisable')}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="nx-input"
            placeholder={t('twofa.passwordPlaceholder')}
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !password} onClick={submitDisable} className="nx-btn is-danger flex-1">
              {t('twofa.disable')}
            </button>
            <button type="button" disabled={busy} onClick={reset} className="nx-btn flex-1">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {mode === 'regenerating' && (
        <div className="space-y-2">
          <p className="text-[13px] text-[color:var(--fg-muted)]">{t('twofa.confirmRegenerate')}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="nx-input"
            placeholder={t('twofa.passwordPlaceholder')}
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !password} onClick={submitRegenerate} className="nx-btn is-primary flex-1">
              {t('twofa.regenerate')}
            </button>
            <button type="button" disabled={busy} onClick={reset} className="nx-btn flex-1">{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
