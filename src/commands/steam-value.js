const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} = require("discord.js");
const {
  resolveSteamId,
  scanSteamInventoryValue,
} = require("../services/steamValue");
const { createTopItemsImage } = require("../services/steamValueImage");
const {
  addCheck,
  getChecks,
  latestCheckPerUser,
} = require("../services/steamValueHistory");

const CURRENCY = "usd";
const EMBED_COLOR = 0x00a8ff;
const DOTA_EMOJI = "<:pngwingcom:1551207179137323028>";
const CS2_EMOJI = "<:counterstrikeseeklogo:1551207380690145381>";
const HISTORY_EMOJI = "<:57410timer:1551209394912624781>";

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "неизвестно";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function explainError(error) {
  switch (error.code) {
    case "INVENTORY_PRIVATE":
    case "INVENTORY_PRIVATE_OR_INVALID":
    case "INVENTORY_UNAVAILABLE":
      return "инвентарь закрыт или недоступен";
    case "LOLZ_TOKEN_MISSING":
      return "нет LOLZ_TOKEN";
    case "LOLZ_TOKEN_INVALID":
    case "LOLZ_TOKEN_SCOPE":
      return error.message;
    case "LOLZ_RATE_LIMIT":
      return "лимит Lolz/LZT";
    case "SHOWMYITEMS_FETCH_FAILED":
      return "showmyitems сейчас не получил данные Steam";
    case "VANITY_REQUIRES_STEAM_API_KEY":
      return "для steamcommunity.com/id/name нужен STEAM_API_KEY";
    case "VANITY_NOT_FOUND":
      return "vanity-профиль Steam не найден";
    case "INVALID_STEAM_INPUT":
      return "не понял SteamID или ссылку";
    default:
      return error.message || "неизвестная ошибка";
  }
}

function getResultByGame(report, gameKey) {
  return report.results.find((result) => {
    if (result.ok) return result.value.game.key === gameKey;
    return result.game && result.game.key === gameKey;
  });
}

function formatResultValue(result) {
  if (!result) return "недоступно";
  if (!result.ok) return `недоступно (${explainError(result.error)})`;
  return formatMoney(result.value.totalValue);
}

function createRequester(user, member) {
  return {
    userId: user.id,
    username: user.tag || user.username || user.id,
    displayName:
      (member && member.displayName) ||
      user.globalName ||
      user.username ||
      user.tag ||
      user.id,
  };
}

function getInventoryUrl(steamId) {
  return `https://steamcommunity.com/profiles/${steamId}/inventory/#570_2`;
}

function formatCheckedAt(checkedAt) {
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) return checkedAt || "unknown date";

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatHistory(checks) {
  return latestCheckPerUser(checks)
    .slice(0, 5)
    .map((check) => {
      const nick = check.displayName || check.username || check.userId || "unknown";
      const parsedBy = check.userId ? `<@${check.userId}>` : nick;
      return `${parsedBy}, ${formatCheckedAt(check.checkedAt)}`;
    });
}

function createSteamValueEmbed(report, previousChecks, imageFilename) {
  const dotaResult = getResultByGame(report, "dota2");
  const csResult = getResultByGame(report, "cs2");
  const history = formatHistory(previousChecks);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .addFields(
      {
        name: `${DOTA_EMOJI} Dota 2`,
        value: formatResultValue(dotaResult),
        inline: true,
      },
      {
        name: `${CS2_EMOJI} CS2`,
        value: formatResultValue(csResult),
        inline: true,
      },
    );

  if (history.length > 0) {
    embed.addFields({
      name: `${HISTORY_EMOJI} Ранее парсился`,
      value: history.join("\n"),
      inline: false,
    });
  }

  if (imageFilename) {
    embed.setImage(`attachment://${imageFilename}`);
  }

  return embed;
}

function createInventoryButton(steamId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Открыть инвентарь")
      .setStyle(ButtonStyle.Link)
      .setURL(getInventoryUrl(steamId)),
  );
}

async function createSteamValueResponse(profile, source = "auto", requester = null) {
  const steamId = await resolveSteamId(profile, process.env.STEAM_API_KEY);
  const previousChecks = getChecks(steamId);
  const report = await scanSteamInventoryValue({
    steamId,
    game: "both",
    source,
    currency: CURRENCY,
    lolzToken: process.env.LOLZ_TOKEN || process.env.LZT_MARKET_TOKEN,
  });

  if (requester) {
    addCheck(steamId, profile, requester);
  }

  const files = [];
  let imageFilename = null;
  const topItemsImage = await createTopItemsImage(report);

  if (topItemsImage) {
    imageFilename = `steam-top-items-${steamId}.png`;
    files.push(
      new AttachmentBuilder(topItemsImage, {
        name: imageFilename,
      }),
    );
  }

  return {
    embeds: [createSteamValueEmbed(report, previousChecks, imageFilename)],
    components: [createInventoryButton(steamId)],
    files,
    allowedMentions: { parse: [] },
  };
}

async function createSteamValueReply(profile, source = "auto", requester = null) {
  const response = await createSteamValueResponse(profile, source, requester);
  const embed = response.embeds[0].toJSON();
  const fields = embed.fields || [];
  return fields.map((field) => `${field.name}: ${field.value}`).join("\n");
}

function extractSteamProfileInput(messageContent) {
  const content = String(messageContent || "").trim();
  if (!content) return null;

  const profileUrl = content.match(/https?:\/\/steamcommunity\.com\/profiles\/7656119\d{10}[^\s]*/i);
  if (profileUrl) return profileUrl[0];

  const vanityUrl = content.match(/https?:\/\/steamcommunity\.com\/id\/[^/?#\s]+[^\s]*/i);
  if (vanityUrl) return vanityUrl[0];

  const steamId64 = content.match(/\b7656119\d{10}\b/);
  if (steamId64) return steamId64[0];

  const steam2 = content.match(/\bSTEAM_[0-5]:[01]:\d+\b/i);
  if (steam2) return steam2[0];

  const steam3 = content.match(/\[U:1:\d+\]/i);
  if (steam3) return steam3[0];

  return content;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("steam-value")
    .setDescription("Проверяет цену инвентаря Steam в USD.")
    .addStringOption((option) =>
      option
        .setName("profile")
        .setDescription("SteamID64, ссылка Steam, STEAM_1:X:Y или [U:1:...]")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("source")
        .setDescription("Источник цены.")
        .addChoices(
          { name: "Auto", value: "auto" },
          { name: "showmyitems", value: "showmyitems" },
          { name: "Lolz/LZT", value: "lolz" },
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const profile = interaction.options.getString("profile", true);
      const source = interaction.options.getString("source") || "auto";
      const requester = createRequester(interaction.user, interaction.member);
      await interaction.editReply(await createSteamValueResponse(profile, source, requester));
    } catch (error) {
      await interaction.editReply({
        content: `Не смог проверить инвентарь: ${explainError(error)}`,
      });
    }
  },

  createRequester,
  createSteamValueReply,
  createSteamValueResponse,
  extractSteamProfileInput,
};
