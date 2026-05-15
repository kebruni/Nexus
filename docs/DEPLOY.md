# Production-deploy Nexus on Debian 12 (`nexus.kebruni.me`)

Цель этой инструкции — поднять Nexus на VPS под Debian 12 так, чтобы:

- бэк работал как `systemd`-сервис и поднимался после перезагрузки;
- бэк слушал **только loopback** (`127.0.0.1:3000`), а наружу торчал
  Caddy с автоматическим Let's Encrypt;
- сертификат для `nexus.kebruni.me` обновлялся сам;
- свеже-собранный из CI `.exe`-агент сразу подключался к
  `https://nexus.kebruni.me` без ручной настройки `[edit]`.

Для удобства все файлы конфигов лежат в [`deploy/`](../deploy/), их
можно просто `cp` на хост.

---

## 0. Что должно быть до начала

- VPS с публичным IPv4, чистой Debian 12, доступ по SSH под root (или
  другим пользователем с sudo).
- A-запись `nexus.kebruni.me` → этот публичный IPv4.
  Проверка: `dig +short nexus.kebruni.me` на любой машине вернёт IP VPS.
- Порты 80 и 443 открыты к Интернету (нужны для ACME-challenge и для
  самого сервиса соответственно). Порт 3000 наружу открывать НЕ надо —
  бэк слушает только loopback.

---

## 1. Базовая подготовка VPS

```bash
# Под root или sudo:
apt update && apt -y upgrade
apt -y install curl ca-certificates git ufw

# UFW — открываем только SSH + Caddy.
ufw allow OpenSSH
ufw allow 80/tcp     comment 'Caddy / ACME-HTTP-01'
ufw allow 443/tcp    comment 'Caddy / HTTPS'
ufw --force enable
```

Создаём системного пользователя под Nexus (бэк не должен бегать от
root):

```bash
useradd --system --create-home --home-dir /home/nexus --shell /usr/sbin/nologin nexus
```

---

## 2. Node.js 22

Используем официальный NodeSource репозиторий (Debian 12 в репах
поставляется со старым Node, который Nexus не поддерживает):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs
node --version   # должно быть v22.x
npm --version
```

---

## 3. Код проекта в /opt/nexus

```bash
mkdir -p /opt/nexus
chown nexus:nexus /opt/nexus
sudo -u nexus -H bash -lc '
  cd /opt/nexus &&
  git clone https://github.com/kebruni/Nexus.git . &&
  npm run setup &&
  npm --prefix client run build
'
```

Что произошло:

- `npm run setup` поставил зависимости в root + server + client + agent.
- `client run build` сложил собранный SPA в `client/dist/`. Сервер сам
  его раздаст (см. `server/index.js`, статика подхватывается из
  `client/dist/`).

> **Агент `.exe` на Linux собирать не надо** — `electron-builder` для
> Windows-таргета требует Windows. `.exe` строится в GitHub Actions
> (workflow *Build Agent Installer (Windows)*). CI больше **не требует**
> `NEXUS_JWT_SECRET` — .exe собирается без вшитого агентского JWT.
> Свежий JWT раздаёт сам сервер через эндпоинт
> `/api/agent/installer/bundle` — см. п.7.

---

## 4. Первый запуск, чтобы создать `.data/secrets.json`

Запускаем сервер вручную один раз, чтобы он сгенерировал `JWT_SECRET`,
`AGENT_SECRET` и хеш дефолтного пароля админа:

```bash
sudo -u nexus -H bash -lc 'cd /opt/nexus && HOST=127.0.0.1 node server/index.js'
```

В выводе появится баннер:

```
[Security]
  [JWT_SECRET]    auto-generated and persisted to .data/secrets.json
  [AGENT_SECRET]  auto-generated and persisted to .data/secrets.json
  [ADMIN_PASSWORD] DEFAULT in use (admin/admin123) — password change
                   will be required on first login
