const sharp = require("sharp");

const WIDTH = 980;
const HEIGHT = 640;
const PADDING = 26;
const GAP = 18;
const CARD_WIDTH = 220;
const CARD_HEIGHT = 280;
const IMAGE_WIDTH = 196;
const IMAGE_HEIGHT = 144;
const IMAGE_TIMEOUT_MS = 12000;
const IMAGE_SCALE = 2;
const FONT_FAMILY = "Segoe UI, Inter, Arial, sans-serif";
const PALETTE = {
  page: "#030a28",
  pageGlow: "#061b64",
  card: "#071a34",
  cardInner: "#0a2444",
  cardStroke: "#0b5da8",
  emptyImage: "#0a1c38",
  rarityText: "#86cfff",
  titleText: "#eef8ff",
  priceText: "#69e7ff",
};

const RARITY_COLORS = {
  arcana: "#7ff7ff",
  ancient: "#2f8cff",
  immortal: "#00d5ff",
  legendary: "#3f6dff",
  mythical: "#8ab4ff",
  rare: "#0aa7ff",
  uncommon: "#48cfff",
  common: "#bdefff",
};

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSteamImageUrls(imageUrl) {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return [imageUrl];

  return [
    `https://community.cloudflare.steamstatic.com/economy/image/${imageUrl}/512fx384f`,
    `https://community.cloudflare.steamstatic.com/economy/image/${imageUrl}/360fx260f`,
    `https://community.cloudflare.steamstatic.com/economy/image/${imageUrl}`,
    `https://steamcommunity-a.akamaihd.net/economy/image/${imageUrl}/512fx384f`,
    `https://steamcommunity-a.akamaihd.net/economy/image/${imageUrl}`,
  ];
}

async function fetchImageBuffer(url) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "DiscordSteamValueBot/1.0",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (!response.ok) continue;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      // Try the next attempt or URL.
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

async function prepareImageDataUri(buffer) {
  try {
    const processed = await sharp(buffer)
      .trim({ threshold: 24 })
      .resize(IMAGE_WIDTH * IMAGE_SCALE, IMAGE_HEIGHT * IMAGE_SCALE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${processed.toString("base64")}`;
  } catch {
    return null;
  }
}

async function fetchImageDataUri(imageUrl) {
  const urls = getSteamImageUrls(imageUrl);
  if (!urls) return null;

  for (const url of urls) {
    const buffer = await fetchImageBuffer(url);
    if (!buffer) continue;

    const dataUri = await prepareImageDataUri(buffer);
    if (dataUri) return dataUri;
  }

  return null;
}

function wrapText(text, maxChars, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 3))}...`;
  }

  return lines;
}

function formatUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `${amount.toFixed(2)} $`;
}

function getRarityColor(rarity) {
  const normalized = String(rarity || "").toLowerCase();
  for (const [key, color] of Object.entries(RARITY_COLORS)) {
    if (normalized.includes(key)) return color;
  }
  return "#00d5ff";
}

function collectTopItems(report) {
  return report.results
    .filter((result) => result.ok)
    .flatMap((result) =>
      (result.value.topItems || []).map((item) => ({
        ...item,
        game: result.value.game.name,
      })),
    )
    .filter((item) => Number.isFinite(Number(item.price)) && Number(item.price) > 0)
    .sort((a, b) => Number(b.price) - Number(a.price))
    .slice(0, 8);
}

function renderTextLines(lines, x, y, options = {}) {
  const size = options.size || 15;
  const fill = options.fill || "#dfe7df";
  const weight = options.weight || "600";
  const lineHeight = options.lineHeight || size + 4;

  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`,
    )
    .join("");
}

function renderCard(item, imageDataUri, index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const x = PADDING + col * (CARD_WIDTH + GAP);
  const y = PADDING + row * (CARD_HEIGHT + GAP);
  const imageX = x + (CARD_WIDTH - IMAGE_WIDTH) / 2;
  const imageY = y + 10;
  const rarityColor = getRarityColor(item.rarity);
  const titleLines = wrapText(item.title, 24, 2);
  const rarity = item.rarity || item.game || "Item";
  const priceParts = [formatUsd(item.price)];

  if (item.count && item.count > 1) {
    priceParts.push(`x ${item.count}`);
  }

  const imageMarkup = imageDataUri
    ? `<image href="${imageDataUri}" x="${imageX}" y="${imageY}" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" preserveAspectRatio="xMidYMid meet"/>`
    : `<rect x="${imageX}" y="${imageY}" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" rx="4" fill="${PALETTE.emptyImage}"/>`;

  return `
    <g>
      <rect x="${x}" y="${y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="8" fill="${PALETTE.card}" stroke="${PALETTE.cardStroke}" stroke-width="2" opacity="0.96"/>
      <rect x="${x + 10}" y="${y + 10}" width="${CARD_WIDTH - 20}" height="${CARD_HEIGHT - 20}" rx="6" fill="${PALETTE.cardInner}" opacity="0.74"/>
      ${imageMarkup}
      <rect x="${x + 14}" y="${y + 160}" width="${CARD_WIDTH - 28}" height="4" rx="2" fill="${rarityColor}"/>
      <text x="${x + 14}" y="${y + 189}" font-family="${FONT_FAMILY}" font-size="13" fill="${PALETTE.rarityText}" font-weight="700">${escapeXml(rarity)}</text>
      ${renderTextLines(titleLines, x + 14, y + 211, { size: 14, fill: PALETTE.titleText, weight: "700", lineHeight: 17 })}
      <text x="${x + 14}" y="${y + 258}" font-family="${FONT_FAMILY}" font-size="18" fill="${PALETTE.priceText}" font-weight="800">${escapeXml(priceParts.join("  "))}</text>
    </g>
  `;
}

async function createTopItemsImage(report) {
  const items = collectTopItems(report);
  if (items.length === 0) return null;

  const imageDataUris = await Promise.all(items.map((item) => fetchImageDataUri(item.imageUrl)));
  const cards = items.map((item, index) => renderCard(item, imageDataUris[index], index)).join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      <style>
        text { font-family: ${FONT_FAMILY}; }
      </style>
      <defs>
        <radialGradient id="logoGlow" cx="72%" cy="6%" r="92%">
          <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.45"/>
          <stop offset="35%" stop-color="${PALETTE.pageGlow}" stop-opacity="0.82"/>
          <stop offset="100%" stop-color="${PALETTE.page}" stop-opacity="1"/>
        </radialGradient>
        <linearGradient id="edgeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00124f" stop-opacity="0.9"/>
          <stop offset="50%" stop-color="#061b64" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#00b7ff" stop-opacity="0.3"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${PALETTE.page}"/>
      <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#logoGlow)"/>
      <path d="M0 610 C220 520 360 700 560 570 S820 470 980 520 L980 640 L0 640 Z" fill="url(#edgeGlow)" opacity="0.55"/>
      ${cards}
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = {
  createTopItemsImage,
};
