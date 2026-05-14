# Nexus — установка и запуск (LAN)

Этот документ описывает, как поднять **сервер Nexus** на одном ПК
(или сервере) и подключить к нему **агенты** на других машинах в той же
локальной сети, без выхода в интернет.

В Nexus три компонента:

| Компонент   | Где запускается                | Что делает                                                                      |
|-------------|--------------------------------|----------------------------------------------------------------------------------|
| **server**  | Серверный ПК (один)            | REST + Socket.IO. Хранит сессии, события, алерты, чат, скрипты в SQLite (`.data/nexus.db`). |
| **client**  | Серверный ПК (статика)         | Веб-дашборд, билдится в `client/dist/` и раздаётся самим сервером на `/`.        |
| **agent**   | Каждый клиентский ПК           | Электрон-приложение. Снимает метрики, исполняет команды, стримит экран.          |

Сервер слушает по умолчанию на `0.0.0.0:3000` — он **уже доступен по
LAN-IP**, ничего проксировать через nginx не нужно. Агент при запуске
читает `SERVER_URL` (env / CLI / config-файл) и коннектится к
`http(s)://<server-ip>:3000/agent`.

---

## 1. Подготовка (один раз)

Нужен **Node.js ≥ 20**. На серверном ПК и на клиентских — одинаковая
версия (LTS). Проверь:

```powershell
node -v   # v20.x или выше
npm -v
```

### 1.1 Клонирование и установка зависимостей (на сервере)

```powershell
git clone https://github.com/kebruni/Nexus.git
cd Nexus
npm run install:all
```

`install:all` ставит зависимости в корне, в `server/`, `client/` и
`agent/`. Заодно подтянется Electron (~120 МБ, нужен только если будешь
запускать GUI-агента из исходников).

### 1.2 Сборка дашборда

```powershell
npm run client:build
```

Складывает дашборд в `client/dist/`. Сервер увидит эту папку и будет
раздавать её на `/`.

> Если этот шаг пропустить, на сервере на `/` будет 404 — нужно билдить
> отдельно или запускать `npm run client` (Vite dev) на :5173.

---

## 2. Сетевые настройки серверного ПК

1. Узнай **локальный IP** сервера. На Windows:

   ```powershell
   ipconfig
   ```

   Ищи строку *IPv4-адрес* у того адаптера, через который сервер
   подключён к LAN, например `192.168.1.50`.

2. **Открой порт 3000 в Windows Firewall** (один раз, под админом):

   ```powershell
   New-NetFirewallRule -DisplayName "Nexus Server (3000/tcp)" `
     -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
   ```

   На Linux:

   ```bash
   sudo ufw allow 3000/tcp
   ```

3. Если IP сервера часто меняется — попроси админа сети закрепить
   DHCP-резерв или назначить статический IP. Все агенты будут стучаться
   именно по этому адресу.

---

## 3. Запуск сервера

```powershell
cd Nexus
npm run server:start
```

В терминале появится баннер:

```
============================================================
              PC Control Hub — Server
============================================================
  Listening on:    0.0.0.0:3000
  Dashboard:       http://localhost:3000
  LAN access:
    - http://192.168.1.50:3000    (Ethernet)
  Agents should use one of the LAN URLs above as SERVER_URL.
  Agent NS:        /agent      Dashboard NS: /dashboard
============================================================

[Security]
  [JWT_SECRET]    auto-generated and persisted to .data/secrets.json
  [AGENT_SECRET]  auto-generated and persisted to .data/secrets.json
  [ADMIN_PASSWORD] DEFAULT in use (admin/admin123) — password change
                   will be required on first login
```

Что важно:

- **`LAN access:`** — это то, что должны вписывать клиенты в браузер
  и агенты в `SERVER_URL`.
- **`AGENT_SECRET`** — общий ключ, которым агенты подписывают
  handshake. Скопируй его из файла `.data/secrets.json` — он понадобится
  при настройке каждого агента (см. шаг 4).
- На первом старте логин — `admin / admin123`. Дашборд **сразу** заставит
  сменить пароль — пока не сменишь, токен не даёт доступа ни к одному
  API/сокету (это поведение защищает от подбора дефолтного пароля
  снаружи).

### 3.1 Открыть дашборд

С серверного ПК:    `http://localhost:3000`
С любого LAN-ПК:    `http://192.168.1.50:3000` (тот IP из баннера)

### 3.2 Запуск как сервиса (Windows, опционально)

```powershell
npm install -g pm2 pm2-windows-startup
pm2 start npm --name nexus -- run server:start
pm2 save
pm2-startup install
```

После этого сервер будет подниматься автоматически после перезагрузки.

### 3.3 Где хранятся данные

| Файл                            | Содержимое                                                  |
|---------------------------------|-------------------------------------------------------------|
| `.data/nexus.db`                | events, alerts, chat, scripts, groups, webhooks, schedules (SQLite, WAL) |
| `.data/nexus.db-wal`, `-shm`    | служебные файлы SQLite (write-ahead log + shared memory)    |
| `.data/secrets.json`            | JWT_SECRET, AGENT_SECRET, bcrypt-хэш админ-пароля, TOTP-секреты |
| `.data/store.json.migrated`     | (если был апгрейд с pre-SQLite версии) старый JSON, можно удалить после проверки |

