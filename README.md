# SilentChecker Discord Bot

Discord-бот для проверки стоимости Steam-инвентаря Dota 2, CS2, Rust и Team Fortress 2.

## Возможности

- Проверяет SteamID64, `/profiles/` ссылки, vanity-ссылки, `STEAM_1:X:Y` и `[U:1:...]`.
- Всегда выводит стоимость в USD.
- Показывает Dota 2, CS2, Rust и Team Fortress 2 отдельными полями.
- Генерирует PNG-картинку с 8 самыми дорогими предметами.
- Помнит, кто уже проверял конкретный SteamID.
- Может работать как slash-команда и как автоответчик в отдельном Discord-канале.

## Локальный запуск

```bash
npm install
cp .env.example .env
npm run deploy:commands
npm start
```

На Windows PowerShell используй `npm.cmd`:

```bash
npm.cmd install
npm.cmd run deploy:commands
npm.cmd start
```

## `.env`

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
STEAM_VALUE_CHANNEL_ID=...
STEAM_VALUE_SOURCE=auto
LOLZ_TOKEN=...
STEAM_API_KEY=...
```

`STEAM_VALUE_CHANNEL_ID` нужен, если бот должен отвечать на обычные сообщения в конкретном канале.

`STEAM_API_KEY` нужен для vanity-ссылок вида `steamcommunity.com/id/name`.

## Использование

Slash-команда:

```text
/steam-value profile:76561198000000000 source:auto
```

Обычное сообщение в настроенном канале:

```text
76561198000000000
```

## Деплой

См. [DEPLOY.md](DEPLOY.md).

## Данные

История проверок хранится локально:

```text
data/steam-value-checks.json
```

Файл не коммитится в git.
