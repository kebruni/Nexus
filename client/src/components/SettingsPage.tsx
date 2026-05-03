import { useState } from 'react';
import {
  User,
  ShieldCheck,
  Sliders,
  Lock,
  Globe,
  Sun,
  Moon,
  Check,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCurrentUser } from '../hooks/useCurrentUser';
import ChangePasswordDialog from './ChangePasswordDialog';
import TwoFactorPanel from './TwoFactorPanel';
import type { Language } from '../i18n/translations';

type Tab = 'profile' | 'security' | 'preferences';

const LANG_LABELS: Record<Language, { code: string; label: string }> = {
  en: { code: 'EN', label: 'English' },
  ru: { code: 'RU', label: 'Русский' },
  kz: { code: 'KZ', label: 'Қазақша' },
};

export default function SettingsPage() {
  const { t, lang, setLang } = useLanguage();
  const { theme, setTheme, isDark } = useTheme();
  const user = useCurrentUser();
  const [tab, setTab] = useState<Tab>('profile');
  const [changePwdOpen, setChangePwdOpen] = useState(false);

  const tabs: { id: Tab; icon: typeof User; label: string }[] = [
    { id: 'profile', icon: User, label: t('settings.tabProfile') },
    { id: 'security', icon: ShieldCheck, label: t('settings.tabSecurity') },
    { id: 'preferences', icon: Sliders, label: t('settings.tabPreferences') },
  ];

  return (
    <div className="nx-settings">
      <header className="nx-page-head">
        <div className="nx-page-head-text">
          <h1 className="nx-page-title">{t('settings.title')}</h1>
          <p className="nx-page-sub">{t('settings.subtitle')}</p>
        </div>
      </header>

      <div className="nx-settings-grid">
        <aside className="nx-settings-tabs" role="tablist" aria-label={t('settings.title')}>
          {tabs.map((tab2) => {
            const Icon = tab2.icon;
            return (
              <button
                key={tab2.id}
                role="tab"
                type="button"
                onClick={() => setTab(tab2.id)}
                className={`nx-settings-tab${tab === tab2.id ? ' is-active' : ''}`}
                aria-selected={tab === tab2.id}
              >
                <Icon className="w-4 h-4" strokeWidth={1.8} />
                <span>{tab2.label}</span>
              </button>
            );
          })}
        </aside>

        <section className="nx-settings-panel" role="tabpanel">
          {tab === 'profile' && (
            <div className="nx-settings-section">
              <header className="nx-settings-section-head">
                <h2>{t('settings.profileTitle')}</h2>
                <p>{t('settings.profileDesc')}</p>
              </header>
              <div className="nx-settings-row">
                <div className="nx-settings-field">
                  <span className="nx-settings-label">{t('settings.username')}</span>
                  <div className="nx-settings-value">{user?.username ?? '—'}</div>
                </div>
                <div className="nx-settings-field">
                  <span className="nx-settings-label">{t('settings.role')}</span>
                  <div className="nx-settings-value">
                    <span className={`nx-pill is-${user?.role === 'admin' ? 'danger' : user?.role === 'operator' ? 'warn' : 'muted'}`}>
                      {user?.role ? t(`role.${user.role}` as 'role.admin') : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="nx-settings-hint">{t('settings.profileHint')}</div>
            </div>
          )}

          {tab === 'security' && (
            <div className="nx-settings-section">
              <header className="nx-settings-section-head">
                <h2>{t('settings.securityTitle')}</h2>
                <p>{t('settings.securityDesc')}</p>
              </header>
              <div className="nx-settings-action-card">
                <div className="nx-settings-action-icon">
                  <Lock className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div className="nx-settings-action-body">
                  <div className="nx-settings-action-title">{t('settings.changePassword')}</div>
                  <div className="nx-settings-action-desc">{t('settings.changePasswordDesc')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setChangePwdOpen(true)}
                  className="nx-btn is-primary"
                >
                  {t('settings.changePassword')}
                </button>
              </div>
              <TwoFactorPanel />
            </div>
          )}

          {tab === 'preferences' && (
            <div className="nx-settings-section">
              <header className="nx-settings-section-head">
                <h2>{t('settings.preferencesTitle')}</h2>
                <p>{t('settings.preferencesDesc')}</p>
              </header>

              <div className="nx-settings-pref-row">
                <div className="nx-settings-pref-label">
                  <span className="nx-settings-pref-icon">
                    {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  </span>
                  <div>
                    <div className="nx-settings-pref-title">{t('settings.theme')}</div>
                    <div className="nx-settings-pref-desc">{t('settings.themeDesc')}</div>
                  </div>
                </div>
                <div className="nx-segmented">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={theme === 'light' ? 'is-active' : ''}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    {t('userMenu.themeLight')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={theme === 'dark' ? 'is-active' : ''}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    {t('userMenu.themeDark')}
                  </button>
                </div>
              </div>

              <div className="nx-settings-pref-row">
                <div className="nx-settings-pref-label">
                  <span className="nx-settings-pref-icon">
                    <Globe className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="nx-settings-pref-title">{t('settings.language')}</div>
                    <div className="nx-settings-pref-desc">{t('settings.languageDesc')}</div>
                  </div>
                </div>
                <div className="nx-segmented">
                  {(['en', 'ru', 'kz'] as Language[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLang(l)}
                      className={lang === l ? 'is-active' : ''}
                    >
                      <span className="num-mono text-[10px]">{LANG_LABELS[l].code}</span>
                      {LANG_LABELS[l].label}
                      {lang === l && <Check className="w-3 h-3 ml-1" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {user && (
        <ChangePasswordDialog
          open={changePwdOpen}
          onClose={() => setChangePwdOpen(false)}
          username={user.username}
        />
      )}
    </div>
  );
}
