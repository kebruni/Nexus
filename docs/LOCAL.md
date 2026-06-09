# Nexus — локальный запуск в Windows

Краткая инструкция, как поднять проект на своей машине для разработки.

## Что нужно заранее

- Windows 10/11.
- Node.js 20 или новее.
- Git.

Проверка:

```powershell
node -v
npm -v
```

## 1. Установка зависимостей

Из корня репозитория:

```powershell
cd D:\Nexus\Nexus
npm run setup
```

Эта команда ставит зависимости для корня, `server/`, `client/` и `agent/`.

## 2. Запуск backend

В отдельном терминале:

```powershell
cd D:\Nexus\Nexus
npm run backend
```

После старта сервер слушает `http://localhost:3000`.

## 3. Запуск сайта

В другом терминале:

```powershell
cd D:\Nexus\Nexus
npm run client
```

Vite поднимет сайт на `http://localhost:5173`.

## 4. Запуск агента

Для локальной разработки агент лучше запускать с явным адресом backend и отдельным профилем Electron:

```powershell
cd D:\Nexus\Nexus
npm --prefix agent run start -- --server=http://localhost:3000 --user-data-dir="D:\Nexus\Nexus\.data\agent-profile"
```

Если нужен GUI-режим из исходников, можно попробовать:

```powershell
npm run agent:dev
```

Но для локальной проверки обычно достаточно консольного запуска выше.

## 5. Быстрый сценарий

Если нужно запустить всё вручную, открой три терминала и выполни:

1. `npm run backend`
2. `npm run client`
3. `npm --prefix agent run start -- --server=http://localhost:3000 --user-data-dir="D:\Nexus\Nexus\.data\agent-profile"`

## 6. Что проверить, если не стартует

- Если backend не запускается, сначала выполни `npm run setup`.
- Если агент подключается не к локальному серверу, проверь флаг `--server`.
- Если Electron завершается сразу, используй отдельный `--user-data-dir` как в примере выше.

## 7. Полезные ссылки

- [Установка и запуск в LAN](SETUP.md)
- [Production deploy](DEPLOY.md)
