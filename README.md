# Nexus Remote Control Hub

Remote administration platform for Windows PCs — live at **[nexus.kebruni.me](https://nexus.kebruni.me)**.

Three-part system: React dashboard, Express + Socket.IO backend, Electron agent for Windows.

---

## Features

- **Device management** — real-time list of connected agents, hostname, OS, CPU, RAM, GPU, IP, group assignment, tags
- **Remote desktop (VNC)** — live screen streaming via WebSocket, cursor tracking, multi-monitor support, adjustable FPS/quality
- **File manager** — browse, upload, download, rename, delete files on remote machines
- **Terminal** — execute shell commands on remote Windows hosts
- **Process manager** — view and kill running processes
- **Services** — list and control Windows services (start/stop/restart)
- **Chat** — bidirectional chat with agent machines
- **Alerts & notifications** — CPU/RAM/disk threshold rules with duration windows, severity levels, acknowledge flow
- **Webhooks** — fan-out alerts to **Telegram**, Discord, Slack, or generic HTTP endpoints with severity/agent filters
- **Push notifications** — browser Web Push (VAPID) for real-time alerts without keeping the tab focused
- **Schedules** — cron-based command dispatch to single agents or groups
- **Scripts library** — save and re-run multi-line scripts across machines
- **Quick actions** — OS-targeted one-click commands (flush DNS, restart Explorer, etc.)
- **Groups** — organize devices with color-coded groups, bulk commands
- **Audit log** — searchable event trail (logins, commands, alerts, config changes)
- **Backup** — encrypted gzip JSON export/restore of all persistent state
- **Multi-user** — RBAC (viewer / operator / admin), 2FA (TOTP + recovery codes), per-IP and per-username login lockout
- **Agent tokens** — admin-issued per-agent tokens (`nxa_*`) or CI-baked JWT tokens, revocable
- **Installer distribution** — dashboard serves the Windows `.exe` installer directly

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Dashboard | React 19, Vite, TypeScript, Tailwind CSS v4, Recharts, Socket.IO client |
| Backend | Node.js, Express 5, Socket.IO 4, SQLite (better-sqlite3), Redis |
| Agent | Electron, Node.js, native Windows APIs |
| Auth | JWT (HS256, 24h), bcrypt, TOTP 2FA (otplib), per-agent tokens |
| Notifications | Telegram Bot API, Discord/Slack webhooks, Web Push (VAPID) |
| Proxy | Nginx (HTTPS, WebSocket upgrade for Socket.IO + VNC) |
| TLS | Let's Encrypt via certbot (auto-renew) |
| CI/CD | GitHub Actions (Windows agent installer build) |

---

## Architecture

```
┌──────────────┐     Socket.IO      ┌──────────────┐     WebSocket      ┌──────────────┐
│  Dashboard   │◄──────────────────►│   Server     │◄──────────────────►│   Agent      │
│  (React)     │    /dashboard NS   │  (Express)   │    /agent NS       │  (Electron)  │
│              │                    │              │                    │  Windows PC  │
│  Browser     │  REST /api/*       │  SQLite DB   │  VNC proxy (ws)    │              │
│  Push (VAPID)│◄──────────────────►│  Redis cache │                    │  Screen cap  │
└──────────────┘                    └──────────────┘                    └──────────────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │  Nginx (TLS) │
                                    │  443 → 3000  │
                                    └──────────────┘
```

---

## Quick start (local dev)

```bash
npm run setup           # install deps: root + server + client + agent
npm run backend         # Express + Socket.IO on :3000
npm run client          # Vite dev server on :5173 (proxies /api → :3000)
```

Open `http://localhost:5173`. Default login: `admin / admin123` (prompts password change on first login).

> Agent `.exe` build requires Windows (electron-builder). Use CI for non-Windows dev.

---

## Project structure

```
server/               # Express + Socket.IO backend
├── index.js          # Entry point, wiring
├── auth.js           # JWT, RBAC, 2FA, agent tokens
├── store.js          # SQLite data store (events, alerts, scripts, webhooks, schedules)
├── notifier.js       # Webhook fan-out (Telegram, Discord, Slack, generic)
├── pushSender.js     # Web Push (VAPID) notifications
├── vnc-proxy.js      # WebSocket VNC screen streaming proxy
├── scheduler.js      # Cron-based command dispatch
├── routes/           # REST API (auth, agents, alerts, webhooks, scripts, schedules, backup, push, users, groups)
├── sockets/          # Socket.IO handlers (agent + dashboard namespaces)
└── lib/              # Orchestration, local FS helpers

client/               # React + Vite dashboard
├── src/
│   ├── components/   # Pages (Devices, RemoteDesktop, FileManager, Terminal, Alerts, Settings, etc.)
│   ├── api/          # Typed API clients (push, auth)
│   ├── contexts/     # Language, theme, toast, auth
│   ├── i18n/         # Translations (en, ru, kz)
│   └── hooks/        # Socket.IO, agents, alerts
└── public/           # Service worker, icons, manifest

agent/                # Electron agent for Windows
├── src/              # Main + renderer processes
├── scripts/          # Installer defaults (JWT baking)
└── electron-builder.yml

deploy/               # systemd unit + nginx/Caddy config
```

---

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/verify` | Verify token |
| GET | `/api/agents` | List connected agents |
| GET | `/api/alerts` | List triggered alerts |
| GET | `/api/alert-rules` | List alert rules |
| GET | `/api/webhooks` | List notification channels |
| POST | `/api/webhooks/:id/test` | Test a webhook channel |
| GET | `/api/schedules` | List scheduled commands |
| GET | `/api/scripts` | List saved scripts |
| GET | `/api/quick-actions` | List quick actions |
| GET | `/api/groups` | List device groups |
| GET | `/api/events` | Event log (paginated, filterable) |
| GET | `/api/audit` | Audit log (admin) |
| GET | `/api/users` | User list (admin) |
| POST | `/api/backup/export` | Export encrypted backup |
| GET | `/api/health` | Public health check |

Socket.IO namespaces: `/agent` (agent connections), `/dashboard` (operator UI).

---

## Agent installation

1. Download `Nexus-Agent-Setup-*.exe` from the dashboard home page
2. Run the installer on a Windows 10/11 machine
3. The agent auto-connects to the server URL baked into the installer

Agent server URL resolution order: `SERVER_URL` env → `--server=` CLI flag → `%APPDATA%\Nexus Agent\config.json` → built-in default.

---

## License

ISC
