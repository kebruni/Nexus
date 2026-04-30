# Nexus Remote Control Hub

Nexus is a three-part remote administration project:

- `client/` - React + Vite dashboard for operators
- `server/` - Express + Socket.IO backend for auth, events, alerts, and routing commands
- `agent/` - desktop agent that runs on remote machines

## Quick start

Install dependencies in each workspace if needed:

```powershell
npm install
npm --prefix client install
npm --prefix server install
npm --prefix agent install
```

Run the backend and dashboard in separate terminals:

```powershell
npm run server
npm run client
```

Optional agent commands:

```powershell
npm run agent
npm run agent:dev
```

## Useful scripts

```powershell
npm run client:lint
npm run client:build
npm run server:start
```

## Building the Windows agent installer

The agent ships as a normal Windows application (Electron + NSIS) that installs
into Program Files (or per-user AppData), creates a Start Menu entry, a desktop
shortcut, and a proper uninstaller.

### Build on Windows (recommended)

```powershell
cd agent
npm ci
npm run build
```

The signed-ready installer lands in `agent/dist-gui/Nexus-Agent-Setup-<version>.exe`
(~80 MB). Double-click to install on Windows 10 or 11 — the app installs like
any normal application, can be uninstalled from the Control Panel, and starts
automatically on user login (you can disable this in `Task Manager → Startup`).

### Build via CI (no Windows machine needed)

The [`Build Agent Installer`](.github/workflows/build-agent-installer.yml)
workflow runs on every push touching `agent/**` and also on every release. It
builds on `windows-latest` and uploads the installer as an artifact. Releases
get the `.exe` attached automatically.

### Configuring the installed agent

After install, the agent reads its server URL in this order:

1. `SERVER_URL` env var
2. `--server=https://...` CLI flag
3. `%APPDATA%\Nexus Agent\config.json` (`{"serverUrl": "..."}`)
4. Built-in default `http://localhost:3000`

Use the **edit** link at the bottom of the agent window to point an installed
agent at a different server without reinstalling.

### Distributing to client PCs

On the dashboard, the **Download Agent** tile (home page) streams the latest
installer from `/api/agent/installer/download`. The server resolves it from
`agent/dist-gui/` automatically — drop the CI artifact there in production.

## Notes

- The dashboard is proxied to the backend through Vite during development.
- Production client assets are emitted into `client/dist/`.
- Change default secrets and admin credentials before any real deployment.
