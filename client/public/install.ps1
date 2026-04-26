param (
    [string]$serverUrl = "http://system.kebruni.me"
)

# Проверка, запущен ли скрипт от имени администратора. Если нет — предупреждаем.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Скрипт запущен не от имени Администратора. Установка Node.js может не сработать. Рекомендуется запустить PowerShell от имени Администратора."
}

Write-Host "===========================" -ForegroundColor Cyan
Write-Host " Установка PC Control Agent" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan

$installDir = "C:\PC-Agent"

# Создаем папку, если ее нет
if (-not (Test-Path $installDir)) {
    Write-Host "Создаю директорию $installDir..."
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}
Set-Location $installDir

# 1. Проверяем NodeJS
Write-Host "Проверка NodeJS..." -ForegroundColor Yellow
$nodeExists = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeExists) {
    Write-Host "Node.js не найден. Скачиваю Node.js..." -ForegroundColor Cyan
    $nodeMsi = "node_installer.msi"
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi" -OutFile $nodeMsi
    
    Write-Host "Устанавливаю Node.js (это может занять пару минут)..." -ForegroundColor Cyan
    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i $nodeMsi /qn /norestart" -Wait -PassThru -NoNewWindow
    
    if ($process.ExitCode -eq 0) {
        Write-Host "Node.js успешно установлен!" -ForegroundColor Green
    } else {
        Write-Host "Возможно, установка Node.js завершилась с ошибкой или требует прав Администратора. Код: $($process.ExitCode)" -ForegroundColor Red
    }
    Remove-Item $nodeMsi -Force -ErrorAction SilentlyContinue

    # Добавляем в PATH для текущей сессии
    $env:Path += ";C:\Program Files\nodejs"
} else {
    $nodeVer = node -v
    Write-Host "Node.js уже установлен: $nodeVer" -ForegroundColor Green
}

# 2. Скачивание агента
Write-Host "Скачивание файлов агента..." -ForegroundColor Yellow
$zipFile = "agent-source.zip"
try {
    # Пытаемся скачать архив
    Write-Host "URL: $serverUrl/$zipFile"
    Invoke-WebRequest -Uri "$serverUrl/$zipFile" -OutFile $zipFile
} catch {
    Write-Host "Ошибка при скачивании архива агента с сервера: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Убедитесь, что сервер доступен." -ForegroundColor Red
    exit
}

# 3. Распаковка
Write-Host "Распаковка..." -ForegroundColor Yellow
# Очищаем старые файлы, если есть (кроме .agent-id и config.js, желательно сохранить их, но для простоты просто перезаписываем)
Expand-Archive -Path $zipFile -DestinationPath . -Force
Remove-Item $zipFile -Force

# 4. Установка зависимостей (npm install)
Write-Host "Установка зависимостей Node (npm install)..." -ForegroundColor Yellow
# Удаляем package-lock чтобы избежать багов с версиями, если они разные
if (Test-Path "package-lock.json") { Remove-Item "package-lock.json" -Force }
# Устанавливаем production зависимости, игнорируя Electron (чтобы было быстрее и легче)
$npmProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm install --omit=dev --no-audit --no-fund" -Wait -PassThru -NoNewWindow
if ($npmProcess.ExitCode -ne 0) {
    Write-Warning "Установка зависимостей завершилась с кодом $($npmProcess.ExitCode). Возможно, потребуется запустить 'npm install' вручную."
} else {
    Write-Host "Зависимости установлены успешно!" -ForegroundColor Green
}

# 5. Запуск
Write-Host "Запуск агента в фоновом режиме..." -ForegroundColor Yellow
# Создаем простой startup.bat для ручного запуска в будущем
Set-Content -Path "start.bat" -Value "@echo off`ncd /d %~dp0`nnode index.js"

# Запускаем через PowerShell фоновую задачу (без окна) или PM2
# Попробуем запустить процесс в фоне:
Start-Process -FilePath "node" -ArgumentList "index.js" -WindowStyle Hidden

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Установка завершена! Агент запущен в фоновом режиме." -ForegroundColor Green
Write-Host "Агент находится в папке: $installDir" -ForegroundColor Green
Write-Host "Чтобы остановить: Закройте процесс 'node' в Диспетчере задач." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# Возвращаемся обратно
Set-Location $PSScriptRoot