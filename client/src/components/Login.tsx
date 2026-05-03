import { useState } from 'react';
import { Lock, AlertCircle, Sun, Moon, Globe, Server, ShieldCheck, Activity, Cpu, ArrowRight, KeyRound } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import type { Language } from '../i18n/translations';
import { setCurrentUser, type Role } from '../api/auth';

const API_BASE = '/api';

const LANG_LABELS: Record<Language, string> = { en: 'EN', ru: 'RU', kz: 'KZ' };
const LANG_ORDER: Language[] = ['en', 'ru', 'kz'];

interface LoginProps {
  onLogin: (token: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [totpTicket, setTotpTicket] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const { lang, setLang, t } = useLanguage();
  const { setTheme, isDark } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      if (data.totpRequired && data.ticket) {
        setTotpTicket(data.ticket);
        setLoading(false);
        return;
      }

      if (data.mustChangePassword) {
        setPendingToken(data.token);
        setLoading(false);
        return;
      }

      localStorage.setItem('pc-hub-token', data.token);
      if (data.username && data.role) {
        setCurrentUser({ username: data.username, role: data.role as Role });
      }
      onLogin(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!totpTicket) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login/totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: totpTicket, code: totpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid 2FA code');
      if (data.mustChangePassword) {
        // Edge case: token is full session but pending pwd-change. Reuse the
        // existing pre-change-password flow.
        setPendingToken(data.token);
        setTotpTicket(null);
        setTotpCode('');
        setLoading(false);
        return;
      }
      localStorage.setItem('pc-hub-token', data.token);
      if (data.username && data.role) {
        setCurrentUser({ username: data.username, role: data.role as Role });
      }
      onLogin(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '2FA verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError(t('login.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('login.passwordMismatch'));
      return;
    }
    if (newPassword === password) {
      setError(t('login.passwordSame'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingToken}`,
        },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password change failed');

      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: newPassword }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) throw new Error(loginData.error || 'Re-login failed');
      localStorage.setItem('pc-hub-token', loginData.token);
      if (loginData.username && loginData.role) {
        setCurrentUser({ username: loginData.username, role: loginData.role as Role });
      }
      onLogin(loginData.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nx-login">
      {/* Top-right controls */}
      <div className="nx-login-controls">
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="nx-btn nx-btn-icon nx-btn-sm"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <div className="relative">
          <button onClick={() => setLangMenuOpen(!langMenuOpen)} className="nx-btn nx-btn-sm">
            <Globe className="w-3.5 h-3.5" /> {LANG_LABELS[lang]}
          </button>
          {langMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
              <div className="nx-dropdown">
                {LANG_ORDER.map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      setLang(l);
                      setLangMenuOpen(false);
                    }}
                    className={`nx-dropdown-item ${l === lang ? 'is-active' : ''}`}
                  >
                    <span className="num-mono text-[10px] text-[color:var(--fg-dim)] w-6">{LANG_LABELS[l]}</span>
                    <span>{l === 'en' ? 'English' : l === 'ru' ? 'Русский' : 'Қазақша'}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Left brand panel */}
      <aside className="nx-login-brand">
        <div className="nx-login-brand-bg" aria-hidden />
        <div className="nx-login-brand-content">
          <div className="flex items-center gap-3">
            <div className="nx-logo-mark" style={{ width: 40, height: 40, borderRadius: 12 }}>
              <Server className="w-5 h-5" strokeWidth={2} />
            </div>
            <div>
              <div className="nx-brand text-2xl leading-none">Nexus</div>
              <div className="nx-eyebrow text-[color:var(--fg-muted)] mt-1.5">{t('login.brandTagline')}</div>
            </div>
          </div>

          <h2 className="nx-login-headline">
            {t('login.headlineLine1')}
            <br />
            <span className="nx-brand">{t('login.headlineLine2')}</span>
          </h2>
          <p className="nx-login-sub">
            {t('login.heroSub')}
          </p>

          <div className="nx-login-features">
            <div className="nx-login-feature">
              <Activity className="w-4 h-4 text-[color:var(--accent)]" />
              <div>
                <div className="text-[13px] font-semibold">{t('login.featLiveTitle')}</div>
                <div className="text-[11px] text-[color:var(--fg-muted)]">{t('login.featLiveSub')}</div>
              </div>
            </div>
            <div className="nx-login-feature">
              <Cpu className="w-4 h-4 text-[color:var(--info)]" />
              <div>
                <div className="text-[13px] font-semibold">{t('login.featRemoteTitle')}</div>
                <div className="text-[11px] text-[color:var(--fg-muted)]">{t('login.featRemoteSub')}</div>
              </div>
            </div>
            <div className="nx-login-feature">
              <ShieldCheck className="w-4 h-4 text-[color:var(--ok)]" />
              <div>
                <div className="text-[13px] font-semibold">{t('login.featRoleTitle')}</div>
                <div className="text-[11px] text-[color:var(--fg-muted)]">{t('login.featRoleSub')}</div>
              </div>
            </div>
          </div>

          <div className="nx-login-foot">
            <span className="nx-eyebrow">{t('login.statusLabel')}</span>
            <span className="nx-pill is-ok is-pulse">
              <span className="nx-dot" /> {t('login.allOk')}
            </span>
          </div>
        </div>
      </aside>

      {/* Right form panel */}
      <main className="nx-login-form-wrap">
        <div className="nx-login-form">
          <div className="nx-login-form-head">
            <span className="nx-eyebrow">{t('login.adminLogin')}</span>
            <h1 className="text-[28px] font-bold tracking-tight mt-2 text-[color:var(--fg-strong)]">
              {totpTicket ? t('login.totpTitle') : pendingToken ? t('login.changePasswordTitle') : t('login.title')}
            </h1>
            <p className="text-[13px] text-[color:var(--fg-muted)] mt-1.5">
              {totpTicket ? t('login.totpSubtitle') : pendingToken ? t('login.changePasswordSubtitle') : t('login.subtitle')}
            </p>
          </div>

          {error && (
            <div className="nx-login-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {totpTicket ? (
            <form onSubmit={handleTotpSubmit} className="space-y-3">
              <div>
                <label className="nx-eyebrow flex items-center gap-1.5">
                  <KeyRound className="w-3 h-3" /> {t('login.totpCode')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 -]*"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="nx-input mt-2 num-mono tracking-[0.3em] text-center"
                  placeholder="123 456"
                  required
                  autoFocus
                />
                <p className="text-[11px] text-[color:var(--fg-muted)] mt-1.5">{t('login.totpHint')}</p>
              </div>
              <button type="submit" disabled={loading} className="nx-btn is-primary w-full mt-2">
                {loading ? '…' : t('login.totpSubmit')}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => { setTotpTicket(null); setTotpCode(''); setError(''); }}
                className="nx-btn w-full mt-1"
              >
                {t('login.totpCancel')}
              </button>
            </form>
          ) : pendingToken ? (
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="nx-eyebrow">{t('login.newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="nx-input mt-2"
                  placeholder="••••••••"
                  required
                  autoFocus
                  minLength={8}
                />
              </div>
              <div>
                <label className="nx-eyebrow">{t('login.confirmPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="nx-input mt-2"
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </div>
              <button type="submit" disabled={loading} className="nx-btn is-primary w-full mt-2">
                {loading ? '…' : t('login.savePassword')}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="nx-eyebrow">{t('login.username')}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="nx-input mt-2"
                  placeholder="admin"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="nx-eyebrow flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> {t('login.password')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="nx-input mt-2"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="nx-btn is-primary w-full mt-2">
                {loading ? t('login.signingIn') : t('login.signIn')}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>

            </form>
          )}
        </div>
      </main>
    </div>
  );
}
