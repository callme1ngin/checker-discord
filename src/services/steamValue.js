const STEAM_ID64_BASE = 76561197960265728n;

const GAMES = {
  dota2: {
    key: "dota2",
    name: "Dota 2",
    appId: 570,
    showMyItemsGame: "dota2",
  },
  cs2: {
    key: "cs2",
    name: "CS2",
    appId: 730,
    showMyItemsGame: "cs2",
  },
  rust: {
    key: "rust",
    name: "Rust",
    appId: 252490,
    showMyItemsGame: "rust",
  },
  tf2: {
    key: "tf2",
    name: "Team Fortress 2",
    appId: 440,
    showMyItemsGame: "tf2",
  },
};

const DEFAULT_GAME_KEYS = ["dota2", "cs2", "rust", "tf2"];

const DEFAULT_CURRENCY = "usd";
const HTTP_TIMEOUT_MS = 30000;
const CACHE_TTL_MS = 60 * 60 * 1000;

const valueCache = new Map();

class SteamValueError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "SteamValueError";
    this.code = options.code || "STEAM_VALUE_ERROR";
    this.status = options.status;
    this.retryable = options.retryable || false;
  }
}

function normalizeCurrency(currency = DEFAULT_CURRENCY) {
  const normalized = String(currency || DEFAULT_CURRENCY).trim().toLowerCase();
  return /^[a-z]{3}$/.test(normalized) ? normalized : DEFAULT_CURRENCY;
}

function getSteamProfileUrl(steamId) {
  return `https://steamcommunity.com/profiles/${steamId}`;
}

function accountIdToSteamId64(accountId) {
  return (STEAM_ID64_BASE + BigInt(accountId)).toString();
}

