require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");

const { DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_TOKEN } = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_GUILD_ID || !DISCORD_TOKEN) {
  console.error("Missing DISCORD_CLIENT_ID, DISCORD_GUILD_ID, or DISCORD_TOKEN in .env");
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`Command ${file} is missing "data" or "execute".`);
  }
}

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application commands.`);

    const data = await rest.put(
      Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application commands.`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
