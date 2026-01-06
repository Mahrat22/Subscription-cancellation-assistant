// options.js
import { storageGet, storageSet, daysFromNow, safeText } from "./utils.js";

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
      item.serviceName,
      item.baseDomain,
      item.notes,
      item.category,
      item.priceText
    ]
      .join(" ")
      .toLowerCase();
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

function makeBadge(text) {
  const b = document.createElement("span");
  b.className = "badge";
  b.textContent = safeText(text);
  return b;
}

function itemCard(item) {
  const days = daysFromNow(item.renewalDate);
  const renewalLabel =
    item.renewalDate
      ? (days === null ? item.renewalDate : `${item.renewalDate} (${days}d)`)
      : "—";

  const entry = findCancelLink(item.baseDomain);

  const el = document.createElement("div");
  el.className = "item";

  // Top area
  const top = document.createElement("div");
  top.className = "itemTop";

  const left = document.createElement("div");

  const title = document.createElement("div");
  title.className = "itemTitle";
  title.textContent = safeText(item.serviceName || item.baseDomain || "—");

  const meta = document.createElement("div");
  meta.className = "itemMeta";
  meta.textContent = `${safeText(item.baseDomain || "—")} · Renewal: ${safeText(renewalLabel)}`;

  left.appendChild(title);
  left.appendChild(meta);

  const badges = document.createElement("div");
  badges.className = "badges";

  if (item.category) badges.appendChild(makeBadge(item.category));
  if (item.detectedPageType) badges.appendChild(makeBadge(item.detectedPageType));

  top.appendChild(left);
  top.appendChild(badges);

  // Actions
  const actions = document.createElement("div");
  actions.className = "actions";

  const btnBilling = document.createElement("button");
  btnBilling.className = "openBilling";
  btnBilling.textContent = "Open billing";
  btnBilling.addEventListener("click", () => {
    if (item.currentUrl) chrome.tabs.create({ url: item.currentUrl });
  });

  const btnCancel = document.createElement("button");
  btnCancel.className = "openCancel";
  btnCancel.textContent = entry?.cancelUrl ? "Open cancellation" : "Find cancellation";
  btnCancel.addEventListener("click", () => {
    if (entry?.cancelUrl) {
      chrome.tabs.create({ url: entry.cancelUrl });
    } else {
      const q = encodeURIComponent(`${item.baseDomain} cancel subscription`);
      chrome.tabs.create({ url: `https://www.google.com/search?q=${q}` });
    }
  });

  const btnEdit = document.createElement("button");
  btnEdit.className = "ghost edit";
  btnEdit.textContent = "Edit";
  btnEdit.addEventListener("click", () => openEdit(item.id));

  const btnDel = document.createElement("button");
  btnDel.className = "danger del";
  btnDel.textContent = "Delete";
  btnDel.addEventListener("click", () => remove(item.id));

  actions.appendChild(btnBilling);
  actions.appendChild(btnCancel);
  actions.appendChild(btnEdit);
  actions.appendChild(btnDel);

  el.appendChild(top);
  el.appendChild(actions);

  if (item.notes) {
    const notes = document.createElement("div");
    notes.className = "itemMeta";
    notes.style.marginTop = "8px";
    notes.textContent = `Notes: ${safeText(item.notes)}`;
    el.appendChild(notes);
  }

  return el;
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

  // clear safely (no innerHTML)
  els.upcomingList.replaceChildren();

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

  els.list.replaceChildren();
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

  els.btnSaveEdit.addEventListener("click", async () => {
    // dialog closes automatically because method="dialog"
    await applyEdit();
  });

  // Optional: if you have a Cancel button that should just close dialog
  if (els.btnCancelEdit) {
    els.btnCancelEdit.addEventListener("click", () => {
      // method="dialog" handles close, no-op is fine
    });
  }
}

(async function init() {
  cancelMap = await loadCancelLinks();
  await load();
  bind();
  render();
})();