```

Останови процесс (`Ctrl-C`) — `secrets.json` теперь на месте.

```bash
ls -la /opt/nexus/.data/
# должны увидеть secrets.json (0600) и пустой nexus.db (или почти пустой)
```

---

## 5. systemd-юнит

Кладём готовый юнит из репо:

```bash
cp /opt/nexus/deploy/nexus-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now nexus-server
systemctl status nexus-server --no-pager
```

Проверка:

```bash
curl -fsS http://127.0.0.1:3000/api/health 2>&1 | head -5
# должен прийти JSON, например {"ok":true,...}

journalctl -u nexus-server -f
# смотрим живой лог; Ctrl-C — выйти
```

Если что-то не так — `systemctl status nexus-server -l` и
`journalctl -u nexus-server -n 200` покажут причину.

---

## 6. Caddy + автоматический TLS

```bash
apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key'    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt -y install caddy

cp /opt/nexus/deploy/Caddyfile /etc/caddy/Caddyfile
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
systemctl reload caddy
journalctl -u caddy -f
```

При первом старте Caddy постучится в Let's Encrypt по ACME-HTTP-01 —
для этого и нужен открытый :80. В логе увидишь что-то вроде
`certificate obtained successfully`. Через 5-15 секунд:

```bash
curl -I https://nexus.kebruni.me
# HTTP/2 200 ...
```

Открой `https://nexus.kebruni.me` в браузере — должен открыться дашборд
Nexus. Логин по умолчанию `admin / admin123`, сразу попросит сменить
пароль.

---

## 7. Сборка `.exe`-агента и выдача свежего JWT с хоста

`JWT_SECRET` теперь никогда не покидает VPS. CI собирает "пустой" `.exe`
без вшитого агентского токена — в `installerDefaults.json` попадает
только `serverUrl`. Агентский JWT подписывается сервером
локальным `JWT_SECRET` в момент скачивания.

### 7.1 Положить свежесобранный .exe на сервер

После успешного workflow *Build Agent Installer (Windows)*
скачай артефакт `Nexus-Agent-Setup-windows-x64` (файл
`Nexus-Agent-Setup-*.exe`) и положи его в
`/opt/nexus/agent/dist-gui/`:

```bash
# на VPS
sudo -u nexus -H mkdir -p /opt/nexus/agent/dist-gui
sudo -u nexus -H cp ~/Downloads/Nexus-Agent-Setup-1.1.0.exe \
  /opt/nexus/agent/dist-gui/
```

Никакого `NEXUS_JWT_SECRET` в GitHub Actions secrets больше не надо.

### 7.2 Как это работает

1. Админ логинится в дашборд на `https://nexus.kebruni.me`.
2. Бьёт *Download Agent* на главной странице (или на *Devices*).
3. Дашборд ходит на `GET /api/agent/installer/bundle` с Bearer-токеном
   admin'а. Сервер:
   - подписывает свежий агентский JWT локальным `JWT_SECRET`,
   - пакует в ZIP `Nexus-Agent-Setup.exe` + `install.cmd` + `README.txt`,
   - отдаёт ZIP скачивающему.
4. Оператор распаковывает ZIP на Windows-машине и запускает
   `install.cmd`. Скрипт:
   - пишет `%APPDATA%\Nexus Agent\config.json` с `serverUrl` + `agentKey`,
   - запускает обычный мастер установки `Nexus-Agent-Setup.exe`.
5. Агент стартует, читает конфиг, подключается на `https://nexus.kebruni.me`
   со своим JWT — моментально Online на странице *Devices*.

### 7.3 Ротация секретов

- Ротация `JWT_SECRET` инвалидирует **все ранее выданные JWT-токены**,
  и все существующие агенты перестанут авторизовываться. Нужно
  переиздать bundle (скачать заново *Download Agent* и прогнать
  `install.cmd` на каждой машине или выдать персональные `nxa_*`
  токены через *Settings → Agent Tokens*).

> **Никогда не коммить и не публикуй в issue/discussion значение
> `JWT_SECRET` или `install.cmd` из bundle'а** — любой, кто их увидит,
> сможет подписать/разыграть агент-токен, который сервер примет. Это
> секрет уровня "ключ от царства".

---

## 8. Обновление кода на хосте

```bash
sudo -u nexus -H bash -lc '
  cd /opt/nexus &&
  git pull --ff-only &&
  npm run setup &&
  npm --prefix client run build
'
systemctl restart nexus-server
```

