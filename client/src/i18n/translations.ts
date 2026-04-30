export type Language = 'en' | 'ru' | 'kz';

export const translations = {
  // ── Sidebar / Navigation ──
  'nav.main': { en: 'Main', ru: 'Главное', kz: 'Басты' },
  'nav.dashboard': { en: 'Dashboard', ru: 'Панель', kz: 'Панель' },
  'nav.tools': { en: 'Tools', ru: 'Инструменты', kz: 'Құралдар' },
  'nav.devices': { en: 'Devices', ru: 'Устройства', kz: 'Құрылғылар' },
  'nav.fileExplorer': { en: 'File Explorer', ru: 'Файлы', kz: 'Файлдар' },
  'nav.terminal': { en: 'Terminal', ru: 'Терминал', kz: 'Терминал' },
  'nav.remoteDesktop': { en: 'Remote Desktop', ru: 'Удалённый стол', kz: 'Қашықтағы жұмыс үстелі' },
  'nav.sftp': { en: 'SFTP', ru: 'SFTP', kz: 'SFTP' },
  'nav.chat': { en: 'Chat', ru: 'Чат', kz: 'Чат' },
  'nav.insights': { en: 'Insights', ru: 'Аналитика', kz: 'Аналитика' },
  'nav.events': { en: 'Events', ru: 'События', kz: 'Оқиғалар' },
  'nav.alerts': { en: 'Alerts', ru: 'Уведомления', kz: 'Хабарламалар' },
  'nav.disconnect': { en: 'Disconnect', ru: 'Отключиться', kz: 'Ажырату' },
  'nav.remoteAccess': { en: 'Remote Access', ru: 'Удалённый доступ', kz: 'Қашықтан қол жеткізу' },
  'nav.analytics': { en: 'Analytics', ru: 'Аналитика', kz: 'Аналитика' },
  'nav.computerDetails': { en: 'Computer Details', ru: 'Детали компьютера', kz: 'Компьютер мәліметтері' },

  // ── Header / Settings ──
  'settings.language': { en: 'Language', ru: 'Язык', kz: 'Тіл' },
  'settings.theme': { en: 'Theme', ru: 'Тема', kz: 'Тақырып' },
  'settings.dark': { en: 'Dark', ru: 'Тёмная', kz: 'Қараңғы' },
  'settings.light': { en: 'Light', ru: 'Светлая', kz: 'Жарық' },

  // ── HomeDashboard ──
  'home.title': { en: 'Dashboard', ru: 'Панель управления', kz: 'Басқару панелі' },
  'home.subtitle': { en: 'Overview of your remote network', ru: 'Обзор удалённой сети', kz: 'Қашықтағы желіге шолу' },
  'home.totalDevices': { en: 'Total Devices', ru: 'Всего устройств', kz: 'Барлық құрылғылар' },
  'home.onlineNow': { en: 'Online Now', ru: 'Онлайн', kz: 'Онлайн' },
  'home.activeAlerts': { en: 'Active Alerts', ru: 'Активные уведомления', kz: 'Белсенді хабарламалар' },
  'home.manageDevices': { en: 'Manage Devices', ru: 'Управление устройствами', kz: 'Құрылғыларды басқару' },
  'home.manageDesc': { en: 'View, connect, and control all your registered computers from the Devices panel.', ru: 'Просматривайте, подключайтесь и управляйте всеми зарегистрированными компьютерами.', kz: 'Барлық тіркелген компьютерлерді қарау, қосылу және басқару.' },
  'home.goToDevices': { en: 'Go to Devices', ru: 'К устройствам', kz: 'Құрылғыларға өту' },
  'home.downloadAgent': { en: 'Download Agent', ru: 'Скачать Агент', kz: 'Агентті жүктеу' },
  'home.downloadAgentDesc': {
    en: 'Click to download the Windows installer. Run it on the target PC like any normal application.',
    ru: 'Нажмите, чтобы скачать установщик для Windows. Запустите его на целевом ПК как обычное приложение.',
    kz: 'Windows үшін орнатушыны жүктеу үшін басыңыз. Оны кәдімгі қолданба сияқты мақсатты ДК-де іске қосыңыз.',
  },
  'home.downloadAgentCta': { en: 'Download installer', ru: 'Скачать установщик', kz: 'Орнатушыны жүктеу' },
  'home.downloadAgentUnavailable': {
    en: 'Installer not built yet. Build the agent on a Windows machine, then it will be available here.',
    ru: 'Установщик ещё не собран. Соберите агент на Windows-машине — он появится здесь автоматически.',
    kz: 'Орнатушы әлі жасалмаған. Windows құрылғысында агентті құрастырыңыз — ол осында автоматты түрде пайда болады.',
  },
  'home.downloadAgentBuildHint': { en: 'See README to build', ru: 'См. README для сборки', kz: 'Құрастыру үшін README-ді қараңыз' },
  'home.recentActivity': { en: 'Recent Activity', ru: 'Последние действия', kz: 'Соңғы әрекеттер' },
  'home.viewAll': { en: 'View all', ru: 'Смотреть все', kz: 'Барлығын көру' },
  'home.noActivity': { en: 'No recent activity', ru: 'Нет недавних действий', kz: 'Соңғы әрекеттер жоқ' },

  // ── Devices ──
  'devices.title': { en: 'Devices', ru: 'Устройства', kz: 'Құрылғылар' },
  'devices.connected': { en: 'connected to network', ru: 'подключено к сети', kz: 'желіге қосылған' },
  'devices.noDevices': { en: 'No devices found', ru: 'Устройства не найдены', kz: 'Құрылғылар табылмады' },
  'devices.startAgent': { en: 'Start the agent on a remote machine', ru: 'Запустите агент на удалённом компьютере', kz: 'Қашықтағы компьютерде агентті іске қосыңыз' },
  'devices.ready': { en: 'Ready', ru: 'Готово', kz: 'Дайын' },
  'devices.offline': { en: 'Offline', ru: 'Не в сети', kz: 'Офлайн' },

  // ── File Explorer ──
  'files.title': { en: 'File Manager', ru: 'Файловый менеджер', kz: 'Файл менеджері' },
  'files.devicesAvailable': { en: 'devices available', ru: 'устройств доступно', kz: 'құрылғы қол жетімді' },
  'files.selectDevice': { en: 'Select a device', ru: 'Выберите устройство', kz: 'Құрылғыны таңдаңыз' },
  'files.noDevicesOnline': { en: 'No devices online', ru: 'Нет устройств онлайн', kz: 'Онлайн құрылғылар жоқ' },
  'files.selectToView': { en: 'Select a device to view files', ru: 'Выберите устройство для просмотра файлов', kz: 'Файлдарды көру үшін құрылғыны таңдаңыз' },
  'files.availableInDropdown': { en: 'All online devices are available in the dropdown', ru: 'Все онлайн устройства доступны в выпадающем списке', kz: 'Барлық онлайн құрылғылар тізімде қол жетімді' },

  // ── Terminal ──
  'terminal.title': { en: 'Terminal', ru: 'Терминал', kz: 'Терминал' },
  'terminal.remoteTerminal': { en: 'Remote Terminal', ru: 'Удалённый терминал', kz: 'Қашықтағы терминал' },
  'terminal.executing': { en: 'executing...', ru: 'выполняется...', kz: 'орындалуда...' },
  'terminal.clear': { en: 'Clear', ru: 'Очистить', kz: 'Тазалау' },
  'terminal.typeCommand': { en: 'Type a command...', ru: 'Введите команду...', kz: 'Команда теріңіз...' },
  'terminal.selectDevice': { en: 'Select a device to connect', ru: 'Выберите устройство для подключения', kz: 'Қосылу үшін құрылғыны таңдаңыз' },

  // ── Remote Desktop ──
  'remote.title': { en: 'Remote Desktop', ru: 'Удалённый рабочий стол', kz: 'Қашықтағы жұмыс үстелі' },
  'remote.viewer': { en: 'Remote Desktop Viewer', ru: 'Просмотр удалённого стола', kz: 'Қашықтағы жұмыс үстелін көру' },
  'remote.clickStart': { en: 'Click "Start" to begin screen streaming', ru: 'Нажмите "Старт" для начала трансляции', kz: 'Трансляцияны бастау үшін "Бастау" басыңыз' },
  'remote.startStreaming': { en: 'Start Streaming', ru: 'Начать трансляцию', kz: 'Трансляцияны бастау' },
  'remote.start': { en: 'Start', ru: 'Старт', kz: 'Бастау' },
  'remote.stop': { en: 'Stop', ru: 'Стоп', kz: 'Тоқтату' },
  'remote.inputOn': { en: 'Input ON', ru: 'Ввод ВКЛ', kz: 'Енгізу ҚОСУЛЫ' },
  'remote.inputOff': { en: 'Input OFF', ru: 'Ввод ВЫКЛ', kz: 'Енгізу ӨШІРУЛІ' },
  'remote.clipboard': { en: 'Clipboard', ru: 'Буфер обмена', kz: 'Алмасу буфері' },
  'remote.clipboardSync': { en: 'Clipboard Sync', ru: 'Синхронизация буфера', kz: 'Буфер синхрондау' },
  'remote.getRemote': { en: 'Get Remote', ru: 'Получить', kz: 'Алу' },
  'remote.sendToRemote': { en: 'Send to Remote', ru: 'Отправить', kz: 'Жіберу' },
  'remote.copyLocal': { en: 'Copy Local', ru: 'Копировать локально', kz: 'Жергілікті көшіру' },
  'remote.selectDevice': { en: 'Select a device to connect', ru: 'Выберите устройство для подключения', kz: 'Қосылу үшін құрылғыны таңдаңыз' },

  // ── SFTP ──
  'sftp.title': { en: 'SFTP File Transfer', ru: 'SFTP Передача файлов', kz: 'SFTP Файл тасымалдау' },

  // ── Chat ──
  'chat.title': { en: 'Chat', ru: 'Чат', kz: 'Чат' },
  'chat.selectDevice': { en: 'Select a device to chat', ru: 'Выберите устройство для чата', kz: 'Чат үшін құрылғыны таңдаңыз' },
  'chat.chatWith': { en: 'Chat with', ru: 'Чат с', kz: 'Чат:' },
  'chat.messages': { en: 'messages', ru: 'сообщений', kz: 'хабарлама' },
  'chat.loading': { en: 'Loading messages...', ru: 'Загрузка сообщений...', kz: 'Хабарламалар жүктелуде...' },
  'chat.noMessages': { en: 'No messages yet', ru: 'Нет сообщений', kz: 'Хабарламалар жоқ' },
  'chat.startConvo': { en: 'Start a conversation with the remote computer', ru: 'Начните разговор с удалённым компьютером', kz: 'Қашықтағы компьютермен сөйлесуді бастаңыз' },
  'chat.typeMessage': { en: 'Type a message...', ru: 'Введите сообщение...', kz: 'Хабарлама теріңіз...' },

  // ── Events ──
  'events.title': { en: 'Event Log', ru: 'Журнал событий', kz: 'Оқиғалар журналы' },
  'events.subtitle': { en: 'System events and admin actions journal', ru: 'Журнал системных событий и действий админа', kz: 'Жүйелік оқиғалар мен әкімші әрекеттерінің журналы' },
  'events.refresh': { en: 'Refresh', ru: 'Обновить', kz: 'Жаңарту' },
  'events.filter': { en: 'Filter events...', ru: 'Фильтр событий...', kz: 'Оқиғаларды сүзу...' },
  'events.noEvents': { en: 'No events found', ru: 'Событий не найдено', kz: 'Оқиғалар табылмады' },
  'events.timestamp': { en: 'Timestamp', ru: 'Время', kz: 'Уақыт' },
  'events.type': { en: 'Type', ru: 'Тип', kz: 'Түрі' },
  'events.message': { en: 'Message', ru: 'Сообщение', kz: 'Хабарлама' },
  'events.count': { en: 'events', ru: 'событий', kz: 'оқиға' },

  // ── Alerts ──
  'alerts.title': { en: 'Alert Rules', ru: 'Правила уведомлений', kz: 'Хабарлама ережелері' },
  'alerts.subtitle': { en: 'Manage monitoring rules and alerts', ru: 'Управление правилами мониторинга', kz: 'Мониторинг ережелерін басқару' },
  'alerts.createRule': { en: 'Create Rule', ru: 'Создать правило', kz: 'Ереже жасау' },
  'alerts.noRules': { en: 'No alert rules configured', ru: 'Правила уведомлений не настроены', kz: 'Хабарлама ережелері конфигурацияланбаған' },
  'alerts.createFirst': { en: 'Create your first rule to start monitoring', ru: 'Создайте первое правило для мониторинга', kz: 'Мониторинг үшін бірінші ереже жасаңыз' },

  // ── Login ──
  'login.title': { en: 'PC Control Hub', ru: 'PC Control Hub', kz: 'PC Control Hub' },
  'login.subtitle': { en: 'Centralized Monitoring & Management', ru: 'Централизованный мониторинг и управление', kz: 'Орталықтандырылған мониторинг және басқару' },
  'login.adminLogin': { en: 'Administrator Login', ru: 'Вход администратора', kz: 'Әкімші кіруі' },
  'login.username': { en: 'Username', ru: 'Имя пользователя', kz: 'Пайдаланушы аты' },
  'login.password': { en: 'Password', ru: 'Пароль', kz: 'Құпия сөз' },
  'login.signIn': { en: 'Sign In', ru: 'Войти', kz: 'Кіру' },
  'login.signingIn': { en: 'Signing in...', ru: 'Входим...', kz: 'Кіруде...' },
  'login.default': { en: 'Default: admin / admin123', ru: 'По умолчанию: admin / admin123', kz: 'Әдепкі: admin / admin123' },

  // ── 404 ──
  'notFound.title': { en: 'Page not found', ru: 'Страница не найдена', kz: 'Бет табылмады' },
  'notFound.desc': { en: 'The page you are looking for does not exist or has been moved.', ru: 'Страница, которую вы ищете, не существует или была перемещена.', kz: 'Сіз іздеген бет жоқ немесе жылжытылған.' },
  'notFound.back': { en: 'Back to Dashboard', ru: 'На главную', kz: 'Басты бетке оралу' },

  // ── Scripts ──
  'nav.scripts': { en: 'Scripts', ru: 'Скрипты', kz: 'Скрипттер' },
  'scripts.title': { en: 'Script Library', ru: 'Библиотека скриптов', kz: 'Скрипт кітапханасы' },
  'scripts.subtitle': { en: 'Save and run scripts on remote devices', ru: 'Сохраняйте и выполняйте скрипты на удалённых устройствах', kz: 'Қашықтағы құрылғыларда скрипттерді сақтаңыз және орындаңыз' },
  'scripts.new': { en: 'New Script', ru: 'Новый скрипт', kz: 'Жаңа скрипт' },
  'scripts.name': { en: 'Script name', ru: 'Название скрипта', kz: 'Скрипт атауы' },
  'scripts.code': { en: 'Script code', ru: 'Код скрипта', kz: 'Скрипт коды' },
  'scripts.run': { en: 'Run', ru: 'Запустить', kz: 'Орындау' },
  'scripts.noScripts': { en: 'No saved scripts', ru: 'Нет сохранённых скриптов', kz: 'Сақталған скрипттер жоқ' },
  'scripts.createFirst': { en: 'Create your first reusable script', ru: 'Создайте первый переиспользуемый скрипт', kz: 'Алғашқы қайта пайдаланылатын скриптті жасаңыз' },
  'scripts.selectDevice': { en: 'Select device to run on', ru: 'Выберите устройство для запуска', kz: 'Орындау үшін құрылғыны таңдаңыз' },
  'scripts.output': { en: 'Output', ru: 'Вывод', kz: 'Шығыс' },

  // ── Groups ──
  'nav.groups': { en: 'Groups', ru: 'Группы', kz: 'Топтар' },
  'groups.title': { en: 'Device Groups', ru: 'Группы устройств', kz: 'Құрылғы топтары' },
  'groups.subtitle': { en: 'Organize devices into groups', ru: 'Организуйте устройства в группы', kz: 'Құрылғыларды топтарға ұйымдастырыңыз' },
  'groups.new': { en: 'New Group', ru: 'Новая группа', kz: 'Жаңа топ' },
  'groups.name': { en: 'Group name', ru: 'Название группы', kz: 'Топ атауы' },
  'groups.noGroups': { en: 'No groups created', ru: 'Группы не созданы', kz: 'Топтар жасалмаған' },
  'groups.devices': { en: 'devices', ru: 'устройств', kz: 'құрылғы' },
  'groups.addDevice': { en: 'Add device', ru: 'Добавить устройство', kz: 'Құрылғы қосу' },
  'groups.all': { en: 'All Devices', ru: 'Все устройства', kz: 'Барлық құрылғылар' },

  // ── Lock / Alarm ──
  'detail.lock': { en: 'Lock Screen', ru: 'Заблокировать', kz: 'Экранды құлыптау' },
  'detail.alarm': { en: 'Sound Alarm', ru: 'Сигнализация', kz: 'Дыбыстық сигнал' },

  // ── Common ──
  'common.loading': { en: 'Loading...', ru: 'Загрузка...', kz: 'Жүктелуде...' },
  'common.close': { en: 'Close', ru: 'Закрыть', kz: 'Жабу' },
  'common.cancel': { en: 'Cancel', ru: 'Отмена', kz: 'Болдырмау' },
  'common.save': { en: 'Save', ru: 'Сохранить', kz: 'Сақтау' },
  'common.delete': { en: 'Delete', ru: 'Удалить', kz: 'Жою' },
  'common.search': { en: 'Search', ru: 'Поиск', kz: 'Іздеу' },
} as const;

export type TranslationKey = keyof typeof translations;
