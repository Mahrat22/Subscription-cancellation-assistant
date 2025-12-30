// content.js
(() => {
  const url = location.href.toLowerCase();
  const path = location.pathname.toLowerCase();

  const URL_SIGNALS = [
    { re: /(billing|invoice|payment|plan|pricing|subscription|subscriptions|membership)/i, weight: 3, type: "billing" },
    { re: /(cancel|terminate|end-subscription|close-account|unsubscribe)/i, weight: 4, type: "cancel" },
    { re: /(account|settings|profile)/i, weight: 1, type: "account" }
  ];

  const KEYWORD_SIGNALS = [
    { re: /\bsubscription(s)?\b/i, weight: 3 },
    { re: /\bbilling\b/i, weight: 3 },
    { re: /\bplan\b/i, weight: 2 },
    { re: /\bpayment\b/i, weight: 2 },
    { re: /\brenew(al)?\b/i, weight: 3 },
    { re: /\bnext billing date\b/i, weight: 4 },
    { re: /\bcancel\b/i, weight: 4 },
    { re: /\bmanage plan\b/i, weight: 3 },
    { re: /\bmembership\b/i, weight: 2 }
  ];

  function getVisibleTextSample() {
    // Small, bounded sample to avoid heavy processing and avoid “scraping”.
    const bodyText = document.body ? document.body.innerText : "";
    return (bodyText || "").slice(0, 8000);
  }

  function detect() {
    let score = 0;
    let types = { billing: 0, cancel: 0, account: 0 };

    for (const s of URL_SIGNALS) {
      if (s.re.test(url) || s.re.test(path)) {
        score += s.weight;
        types[s.type] += s.weight;
      }
    }

    const sample = getVisibleTextSample();
    for (const k of KEYWORD_SIGNALS) {
      if (k.re.test(sample)) score += k.weight;
    }

    // Decide page type based on strongest url-type signal
    let detectedPageType = "unknown";
    const best = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0) detectedPageType = best[0];

    let confidence = "low";
    if (score >= 9) confidence = "high";
    else if (score >= 5) confidence = "medium";

    return {
      detected: confidence !== "low" || detectedPageType !== "unknown",
      confidence,
      score,
      detectedPageType,
      url: location.href,
      title: document.title || ""
    };
  }

  const result = detect();
  chrome.runtime.sendMessage({ type: "SCAN_RESULT", payload: result });
})();
