# Deploy to Linux Server

Инструкция для установки SilentChecker Discord bot на Linux-сервер.

## 1. Установить Node.js 20+

Ubuntu/Debian:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt update
sudo apt install -y nodejs git build-essential
node -v
npm -v
```

## 2. Склонировать репозиторий

```bash
cd /opt
sudo git clone <REPO_URL> silentchecker-discord
sudo chown -R $USER:$USER /opt/silentchecker-discord
cd /opt/silentchecker-discord
```

## 3. Установить зависимости

```bash
npm ci
```

Если `npm ci` ругается из-за платформенных зависимостей после переноса с Windows:

```bash
rm -rf node_modules package-lock.json
npm install
```

## 4. Создать `.env`

```bash
cp .env.example .env
nano .env
```

Заполни значения:

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
STEAM_VALUE_CHANNEL_ID=...
STEAM_VALUE_SOURCE=auto
LOLZ_TOKEN=...
STEAM_API_KEY=...
```

## 5. Зарегистрировать slash-команды

```bash
npm run deploy:commands
```

## 6A. Запуск через PM2

Если на сервере уже есть PM2:

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Посмотреть логи:

```bash
pm2 logs silentchecker-discord
```

Обновление после нового git pull:

```bash
cd /opt/silentchecker-discord
git pull
npm ci
npm run deploy:commands
pm2 restart silentchecker-discord
```

## 6B. Запуск через systemd

Если PM2 не нужен:

```bash
sudo cp deploy/silentchecker-discord.service /etc/systemd/system/silentchecker-discord.service
sudo nano /etc/systemd/system/silentchecker-discord.service
```

Проверь `User=`, `WorkingDirectory=` и пути под свой сервер, затем:

```bash
sudo systemctl daemon-reload
sudo systemctl enable silentchecker-discord
sudo systemctl start silentchecker-discord
sudo systemctl status silentchecker-discord
```

Логи:

```bash
journalctl -u silentchecker-discord -f
```

Обновление:

```bash
cd /opt/silentchecker-discord
git pull
npm ci
npm run deploy:commands
sudo systemctl restart silentchecker-discord
```

## 6C. Запуск через Docker Compose

Этот вариант удобно использовать, если на сервере уже есть другие боты в Docker.
SilentChecker не открывает порты, поэтому не конфликтует с Telegram-ботом.

Установи Docker, если он еще не установлен:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

После `usermod` перелогинься в SSH.

Клонируй проект и создай `.env`:

```bash
cd /opt
sudo git clone https://github.com/callme1ngin/checker-discord.git
sudo chown -R $USER:$USER /opt/checker-discord
cd /opt/checker-discord
cp .env.example .env
nano .env
```

Зарегистрируй slash-команды:

```bash
docker compose run --rm silentchecker-discord npm run deploy:commands
```

Запусти бота:

```bash
docker compose up -d --build
```

Логи:

```bash
docker compose logs -f silentchecker-discord
```

Обновление:

```bash
cd /opt/checker-discord
git pull
docker compose build --pull
docker compose run --rm silentchecker-discord npm run deploy:commands
docker compose up -d
```

## Discord Portal

Для ответов на обычные сообщения в канале включи:

```text
Discord Developer Portal -> Bot -> Privileged Gateway Intents -> Message Content Intent
```

После включения перезапусти бота.
