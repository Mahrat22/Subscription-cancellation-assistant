// popup.js
import { getBaseDomain, guessServiceName, safeText, storageGet, storageSet } from "./utils.js";

const els = {
  statusBadge: document.getElementById("statusBadge"),
  serviceName: document.getElementById("serviceName"),
  domain: document.getElementById("domain"),
  pageType: document.getElementById("pageType"),
  confidence: document.getElementById("confidence"),
  hintBox: document.getElementById("hintBox"),
  renewalDate: document.getElementById("renewalDate"),
  category: document.getElementById("category"),
  notes: document.getElementById("notes"),
  btnSave: document.getElementById("btnSave"),
  btnSaveAnyway: document.getElementById("btnSaveAnyway"),
  btnCancel: document.getElementById("btnCancel"),
  btnOptions: document.getElementById("btnOptions")
};

let activeTab = null;
let scan = null;
let cancelMap = null;

function setBadge(kind, text) {
  els.statusBadge.className = `badge ${kind}`;
  els.statusBadge.textContent = text;
}

function confidenceKind(c) {
  if (c === "high") return "good";
  if (c === "medium") return "warn";
  if (c === "low") return "bad";
  return "neutral";
}

async function loadCancelLinks() {
  const url = chrome.runtime.getURL("cancel_links.json");
  const res = await fetch(url);
  return await res.json();
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function getHost(urlStr) {
  try { return new URL(urlStr).hostname; } catch { return ""; }
}

function findCancelLink(baseDomain) {
  if (!cancelMap || !baseDomain) return null;
  // direct match
  if (cancelMap[baseDomain]) return cancelMap[baseDomain];
  // try stripping subdomains: if user saved foo.netflix.com => netflix.com
  const parts = baseDomain.split(".");
  if (parts.length > 2) {
    const last2 = parts.slice(-2).join(".");
    if (cancelMap[last2]) return cancelMap[last2];
  }
  return null;
}

function guidanceText() {
  return [
    "Tip: Look for “Manage plan”, “Subscription”, “Billing”, or “Cancel”.",
    "We can open known cancellation pages, but we never cancel for you."
  ].join(" ");
}

async function runScan() {
  setBadge("neutral", "Scanning…");
  const resp = await chrome.runtime.sendMessage({ type: "RUN_SCAN" });
  if (!resp?.ok) {
    setBadge("bad", "Scan failed");
    els.hintBox.textContent = "Could not scan this page. You can still use “Save this site anyway”.";
    return null;
  }
  return resp.result;
}

async function upsertSubscription(sub) {
  const key = "subs_v1";
  const data = await storageGet(key);
  const list = Array.isArray(data[key]) ? data[key] : [];

  const idx = list.findIndex(x => x.baseDomain === sub.baseDomain);
  const now = Date.now();

  if (idx >= 0) {
    const updated = { ...list[idx], ...sub, updatedAt: now };
    list[idx] = updated;
    await storageSet({ [key]: list });
    return { mode: "updated", item: updated };
  } else {
    const created = { ...sub, createdAt: now, updatedAt: now };
    list.unshift(created);
    await storageSet({ [key]: list });
    return { mode: "created", item: created };
  }
}

async function saveCurrent({ force = false } = {}) {
  if (!activeTab) return;

  const url = safeText(activeTab.url);
  const host = getHost(url);
  const baseDomain = getBaseDomain(host);

  const serviceName = guessServiceName(activeTab.title, host);

  const detectedPageType = scan?.detectedPageType || "unknown";
  const confidence = scan?.confidence || "low";

  const renewalDate = safeText(els.renewalDate.value) || null;
  const category = safeText(els.category.value) || null;
  const notes = safeText(els.notes.value) || null;

  // If not force and no useful domain, block
  if (!baseDomain && !force) {
    els.hintBox.textContent = "Could not determine domain for this page.";
    return;
  }

  const payload = {
    id: crypto.randomUUID(),
    serviceName,
    baseDomain,
    currentUrl: url,
    detectedPageType,
    confidence,
    renewalDate,
    category,
    notes,
    priceText: null
  };

  const { mode } = await upsertSubscription(payload);

  setBadge("good", mode === "created" ? "Saved" : "Updated");
  els.hintBox.textContent = mode === "created"
    ? "Saved locally. Open the dashboard to manage reminders and notes."
    : "Updated existing subscription for this domain.";
}

async function openCancellation() {
  if (!activeTab) return;
  const baseDomain = getBaseDomain(getHost(activeTab.url));
  const entry = findCancelLink(baseDomain);

  if (entry?.cancelUrl) {
    await chrome.tabs.create({ url: entry.cancelUrl });
    return;
  }

  // Unknown: show safe guidance; offer user-triggered web search shortcut
  const q = encodeURIComponent(`${baseDomain} cancel subscription`);
  await chrome.tabs.create({ url: `https://www.google.com/search?q=${q}` });
}

async function init() {
  cancelMap = await loadCancelLinks();
  activeTab = await getActiveTab();

  if (!activeTab?.url || !activeTab.url.startsWith("http")) {
    setBadge("bad", "Unsupported page");
    els.hintBox.textContent = "Open a website tab (http/https) to use this extension.";
    els.btnSave.disabled = true;
    els.btnSaveAnyway.disabled = true;
    els.btnCancel.disabled = true;
    return;
  }

  const host = getHost(activeTab.url);
  const baseDomain = getBaseDomain(host);

  els.domain.textContent = baseDomain || host || "—";
  els.serviceName.textContent = guessServiceName(activeTab.title, host);

  scan = await runScan();

  const pageType = scan?.detectedPageType || "unknown";
  const conf = scan?.confidence || "low";

  els.pageType.textContent = pageType;
  els.confidence.textContent = conf;

  if (scan?.detected) {
    setBadge(confidenceKind(conf), "Detected: Subscription Page");
    els.hintBox.textContent = "";
  } else {
    setBadge("neutral", "Not detected");
    els.hintBox.textContent = guidanceText();
  }

  // Enable cancel if known in library
  const entry = findCancelLink(baseDomain);
  if (entry?.cancelUrl) {
    els.btnCancel.disabled = false;
    els.btnCancel.textContent = "Open cancellation";
  } else {
    els.btnCancel.disabled = false;
    els.btnCancel.textContent = "Find cancellation";
  }

  els.btnSave.addEventListener("click", () => saveCurrent({ force: false }));
  els.btnSaveAnyway.addEventListener("click", () => saveCurrent({ force: true }));
  els.btnCancel.addEventListener("click", openCancellation);
  els.btnOptions.addEventListener("click", async () => {
    await chrome.runtime.openOptionsPage();
  });
}

init().catch((e) => {
  setBadge("bad", "Error");
  els.hintBox.textContent = String(e?.message || e);
});
