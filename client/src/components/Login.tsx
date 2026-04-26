import { useState } from 'react';
import { Monitor, Lock, AlertCircle, Sun, Moon, Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import type { Language } from '../i18n/translations';

const API_BASE = 'http://localhost:3000/api';

const LANG_LABELS: Record<Language, string> = { en: 'EN', ru: 'RU', kz: 'KZ' };
const LANG_ORDER: Language[] = ['en', 'ru', 'kz'];

interface LoginProps {
  onLogin: (token: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

      localStorage.setItem('pc-hub-token', data.token);
      onLogin(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-white to-blue-50'} flex items-center justify-center p-4 relative`}>
      {/* Top controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={`w-9 h-9 flex items-center justify-center rounded-xl ${isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-white text-gray-500 hover:text-gray-900 shadow-sm border border-gray-200'} transition-all`}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <div className="relative">
          <button
            onClick={() => setLangMenuOpen(!langMenuOpen)}
            className={`h-9 flex items-center gap-1.5 px-2.5 rounded-xl ${isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-white text-gray-500 hover:text-gray-900 shadow-sm border border-gray-200'} transition-all text-xs font-semibold`}
          >
            <Globe className="w-3.5 h-3.5" />
            {LANG_LABELS[lang]}
          </button>
          {langMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
              <div className={`absolute right-0 mt-1.5 z-50 ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'} border rounded-xl shadow-xl overflow-hidden min-w-[100px]`}>
                {LANG_ORDER.map((l) => (
                  <button
                    key={l}
                    onClick={() => { setLang(l); setLangMenuOpen(false); }}
                    className={`flex items-center gap-2 w-full px-3.5 py-2 text-xs font-medium transition-colors ${
                      l === lang
                        ? isDark ? 'bg-slate-700 text-white' : 'bg-blue-50 text-blue-700'
                        : isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {l === 'en' ? 'English' : l === 'ru' ? 'Русский' : 'Қазақша'}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-600/30">
            <Monitor className="w-8 h-8 text-white" />
          </div>
          <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t('login.title')}</h1>
          <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} mt-2`}>{t('login.subtitle')}</p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className={`${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-lg'} backdrop-blur-lg border rounded-2xl p-6 sm:p-8 shadow-xl`}
        >
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-blue-400" />
            <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{t('login.adminLogin')}</h2>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'} mb-1.5`}>{t('login.username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full px-4 py-2.5 ${isDark ? 'bg-slate-900/50 border-slate-600 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`}
                placeholder="admin"
                required
                autoFocus
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'} mb-1.5`}>{t('login.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-2.5 ${isDark ? 'bg-slate-900/50 border-slate-600 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition shadow-lg shadow-blue-600/20"
          >
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>

          <p className={`mt-4 text-center text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
            {t('login.default')}
          </p>
        </form>
      </div>
    </div>
  );
}
