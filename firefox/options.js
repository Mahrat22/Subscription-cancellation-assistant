// options.js
import { storageGet, storageSet, daysFromNow, getBaseDomain, safeText } from "./utils.js";

const key = "subs_v1";

const els = {
  q: document.getElementById("q"),
  filterCategory: document.getElementById("filterCategory"),
  filterWindow: document.getElementById("filterWindow"),
  sortBy: document.getElementById("sortBy"),
  list: document.getElementById("list"),
  emptyState: document.getElementById("emptyState"),
  upcomingBox: document.getElementById("upcomingBox"),
  upcomingList: document.getElementById("upcomingList"),

  editDialog: document.getElementById("editDialog"),
  eName: document.getElementById("eName"),
  eRenewal: document.getElementById("eRenewal"),
  eCategory: document.getElementById("eCategory"),
  ePrice: document.getElementById("ePrice"),
  eNotes: document.getElementById("eNotes"),
  btnSaveEdit: document.getElementById("btnSaveEdit"),
  btnCancelEdit: document.getElementById("btnCancelEdit")
};

let cancelMap = null;
let all = [];
let editingId = null;

async function loadCancelLinks() {
  const url = chrome.runtime.getURL("cancel_links.json");
  const res = await fetch(url);
  return await res.json();
}

function findCancelLink(baseDomain) {
  if (!cancelMap || !baseDomain) return null;
  if (cancelMap[baseDomain]) return cancelMap[baseDomain];
  const parts = baseDomain.split(".");
  if (parts.length > 2) {
    const last2 = parts.slice(-2).join(".");
    if (cancelMap[last2]) return cancelMap[last2];
  }
  return null;
}

async function load() {
  const data = await storageGet(key);
  all = Array.isArray(data[key]) ? data[key] : [];
}

async function saveAll() {
  await storageSet({ [key]: all });
}

function matchesFilters(item) {
  const q = safeText(els.q.value).toLowerCase();
  const cat = safeText(els.filterCategory.value);
  const win = safeText(els.filterWindow.value);

  if (q) {
    const hay = [
      item.serviceName, item.baseDomain, item.notes, item.category, item.priceText
    ].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (cat && safeText(item.category) !== cat) return false;

  if (win) {
    const days = daysFromNow(item.renewalDate);
    const w = Number(win);
    if (days === null || days < 0 || days > w) return false;
  }

  return true;
}

function sortItems(list) {
  const sortBy = els.sortBy.value;
  const copy = [...list];

  if (sortBy === "newest") {
    copy.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return copy;
  }

  // renewalSoon (default): items with date first, soonest first; undated last
  copy.sort((a, b) => {
    const da = daysFromNow(a.renewalDate);
    const db = daysFromNow(b.renewalDate);

    const aHas = da !== null && da >= 0;
    const bHas = db !== null && db >= 0;

    if (aHas && bHas) return da - db;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  return copy;
}

function itemCard(item) {
  const days = daysFromNow(item.renewalDate);
  const renewalLabel =
    item.renewalDate ? (days === null ? item.renewalDate : `${item.renewalDate} (${days}d)`) : "—";

  const entry = findCancelLink(item.baseDomain);

  const el = document.createElement("div");
  el.className = "item";

  el.innerHTML = `
    <div class="itemTop">
      <div>
        <div class="itemTitle">${escapeHtml(item.serviceName || item.baseDomain)}</div>
        <div class="itemMeta">
          ${escapeHtml(item.baseDomain || "—")} · Renewal: ${escapeHtml(renewalLabel)}
        </div>
      </div>
      <div class="badges">
        ${item.category ? `<span class="badge">${escapeHtml(item.category)}</span>` : ""}
        ${item.detectedPageType ? `<span class="badge">${escapeHtml(item.detectedPageType)}</span>` : ""}
      </div>
    </div>

    <div class="actions">
      <button class="openBilling">Open billing</button>
      <button class="openCancel">${entry?.cancelUrl ? "Open cancellation" : "Find cancellation"}</button>
      <button class="ghost edit">Edit</button>
      <button class="danger del">Delete</button>
    </div>

    ${item.notes ? `<div class="itemMeta" style="margin-top:8px;">Notes: ${escapeHtml(item.notes)}</div>` : ""}
  `;

  el.querySelector(".openBilling").addEventListener("click", () => {
    if (item.currentUrl) chrome.tabs.create({ url: item.currentUrl });
  });

  el.querySelector(".openCancel").addEventListener("click", () => {
    if (entry?.cancelUrl) {
      chrome.tabs.create({ url: entry.cancelUrl });
    } else {
      const q = encodeURIComponent(`${item.baseDomain} cancel subscription`);
      chrome.tabs.create({ url: `https://www.google.com/search?q=${q}` });
    }
  });

  el.querySelector(".edit").addEventListener("click", () => openEdit(item.id));
  el.querySelector(".del").addEventListener("click", () => remove(item.id));

  return el;
}

function escapeHtml(str) {
  return safeText(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function remove(id) {
  all = all.filter(x => x.id !== id);
  await saveAll();
  render();
}

function upcomingWithin(days) {
  return all
    .map(x => ({ x, d: daysFromNow(x.renewalDate) }))
    .filter(o => o.d !== null && o.d >= 0 && o.d <= days)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8)
    .map(o => o.x);
}

function renderUpcoming() {
  const upcoming = upcomingWithin(30);
  els.upcomingList.innerHTML = "";

  if (upcoming.length === 0) {
    els.upcomingBox.style.display = "none";
    return;
  }

  els.upcomingBox.style.display = "block";
  for (const item of upcoming) {
    els.upcomingList.appendChild(itemCard(item));
  }
}

function renderList() {
  const filtered = all.filter(matchesFilters);
  const sorted = sortItems(filtered);

  els.list.innerHTML = "";
  els.emptyState.style.display = all.length === 0 ? "block" : "none";

  for (const item of sorted) {
    els.list.appendChild(itemCard(item));
  }
}

function render() {
  renderUpcoming();
  renderList();
}

function openEdit(id) {
  const item = all.find(x => x.id === id);
  if (!item) return;

  editingId = id;
  els.eName.value = item.serviceName || "";
  els.eRenewal.value = item.renewalDate || "";
  els.eCategory.value = item.category || "";
  els.ePrice.value = item.priceText || "";
  els.eNotes.value = item.notes || "";

  els.editDialog.showModal();
}

async function applyEdit() {
  const item = all.find(x => x.id === editingId);
  if (!item) return;

  item.serviceName = safeText(els.eName.value) || item.serviceName || item.baseDomain;
  item.renewalDate = safeText(els.eRenewal.value) || null;
  item.category = safeText(els.eCategory.value) || null;
  item.priceText = safeText(els.ePrice.value) || null;
  item.notes = safeText(els.eNotes.value) || null;
  item.updatedAt = Date.now();

  await saveAll();
  render();
}

function bind() {
  const rerender = () => render();

  els.q.addEventListener("input", rerender);
  els.filterCategory.addEventListener("change", rerender);
  els.filterWindow.addEventListener("change", rerender);
  els.sortBy.addEventListener("change", rerender);

  els.btnSaveEdit.addEventListener("click", async (e) => {
    // dialog closes automatically because method="dialog"
    await applyEdit();
  });
}

(async function init() {
  cancelMap = await loadCancelLinks();
  await load();
  bind();
  render();
})();