`.data/` имеет права `0700`, файлы внутри `0600` и **не должны**
попадать в git (`.gitignore` уже настроен). Для бэкапа достаточно
скопировать папку `.data/` целиком (либо использовать кнопку
`Settings → Backup → Export` в дашборде — она берёт всё кроме
`secrets.json`).

При первом запуске на установке, обновлённой с pre-SQLite версии,
сервер автоматически импортирует `.data/store.json` в `nexus.db` и
переименовывает старый файл в `.data/store.json.migrated`.

---

## 4. Установка и запуск агента на клиентском ПК

Есть два варианта.

### Вариант A. Установщик `.exe` (рекомендованный для Win 10/11)

1. На сервере открой `http://<server-ip>:3000`, войди в дашборд.
2. На главной странице плитка **«Скачать Агент»** даст ссылку на
   `Nexus-Agent-Setup-x.y.z.exe` (~80 МБ). Если плитка пишет «Не собран»
   — на сервере выполни `npm --prefix agent run build` (нужен Wine
   на Linux или Windows-машина) либо скачай артефакт с
   GitHub Actions → workflow *Build Windows agent installer*.
3. Скопируй `.exe` на клиентский ПК (USB / общая папка / просто
   `http://<server-ip>:3000/api/agent/installer/download`).
4. Запусти установщик — он поставит агент в
   `C:\Program Files\Nexus Agent\`, добавит ярлык в Start Menu и
   автозапуск при логине пользователя.
5. **Первый запуск** агента откроет окно. В подвале есть строка
   `Server: http://localhost:3000  [edit]`. Нажми **edit** и впиши
   `http://<server-ip>:3000` (тот же IP из баннера сервера). Агент
   сохранит настройку в `%APPDATA%\Nexus Agent\config.json` и сам
   переподключится.
6. (Только если включён `AGENT_SECRET`-чек, по умолчанию выключен) —
   также пропиши `AGENT_KEY` через `[edit]` или переменную окружения
   `AGENT_KEY=...`.
7. Через ~5 секунд агент должен появиться в дашборде на странице
   *Devices* со статусом **Online**.

### Вариант B. Запуск из исходников (для разработки / Linux/macOS)

```powershell
git clone https://github.com/kebruni/Nexus.git
cd Nexus
npm --prefix agent install
$env:SERVER_URL = "http://192.168.1.50:3000"   # PowerShell
# либо Linux/macOS:
# export SERVER_URL=http://192.168.1.50:3000
npm run agent:dev      # с GUI (Electron)
# либо
npm run agent          # console-only
```

CLI-флаги тоже работают:

```powershell
node agent/index.js --server=http://192.168.1.50:3000 --agent-key=<key>
```

Резолвинг `SERVER_URL`: env → CLI → `userData/config.json` → дефолт.

### 4.1 Где у агента живёт состояние

- `%APPDATA%\Nexus Agent\config.json` — пользовательский SERVER_URL и
  AGENT_KEY.
- `%APPDATA%\Nexus Agent\.agent-id` — стабильный ID, чтобы один и тот же
  ПК не дублировался в дашборде после переустановки.

---

## 5. Как это всё работает (high-level)

```
┌──────────────────┐     HTTPS / WSS     ┌─────────────────────┐
│  Client ПК       │  Socket.IO /agent   │     Server ПК       │
│  ┌────────────┐  │ ─────────────────▶  │  ┌──────────────┐   │
│  │ Nexus Agent│  │  metrics, cmds,     │  │ server/      │   │
│  │ (Electron) │  │  cmd-results        │  │ index.js     │   │
│  │            │  │ ◀───────────────── │  │ vnc-proxy.js │   │
│  │  vnc.js    │  │  cmds, file ops     │  │ store.js     │   │
│  └────────────┘  │                     │  │ persistence  │   │
│        ↕         │  WebSocket /vnc     │  │ auth         │   │
│  VNC binary WS   │ ═════════════════▶  │  └──────────────┘   │
│  (screen frames) │  binary JPEG frames │                     │
└──────────────────┘  + input events     │  serves /api/...    │
                                         │  serves /socket.io  │
┌──────────────────┐                     │  serves /vnc (WS)   │
│  Браузер админа  │  Socket.IO          │  serves /  (SPA)    │
│  ┌────────────┐  │  /dashboard         │                     │
│  │ React SPA  │  │ ─────────────────▶  │  .data/nexus.db     │
│  │ client/dist│  │  events, agents     │  .data/secrets.json │
│  │            │  │                     │                     │
│  │ VNC viewer │  │  WebSocket /vnc     │                     │
│  │ (binary)   │  │ ═════════════════▶  │                     │
│  └────────────┘  │  screen frames      │                     │
└──────────────────┘  + input events     └─────────────────────┘
```

