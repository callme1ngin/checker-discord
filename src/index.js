require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, Events, GatewayIntentBits } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const steamValueChannelId = process.env.STEAM_VALUE_CHANNEL_ID;

if (!token) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

const intents = [GatewayIntentBits.Guilds];

if (steamValueChannelId) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}

const client = new Client({
  intents,
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`Command at ${filePath} is missing "data" or "execute".`);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);

    const payload = {
      content: "There was an error while executing this command.",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!steamValueChannelId) return;
  if (message.author.bot || message.channelId !== steamValueChannelId) return;

  const command = client.commands.get("steam-value");
  if (!command || typeof command.createSteamValueResponse !== "function") return;

  const profile = command.extractSteamProfileInput(message.content);
  if (!profile) {
    await message.reply("Отправь SteamID64 или ссылку на Steam-профиль.");
    return;
  }

  try {
    await message.channel.sendTyping();
    const source = process.env.STEAM_VALUE_SOURCE || "auto";
    const requester = command.createRequester(message.author, message.member);
    await message.reply(await command.createSteamValueResponse(profile, source, requester));
  } catch (error) {
    console.error(error);
    await message.reply("Не смог проверить инвентарь по этому сообщению.");
  }
});

client.login(token);
