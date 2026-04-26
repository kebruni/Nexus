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

## Notes

- The dashboard is proxied to the backend through Vite during development.
- Production client assets are emitted into `client/dist/`.
- Change default secrets and admin credentials before any real deployment.