**Два канала связи** (обновлено):

- **Socket.IO** — управление, метрики, события, чат, файлы.
- **VNC WebSocket (`/vnc`)** — выделенный бинарный канал для стриминга
  экрана. Фреймы передаются как сырые JPEG-байты (без base64), что
  сокращает трафик на ~33% и снижает CPU-нагрузку. Мышь и клавиатура
  тоже передаются через этот канал бинарными сообщениями.

Поток данных:

1. **Агент** подключается к `<server>/agent` через Socket.IO. Sеnд'ит
   handshake `{ agentKey, agentId, hostname, platform, osVersion, ... }`
   и каждые 3 сек метрики (CPU, RAM, диск, сеть, GPU).
   Параллельно агент открывает VNC WebSocket к `<server>/vnc` для
   бинарного стриминга экрана.
2. **Сервер** валидирует `agentKey` (`agentAuthMiddleware`),
   сохраняет агента в in-memory map, складывает событие
   `agent_connected` в `store` и пушит его в namespace `/dashboard`.
3. **Дашборд** (React SPA) после логина (`POST /api/auth/login` →
   JWT) подключается к `<server>/dashboard` с этим JWT. Слушает
   `agent:list`, `agent:metrics`, `event:new`, `chat:message`.
4. Когда админ кликает «Run script» / «Reboot» / «Open file», сервер
   находит сокет нужного агента (по `agentId`) и эмитит
   `cmd:execute` / `file:list` / etc. Агент выполняет и шлёт обратно
   результат, который сервер форвардит в дашборд.
5. Все мутирующие операции (новый event, alert, chat-сообщение,
   сохранение скрипта) пишутся напрямую в SQLite (`.data/nexus.db`,
   WAL-режим) через prepared statements в `server/store.js`. Индексы
   стоят на `type`, `agent_id`, `actor`, `timestamp` — фильтры
   audit-страницы за O(log n).
6. На `SIGINT`/`SIGTERM` сервер закрывает HTTP-сервер; SQLite WAL уже
   на диске, дополнительного flush не требуется.

### 5.1 Безопасность

- `JWT_SECRET` и `AGENT_SECRET`: env > `.data/secrets.json` (автогенерация
  при первом старте) > weak-default detection (старые литералы заменяются).
- Админ-пароль bcrypt-хэшируется, хранится в `secrets.json`. На первом
  логине дефолтным `admin123` сервер ставит JWT-claim
  `mustChangePassword: true`. `authMiddleware` блокирует все эндпоинты
  кроме `/api/auth/change-password|verify|logout`, пока claim не
  очистится (для этого нужно сменить пароль и перелогиниться).
- Rate-limit на `/api/auth/login`: 5 попыток за 15 минут с одного IP.

---

## 6. Типичные проблемы

| Симптом                                              | Причина / лечение                                                                              |
|------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| `ERR_CONNECTION_REFUSED` при заходе на `http://<ip>:3000` с другого ПК | Не открыт порт в фаерволе сервера. См. шаг 2.2.                                                |
| Дашборд открывается, но `/devices` пустой            | Агент не подключился. На клиенте: проверь `SERVER_URL`, попробуй с того же ПК `curl http://<ip>:3000/api/health`. |
| Сервер логает `[Agent Connection Refused] invalid agent key` | На клиенте `AGENT_KEY` не совпадает с `secrets.json` сервера.                                  |
| Логин циклится через форму смены пароля              | В localStorage браузера остался токен с `mustChangePassword:true`. Открой DevTools → Application → Local Storage → удалить `pc-hub-token`, перелогинься. |
| После рестарта сервер потерял chat / alerts          | Файл `.data/nexus.db` не записался. Проверь права на папку `.data/` (должна быть доступна на запись пользователю, под которым запущен node). |
| `[WARN] robot-js not available` в логе агента        | Это нормально на Linux-агенте: remote-input через robot-js работает только на Windows. Все остальные функции (метрики, screen-stream, file ops, terminal) работают.|

---

## 7. Production-чеклист

- [ ] Прописать `JWT_SECRET` и `ADMIN_PASSWORD` через переменные
      окружения (env). Дефолтные автогенерации хороши для стенда, но
      для прод-машины лучше иметь явный source-of-truth в env.
- [ ] Сменить дефолтный `admin/admin123` через UI после первого
      запуска.
- [ ] Поднять сервер за nginx/caddy с TLS, если дашборд должен быть
      доступен снаружи LAN. Внутри LAN HTTP по IP — нормально.
- [ ] Настроить `pm2` или systemd-юнит, чтобы сервер автостартовал.
- [ ] Регулярный бэкап папки `.data/`.
- [ ] Если планируется массовое развёртывание агентов — собрать
      `.exe` через CI (`.github/workflows/build-agent-installer.yml`),
      разложить через GPO / SCCM / Intune. `SERVER_URL` можно прописать
      сразу через `--server=...` аргумент в ярлыке или подложить
      `config.json` в `%APPDATA%\Nexus Agent\` через скрипт логина.
