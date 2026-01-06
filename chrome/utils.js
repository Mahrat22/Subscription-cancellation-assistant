// utils.js

export function safeText(v) {
  return (v ?? "").toString().trim();
}

// Heuristic base domain extraction (simple + good enough for V1).
// Handles some common 2-level public suffixes.
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk",
  "com.au", "net.au", "org.au",
  "co.jp", "ne.jp",
  "com.br", "com.mx",
  "co.in", "firm.in", "net.in", "org.in",
  "co.za",
  "com.tr", "net.tr", "org.tr"
]);

export function getBaseDomain(hostname) {
  const host = safeText(hostname).toLowerCase();
  if (!host) return "";

  // If it's already an IP or localhost
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;

  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;

  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");

  // Check for known two-level suffixes: example.co.uk => base is example.co.uk
  const suffix2 = parts.slice(-2).join(".");
  const suffix3 = parts.slice(-3).slice(1).join("."); // e.g. co.uk
  if (TWO_LEVEL_SUFFIXES.has(suffix3)) return last3;

  return last2;
}

export function guessServiceName(title, hostname) {
  const t = safeText(title);
  if (t) {
    // Take the first chunk before separators
    const chunk = t.split(/[\|\-•:]/)[0].trim();
    if (chunk.length >= 2 && chunk.length <= 40) return chunk;
  }
  const base = getBaseDomain(hostname);
  if (!base) return "Unknown Service";
  const first = base.split(".")[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function parseISODate(value) {
  const v = safeText(value);
  if (!v) return null;
  // Expect YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysFromNow(isoDate) {
  const d = parseISODate(isoDate);
  if (!d) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = d.getTime() - startOfToday.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export async function storageGet(key) {
  return await chrome.storage.local.get(key);
}

export async function storageSet(obj) {
  return await chrome.storage.local.set(obj);
}
