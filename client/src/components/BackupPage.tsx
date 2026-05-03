import { useRef, useState } from 'react';
import {
  DatabaseBackup,
  Download,
  Upload,
  Lock,
  Unlock,
  AlertTriangle,
  FileText,
  Loader2,
  Eye,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useHasRole } from '../hooks/useCurrentUser';
import EmptyState from './EmptyState';

const API_BASE = '/api';

interface BackupSummary {
  events: number;
  alerts: number;
  alertRules: number;
  scripts: number;
  webhooks: number;
  schedules: number;
  groups: number;
  chatThreads: number;
}

interface BackupMeta {
  createdAt: string;
  version: number;
  encrypted: boolean;
}

function getToken(): string | null {
  return localStorage.getItem('pc-hub-token');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      // strip data:...;base64,
      const idx = res.indexOf(',');
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function BackupPage() {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const { toast } = useToast();
  const isAdmin = useHasRole('admin');

  const [exportPassword, setExportPassword] = useState('');
  const [exporting, setExporting] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [importBase64, setImportBase64] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<BackupMeta | null>(null);
  const [previewSummary, setPreviewSummary] = useState<BackupSummary | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <EmptyState
          icon={DatabaseBackup}
          title={t('backup.title')}
          description={t('backup.adminOnly')}
        />
      </div>
    );
  }

  const inputBase = isDark
    ? 'bg-slate-800/50 border-slate-700 text-white placeholder-slate-500 focus:ring-blue-500'
    : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-400';

  const cardBase = isDark
    ? 'bg-slate-800/50 border-slate-700'
    : 'bg-white border-gray-200 shadow-sm';

  const handleExport = async () => {
    const token = getToken();
    if (!token) return;
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/backup/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: exportPassword || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = m ? m[1] : `nexus-backup-${Date.now()}.json.gz`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(t('backup.exportSuccess'), 'success', filename);
    } catch (e) {
      toast(t('backup.exportFailed'), 'error', (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const onFileChosen = async (file: File | null) => {
    setImportFile(file);
    setPreviewMeta(null);
    setPreviewSummary(null);
    setPreviewError(null);
    setImportBase64(null);
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setImportBase64(b64);
    } catch (e) {
      setPreviewError((e as Error).message);
    }
  };

  const handlePreview = async () => {
    if (!importBase64) return;
    const token = getToken();
    if (!token) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreviewMeta(null);
    setPreviewSummary(null);
    try {
      const res = await fetch(`${API_BASE}/backup/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ blob: importBase64, password: importPassword || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setPreviewMeta(j.meta);
      setPreviewSummary(j.summary);
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleRestore = async () => {
    if (!importBase64 || !previewSummary) return;
    if (!window.confirm(t('backup.confirmRestore'))) return;
    const token = getToken();
    if (!token) return;
    setRestoring(true);
    try {
      const res = await fetch(`${API_BASE}/backup/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ blob: importBase64, password: importPassword || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast(
        t('backup.restoreSuccess'),
        'success',
        `${j.summary.events} events, ${j.summary.scripts} scripts`,
      );
      // Reset import state
      setImportFile(null);
      setImportBase64(null);
      setImportPassword('');
      setPreviewMeta(null);
      setPreviewSummary(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      toast(t('backup.restoreFailed'), 'error', (e as Error).message);
    } finally {
      setRestoring(false);
    }
  };

  const summaryItems: { key: keyof BackupSummary; label: string }[] = [
    { key: 'events', label: t('backup.summary.events') },
    { key: 'alerts', label: t('backup.summary.alerts') },
    { key: 'alertRules', label: t('backup.summary.alertRules') },
    { key: 'scripts', label: t('backup.summary.scripts') },
    { key: 'webhooks', label: t('backup.summary.webhooks') },
    { key: 'schedules', label: t('backup.summary.schedules') },
    { key: 'groups', label: t('backup.summary.groups') },
    { key: 'chatThreads', label: t('backup.summary.chatThreads') },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {t('backup.title')}
        </h1>
        <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} text-sm mt-1`}>
          {t('backup.subtitle')}
        </p>
      </div>

      {/* Notice */}
      <div
        className={`${
          isDark
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        } border rounded-xl p-3 sm:p-4 flex gap-3 text-sm`}
      >
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>{t('backup.noticeSecrets')}</div>
      </div>

      {/* Export */}
      <section className={`${cardBase} border rounded-xl p-4 sm:p-6 space-y-4`}>
        <header className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-100 text-blue-700'
            }`}
          >
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {t('backup.exportTitle')}
            </h2>
            <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} text-xs`}>
              {t('backup.exportDesc')}
            </p>
          </div>
        </header>

        <label className="block">
          <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            {t('backup.passwordOptional')}
          </span>
          <div className="relative mt-1">
            {exportPassword ? (
              <Lock
                className={`w-4 h-4 ${
                  isDark ? 'text-emerald-400' : 'text-emerald-600'
                } absolute left-3 top-1/2 -translate-y-1/2`}
              />
            ) : (
              <Unlock
                className={`w-4 h-4 ${
                  isDark ? 'text-slate-500' : 'text-gray-400'
                } absolute left-3 top-1/2 -translate-y-1/2`}
              />
            )}
            <input
              type="password"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              placeholder={t('backup.passwordPlaceholder')}
              className={`w-full ${inputBase} border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1`}
              autoComplete="new-password"
            />
          </div>
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
            {t('backup.passwordHint')}
          </p>
        </label>

        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition text-sm disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {exporting ? t('backup.exporting') : t('backup.exportButton')}
        </button>
      </section>

      {/* Import / Restore */}
      <section className={`${cardBase} border rounded-xl p-4 sm:p-6 space-y-4`}>
        <header className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              isDark ? 'bg-purple-500/15 text-purple-300' : 'bg-purple-100 text-purple-700'
            }`}
          >
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {t('backup.restoreTitle')}
            </h2>
            <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} text-xs`}>
              {t('backup.restoreDesc')}
            </p>
          </div>
        </header>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gz,.json,application/gzip,application/octet-stream"
            onChange={(e) => void onFileChosen(e.target.files?.[0] ?? null)}
            className={`block w-full text-sm ${
              isDark ? 'text-slate-300' : 'text-gray-700'
            } file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium ${
              isDark
                ? 'file:bg-slate-700 file:text-white hover:file:bg-slate-600'
                : 'file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200'
            }`}
          />
          {importFile && (
            <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              <FileText className="w-3 h-3 inline-block mr-1 -mt-0.5" />
              {importFile.name} · {(importFile.size / 1024).toFixed(1)} KB
            </p>
          )}
        </div>

        <label className="block">
          <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            {t('backup.restorePassword')}
          </span>
          <input
            type="password"
            value={importPassword}
            onChange={(e) => setImportPassword(e.target.value)}
            placeholder={t('backup.restorePasswordPlaceholder')}
            className={`mt-1 w-full ${inputBase} border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1`}
            autoComplete="new-password"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={!importBase64 || previewing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 ${
              isDark
                ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {previewing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            {t('backup.previewButton')}
          </button>
          <button
            type="button"
            onClick={() => void handleRestore()}
            disabled={!previewSummary || restoring}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition text-sm disabled:opacity-50"
          >
            {restoring ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {restoring ? t('backup.restoring') : t('backup.restoreButton')}
          </button>
        </div>

        {previewError && (
          <div
            className={`${
              isDark
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-red-50 border-red-200 text-red-700'
            } border rounded-lg p-3 text-sm flex gap-2`}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>{previewError}</div>
          </div>
        )}

        {previewMeta && previewSummary && (
          <div
            className={`${
              isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-gray-50 border-gray-200'
            } border rounded-lg p-3 sm:p-4 space-y-3`}
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                {t('backup.meta.createdAt')}:{' '}
                <span className={isDark ? 'text-slate-200' : 'text-gray-900'}>
                  {new Date(previewMeta.createdAt).toLocaleString()}
                </span>
              </span>
              <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                {t('backup.meta.version')}:{' '}
                <span className={isDark ? 'text-slate-200' : 'text-gray-900'}>
                  v{previewMeta.version}
                </span>
              </span>
              <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                {previewMeta.encrypted ? (
                  <>
                    <Lock className="w-3 h-3 inline-block -mt-0.5" /> {t('backup.meta.encrypted')}
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 inline-block -mt-0.5" />{' '}
                    {t('backup.meta.notEncrypted')}
                  </>
                )}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {summaryItems.map(({ key, label }) => (
                <div
                  key={key}
                  className={`${
                    isDark ? 'bg-slate-800/60' : 'bg-white'
                  } rounded-lg px-3 py-2 border ${
                    isDark ? 'border-slate-700' : 'border-gray-200'
                  }`}
                >
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    {label}
                  </div>
                  <div
                    className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
                  >
                    {previewSummary[key]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