`systemd` сам подождёт пока процесс остановится, и поднимет новый.
Дашборд кратко вернёт 502 (~2 сек) — это норма.

---

## 9. Бэкап

Всё состояние Nexus лежит в одном месте:

```
/opt/nexus/.data/
├── nexus.db              ← SQLite БД (events, alerts, scripts, chat, ...)
├── nexus.db-wal          ← журнал SQLite
├── nexus.db-shm          ← shared-memory SQLite
└── secrets.json          ← JWT/AGENT_SECRET + bcrypt-хеш пароля + TOTP
```

Простой бэкап через systemd-timer (раз в сутки в 03:00):

```bash
cat > /etc/systemd/system/nexus-backup.service <<'EOF'
[Unit]
Description=Nexus daily backup

[Service]
Type=oneshot
User=nexus
ExecStart=/bin/bash -c 'mkdir -p /home/nexus/backups && tar czf /home/nexus/backups/nexus-$(date +%%Y%%m%%d-%%H%%M%%S).tgz -C /opt/nexus .data && find /home/nexus/backups -mtime +14 -delete'
EOF

cat > /etc/systemd/system/nexus-backup.timer <<'EOF'
[Unit]
Description=Daily Nexus backup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now nexus-backup.timer
systemctl list-timers nexus-backup.timer --no-pager
```

Хранит 14 последних архивов в `~nexus/backups/`. Откатиться — остановить
сервис, распаковать архив поверх `.data/`, запустить обратно.

---

## 10. Чеклист после деплоя

- [ ] `https://nexus.kebruni.me` открывается в браузере, сертификат
  валидный (зелёный замок).
- [ ] `systemctl is-active nexus-server` → `active`.
- [ ] `systemctl is-active caddy` → `active`.
- [ ] `journalctl -u nexus-server -n 50` — нет красных строк.
- [ ] В дашборде сразу попросило сменить дефолтный пароль `admin/admin123`.
- [ ] В GitHub Actions secrets **не должно** быть `NEXUS_JWT_SECRET`
  (опциональный `NEXUS_DEFAULT_SERVER_URL` может оставаться).
- [ ] Свеже-собранный из CI `.exe` лежит в `/opt/nexus/agent/dist-gui/`.
- [ ] Баннер *Download Agent* показывает "Installer ready" + версию.
- [ ] Клик по *Download Agent* качает ZIP, в нём есть
  `Nexus-Agent-Setup.exe`, `install.cmd`, `README.txt`.
- [ ] На тестовой Windows-машине запуск `install.cmd` ставит агент и он
  появляется на *Devices* со статусом Online.
- [ ] `systemctl list-timers nexus-backup.timer` — таймер заряжен.

---

## 11. Траблшутинг

| Симптом | Что проверить |
|---|---|
| `curl https://nexus.kebruni.me` → SSL-ошибка | `dig +short nexus.kebruni.me` действительно ли указывает на этот VPS; `journalctl -u caddy -f` — что говорит ACME |
| `bad gateway 502` | `systemctl status nexus-server`, `curl http://127.0.0.1:3000/api/health` |
| Агент `.exe` показывает `http://localhost:3000` | Версия `.exe` собрана из старого коммита. Пересобери workflow *Build Agent Installer (Windows)*, положи свежий артефакт в `/opt/nexus/agent/dist-gui/`, скачай заново bundle через *Download Agent* |
| Агент подключается, но сервер пишет `[AGENT] auth failed` | `JWT_SECRET` в `/opt/nexus/.data/secrets.json` ротировался (или был вручную заменён) и не совпадает с JWT в `%APPDATA%\Nexus Agent\config.json`. Переиздай bundle через *Download Agent* и перезапусти `install.cmd` |
| `Download Agent` в дашборде пишет `HTTP 403` / `HTTP 401` | Текущий пользователь не имеет роли admin (или сессия просрочилась). Зайди admin'ом, или повысь роль в *Settings → Users* |
| `npm run setup` падает на `better-sqlite3` | Не хватает `build-essential` для native-модуля: `apt -y install build-essential python3` и повтори |
