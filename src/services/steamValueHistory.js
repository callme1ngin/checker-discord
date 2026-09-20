const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = path.join(__dirname, "..", "..", "data", "steam-value-checks.json");
const MAX_CHECKS_PER_STEAM_ID = 100;

function createEmptyDb() {
  return {
    version: 1,
    profiles: {},
  };
}

function readDb() {
  if (!fs.existsSync(DB_PATH)) return createEmptyDb();

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") return createEmptyDb();
    if (!parsed.profiles || typeof parsed.profiles !== "object") parsed.profiles = {};
    if (!parsed.version) parsed.version = 1;

    return parsed;
  } catch {
    return createEmptyDb();
  }
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function getChecks(steamId) {
  const db = readDb();
  const profile = db.profiles[String(steamId)];
  if (!profile || !Array.isArray(profile.checks)) return [];
  return [...profile.checks].sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt));
}

function addCheck(steamId, input, requester) {
  const db = readDb();
  const key = String(steamId);
  const now = new Date().toISOString();

  db.profiles[key] = db.profiles[key] || {
    steamId: key,
    firstInput: input,
    lastInput: input,
    checks: [],
  };

  const profile = db.profiles[key];
  profile.lastInput = input;
  profile.updatedAt = now;
  profile.checks = Array.isArray(profile.checks) ? profile.checks : [];
  profile.checks.push({
    userId: requester.userId,
    username: requester.username,
    displayName: requester.displayName,
    checkedAt: now,
    input,
  });

  if (profile.checks.length > MAX_CHECKS_PER_STEAM_ID) {
    profile.checks = profile.checks.slice(-MAX_CHECKS_PER_STEAM_ID);
  }

  writeDb(db);
}

function latestCheckPerUser(checks) {
  const byUser = new Map();

  for (const check of checks) {
    const key = check.userId || check.displayName || check.username || "unknown";
    const current = byUser.get(key);

    if (!current || new Date(check.checkedAt) > new Date(current.checkedAt)) {
      byUser.set(key, check);
    }
  }

  return [...byUser.values()].sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt));
}

module.exports = {
  addCheck,
  getChecks,
  latestCheckPerUser,
};