function parseSteamInput(input) {
  const value = String(input || "").trim();
  if (!value) {
    throw new SteamValueError("Steam profile is required.", { code: "INVALID_STEAM_INPUT" });
  }

  const steamId64 = value.match(/\b(7656119\d{10})\b/);
  if (steamId64) return { steamId: steamId64[1], vanity: null };

  const steam3 = value.match(/^\[U:1:(\d+)\]$/i);
  if (steam3) return { steamId: accountIdToSteamId64(steam3[1]), vanity: null };

  const steam2 = value.match(/^STEAM_[0-5]:([01]):(\d+)$/i);
  if (steam2) {
    const accountId = BigInt(steam2[2]) * 2n + BigInt(steam2[1]);
    return { steamId: accountIdToSteamId64(accountId), vanity: null };
  }

  const vanityFromUrl = value.match(/steamcommunity\.com\/id\/([^/?#\s]+)/i);
  if (vanityFromUrl) return { steamId: null, vanity: decodeURIComponent(vanityFromUrl[1]) };

  if (/^[a-z0-9_-]{2,64}$/i.test(value)) {
    return { steamId: null, vanity: value };
  }

  throw new SteamValueError("Use SteamID64, a /profiles/ link, or a vanity /id/ link.", {
    code: "INVALID_STEAM_INPUT",
  });
}

async function resolveVanityUrl(vanity, steamApiKey) {
  if (!steamApiKey) {
    throw new SteamValueError(
      "Vanity profile links need STEAM_API_KEY in .env. Use SteamID64 or a /profiles/ link instead.",
      { code: "VANITY_REQUIRES_STEAM_API_KEY" },
    );
  }

  const url = new URL("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/");
  url.searchParams.set("key", steamApiKey);
  url.searchParams.set("vanityurl", vanity);

  const { json } = await requestJson(url, {
    headers: { Accept: "application/json" },
  });

  const response = json && json.response;
  if (!response || response.success !== 1 || !response.steamid) {
    throw new SteamValueError("Steam vanity profile was not found.", {
      code: "VANITY_NOT_FOUND",
    });
  }

  return response.steamid;
}

async function resolveSteamId(input, steamApiKey) {
  const parsed = parseSteamInput(input);
  if (parsed.steamId) return parsed.steamId;
  return resolveVanityUrl(parsed.vanity, steamApiKey);
}

function readCache(key) {
  const record = valueCache.get(key);
  if (!record) return null;
  if (Date.now() - record.createdAt > CACHE_TTL_MS) {
    valueCache.delete(key);
    return null;
  }
  return record.value;
}

function writeCache(key, value) {
  valueCache.set(key, {
    createdAt: Date.now(),
    value,
  });
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;

    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      text,
      json,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new SteamValueError("Price API request timed out.", {
        code: "REQUEST_TIMEOUT",
        retryable: true,
      });
    }

    throw new SteamValueError(`Price API request failed: ${error.message}`, {
      code: "REQUEST_FAILED",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

function findNumberDeep(value, keys) {
  if (!value || typeof value !== "object") return null;

  for (const key of keys) {
    if (typeof value[key] === "number") return value[key];
    if (typeof value[key] === "string" && value[key].trim() !== "") {
      const parsed = Number(value[key]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = findNumberDeep(child, keys);
      if (found !== null) return found;
    }
  }

  return null;
}

function collectItemsDeep(value, source, items = []) {
  if (!value || typeof value !== "object") return items;

  if (Array.isArray(value)) {
    for (const child of value) collectItemsDeep(child, source, items);
    return items;
  }

  const title = value.title || value.name || value.market_hash_name;
  const price = Number(value.price);
  const altMarketPrice = Number(value.altMarketPrice || value.alt_market_price);
  const count = Number(value.count || 1);
  const tradable = value.tradable;
  const imageUrl = value.image_url || value.imageUrl || value.icon_url || value.iconUrl || value.image;

  if (title && Number.isFinite(price)) {
    if (source !== "lolz" || tradable === undefined || Number(tradable) === 1) {
      items.push({
        title: String(title).replace(/\s+/g, " ").trim(),
        price,
        altMarketPrice: Number.isFinite(altMarketPrice) ? altMarketPrice : null,
        count: Number.isFinite(count) && count > 0 ? count : 1,
        imageUrl: imageUrl ? String(imageUrl) : null,
        rarity: value.rarity || value.type || null,
      });
    }
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectItemsDeep(child, source, items);
  }

  return items;
}

function buildDetails(json, source) {
  const items = collectItemsDeep(json, source);
  const topItems = [...items]
    .sort((a, b) => b.price - a.price)
    .slice(0, 8);
  const itemCount = items.reduce((sum, item) => sum + item.count, 0);

  return {
    itemCount,
    topItems,
    countedAll: source === "showmyitems",
  };
}

function readTotalValue(json) {
  return findNumberDeep(json, ["totalValue", "total_value"]);
}

function ensureReadableValue(json, source) {
  const value = readTotalValue(json);
  if (value === null) {
    throw new SteamValueError("Inventory value was not found in the API response.", {
      code: "VALUE_NOT_FOUND",
      retryable: true,
    });
  }

  if (value === 0) {
    const emptyCount = findNumberDeep(
      json,
      source === "lolz" ? ["itemCount", "marketableItemCount"] : ["totalItems"],
    );
    if (emptyCount !== 0) {
      throw new SteamValueError("Inventory value is unavailable or inventory is private.", {
        code: "INVENTORY_UNAVAILABLE",
      });
    }
  }

  return value;
}

function isPrivateOrInvalidBody(text) {
  const body = String(text || "").toLowerCase();
  return (
    body.includes("inventory is public") ||
    body.includes("invalid steamid") ||
    body.includes("not accessible") ||
    body.includes("private")
  );
}

function isTokenProblemBody(text) {
  const body = String(text || "").toLowerCase();
  return (
    body.includes("token") ||
    body.includes("unauthor") ||
    body.includes("permission") ||
    body.includes("scope") ||
    body.includes("access")
  );
}

async function fetchShowMyItemsValue(steamId, game, currency) {
  const url = new URL("https://showmyitems.com/api/steam/inventory");
  url.searchParams.set("steamId", steamId);
  url.searchParams.set("game", game.showMyItemsGame);

  const response = await requestJson(url, {
    headers: {
      Accept: "application/json",
      Referer: "https://showmyitems.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  if ([400, 403, 404].includes(response.status)) {
    if (isPrivateOrInvalidBody(response.text)) {
      throw new SteamValueError("Inventory is private, unavailable, or SteamID is invalid.", {
        code: "INVENTORY_PRIVATE_OR_INVALID",
        status: response.status,
      });
    }

    throw new SteamValueError("showmyitems could not fetch Steam inventory data.", {
      code: "SHOWMYITEMS_FETCH_FAILED",
      status: response.status,
      retryable: true,
    });
  }

  if (!response.ok) {
    throw new SteamValueError(`showmyitems returned HTTP ${response.status}.`, {
      code: "SHOWMYITEMS_HTTP_ERROR",
      status: response.status,
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  const totalValue = ensureReadableValue(response.json, "showmyitems");
  return {
    game,
    source: "showmyitems",
    currency,
    totalValue,
    ...buildDetails(response.json, "showmyitems"),
  };
}

async function fetchLolzValue(steamId, game, currency, lolzToken) {
  if (!lolzToken) {
    throw new SteamValueError("LOLZ_TOKEN is missing in .env.", {
      code: "LOLZ_TOKEN_MISSING",
    });
  }

  const url = new URL("https://prod-api.lzt.market/steam-value");
  url.searchParams.set("link", steamId);
  url.searchParams.set("app_id", String(game.appId));
  url.searchParams.set("currency", currency);

  const response = await requestJson(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${lolzToken.replace(/^Bearer\s+/i, "").trim()}`,
      "User-Agent": "DiscordSteamValueBot/1.0",
    },
  });

  if (response.status === 401) {
    throw new SteamValueError("Lolz/LZT token is invalid or expired.", {
      code: "LOLZ_TOKEN_INVALID",
      status: response.status,
    });
  }

  if (response.status === 403) {
    if (isTokenProblemBody(response.text)) {
      throw new SteamValueError("Lolz/LZT token has no required access scope.", {
        code: "LOLZ_TOKEN_SCOPE",
        status: response.status,
      });
    }

    throw new SteamValueError("Inventory is private or unavailable.", {
      code: "INVENTORY_PRIVATE",
      status: response.status,
    });
  }

  if (response.status === 429) {
    throw new SteamValueError("Lolz/LZT rate limit reached.", {
      code: "LOLZ_RATE_LIMIT",
      status: response.status,
      retryable: true,
    });
  }

  if (!response.ok) {
    throw new SteamValueError(`Lolz/LZT returned HTTP ${response.status}.`, {
      code: "LOLZ_HTTP_ERROR",
      status: response.status,
      retryable: response.status >= 500,
    });
  }

  const totalValue = ensureReadableValue(response.json, "lolz");
  return {
    game,
    source: "lolz",
    currency,
    totalValue,
    ...buildDetails(response.json, "lolz"),
  };
}

function getSourceOrder(source, lolzToken) {
  if (source === "lolz") return "lolz";
  if (source === "showmyitems") return "showmyitems";
  return lolzToken ? ["lolz", "showmyitems"] : ["showmyitems"];
}

async function scanOneGame({ steamId, gameKey, source, currency, lolzToken }) {
  const game = GAMES[gameKey];
  if (!game) {
    throw new SteamValueError(`Unsupported game: ${gameKey}`, {
      code: "UNSUPPORTED_GAME",
    });
  }

  const sourceOrder = Array.isArray(getSourceOrder(source, lolzToken))
    ? getSourceOrder(source, lolzToken)
    : [getSourceOrder(source, lolzToken)];
  const errors = [];

  for (const selectedSource of sourceOrder) {
    const cacheKey = [steamId, gameKey, selectedSource, currency].join(":");
    const cached = readCache(cacheKey);
    if (cached) return { ...cached, cached: true };

    try {
      const result =
        selectedSource === "lolz"
          ? await fetchLolzValue(steamId, game, currency, lolzToken)
          : await fetchShowMyItemsValue(steamId, game, currency);

      writeCache(cacheKey, result);
      return { ...result, cached: false };
    } catch (error) {
      errors.push(error);
    }
  }

  const finalError = errors[errors.length - 1] || new SteamValueError("No price sources available.");
  throw finalError;
}

async function scanSteamInventoryValue(options) {
  const steamId = options.steamId;
  const gameMode = options.game || "both";
  const source = options.source || "auto";
  const currency = normalizeCurrency(options.currency);
  const lolzToken = options.lolzToken || "";

  const gameKeys = gameMode === "both" || gameMode === "all" ? DEFAULT_GAME_KEYS : [gameMode];
  const results = [];

  for (const gameKey of gameKeys) {
    try {
      results.push({
        ok: true,
        value: await scanOneGame({
          steamId,
          gameKey,
          source,
          currency,
          lolzToken,
        }),
      });
    } catch (error) {
      results.push({
        ok: false,
        game: GAMES[gameKey],
        error:
          error instanceof SteamValueError
            ? error
            : new SteamValueError(error.message || "Unknown error"),
      });
    }
  }

  return {
    steamId,
    profileUrl: getSteamProfileUrl(steamId),
    currency,
    results,
  };
}

module.exports = {
  GAMES,
  SteamValueError,
  getSteamProfileUrl,
  resolveSteamId,
  scanSteamInventoryValue,
};
