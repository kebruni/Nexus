import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { connectSocket, disconnectSocket } from './api/socket';
import { setCurrentUser, removeToken, type Role } from './api/auth';

const API_BASE = '/api';

const Login = lazy(() => import('./components/Login'));
const Layout = lazy(() => import('./components/Layout'));
const HomeDashboard = lazy(() => import('./components/HomeDashboard'));
const Devices = lazy(() => import('./components/Devices'));
const ComputerDetail = lazy(() => import('./components/ComputerDetail'));
const EventLog = lazy(() => import('./components/EventLog'));
const Alerts = lazy(() => import('./components/Alerts'));
const Analytics = lazy(() => import('./components/Analytics'));
const FileTransfer = lazy(() => import('./components/FileTransfer'));
const RemoteDesktopPage = lazy(() => import('./components/RemoteDesktopPage'));
const TerminalPage = lazy(() => import('./components/TerminalPage'));
const ChatPage = lazy(() => import('./components/ChatPage'));
const NotFound = lazy(() => import('./components/NotFound'));
const ScriptsPage = lazy(() => import('./components/ScriptsPage'));
const QuickActionsLibraryPage = lazy(() => import('./components/QuickActionsLibraryPage'));
const GroupsPage = lazy(() => import('./components/GroupsPage'));
const UsersPage = lazy(() => import('./components/UsersPage'));
const WebhooksPage = lazy(() => import('./components/WebhooksPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const ProcessesPage = lazy(() => import('./components/ProcessesPage'));
const AuditLogPage = lazy(() => import('./components/AuditLogPage'));
const SchedulesPage = lazy(() => import('./components/SchedulesPage'));
const BackupPage = lazy(() => import('./components/BackupPage'));

function AppSplash() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-6">
      <div className="splash-logo w-16 h-16 bg-zinc-800 border border-zinc-700 rounded-2xl flex items-center justify-center shadow-2xl">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </div>
      <div className="text-center splash-fade">
        <h1 className="text-2xl font-bold text-white tracking-tight">Nexus</h1>
        <p className="text-zinc-500 text-sm mt-1">Remote Access</p>
      </div>
      <div className="splash-spinner w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full" />
    </div>
  );
}

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('pc-hub-token');
    if (saved) {
      fetch(`${API_BASE}/auth/verify`, { headers: { Authorization: `Bearer ${saved}` } })
        .then(async (response) => {
          if (!response.ok) {
            removeToken();
            return;
          }
          const body = await response.json().catch(() => ({}));
          if (body && body.mustChangePassword) {
            // Token is valid but the account still owes a password change;
            // force the user back to the login flow (which renders the
            // change-password panel).
            removeToken();
            return;
          }
          if (body && body.user && body.user.username && body.user.role) {
            setCurrentUser({ username: body.user.username, role: body.user.role as Role });
          }
          setToken(saved);
          connectSocket(saved);
        })
        .catch(() => removeToken())
        .finally(() => setChecking(false));
      return;
    }

    setTimeout(() => setChecking(false), 0);
  }, []);

  const handleLogin = (newToken: string) => {
    setToken(newToken);
    connectSocket(newToken);
  };

  const handleLogout = () => {
    setToken(null);
    removeToken();
    disconnectSocket();
  };

  if (checking) {
    return <AppSplash />;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<AppSplash />}>
        <Routes>
          {!token ? (
            <Route path="*" element={<Login onLogin={handleLogin} />} />
          ) : (
            <>
              <Route path="/dashboard" element={<Layout onLogout={handleLogout} />}>
                <Route index element={<HomeDashboard />} />
                <Route path="devices" element={<Devices />} />
                <Route path="computer/:id" element={<ComputerDetail />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="files" element={<FileTransfer />} />
                <Route path="remote" element={<RemoteDesktopPage />} />
                <Route path="terminal" element={<TerminalPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="events" element={<EventLog />} />
                <Route path="alerts" element={<Alerts />} />
                <Route path="scripts" element={<ScriptsPage />} />
                <Route path="quick-actions" element={<QuickActionsLibraryPage />} />
                <Route path="groups" element={<GroupsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="webhooks" element={<WebhooksPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="processes" element={<ProcessesPage />} />
                <Route path="audit" element={<AuditLogPage />} />
                <Route path="schedules" element={<SchedulesPage />} />
                <Route path="backup" element={<BackupPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </>
          )}
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
