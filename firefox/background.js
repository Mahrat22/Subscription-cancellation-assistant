// background.js

let pendingScan = new Map(); // tabId -> { resolve, timeoutId }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "RUN_SCAN") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("No active tab");

        const tabId = tab.id;

        const result = await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            pendingScan.delete(tabId);
            reject(new Error("Scan timed out"));
          }, 2500);

          pendingScan.set(tabId, { resolve, timeoutId });

          chrome.scripting.executeScript({
            target: { tabId },
            files: ["content.js"]
          }).catch((e) => {
            clearTimeout(timeoutId);
            pendingScan.delete(tabId);
            reject(e);
          });
        });

        sendResponse({ ok: true, result });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();

    return true; // async
  }

  if (msg?.type === "SCAN_RESULT") {
    const tabId = sender?.tab?.id;
    if (typeof tabId === "number" && pendingScan.has(tabId)) {
      const { resolve, timeoutId } = pendingScan.get(tabId);
      clearTimeout(timeoutId);
      pendingScan.delete(tabId);
      resolve(msg.payload);
    }
  }
});
