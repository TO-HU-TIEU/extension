(() => {
  function active(){try{return !!globalThis.chrome?.runtime?.id&&!!globalThis.chrome?.storage?.local}catch{return false}}
  if(!active())return;
  if (globalThis.__assistantContentScanner) { globalThis.__assistantContentScanner.scan(); return; }
  let config = { enabled: false, sources: [] }, timer, running = false, full = false;
  const seen = new Set();
  async function scan() {
    if (!active() || running || full || document.visibilityState === 'hidden' || !config.enabled || !ContentCore.matches(location.href, config.sources)) return;
    const candidates = ContentExtractor.extract().filter(item => {
      const normalized = ContentCore.article(item, location.href);
      return normalized && !seen.has(normalized.id);
    });
    if (!candidates.length) return;
    running = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'contentIngest', items: candidates });
      if (response?.ok) {
        const accepted = new Set(response.data.acceptedIds);
        for (const item of candidates) { const id = ContentCore.article(item, location.href).id; if (accepted.has(id)) seen.add(id); }
        full = !!response.data.full;
      }
    } catch { /* Reloading an extension invalidates old content scripts; a page reload reconnects them. */ }
    finally { running = false; }
  }
  function schedule() {
    if (!active() || timer) return; // Price tickers must not postpone scanning indefinitely.
    timer = setTimeout(() => { timer = null; scan(); }, 450);
  }
  globalThis.__assistantContentScanner = { scan };
  Promise.resolve().then(()=>chrome.storage.local.get('contentConfig')).then(value => { config = value.contentConfig || config; schedule(); }).catch(()=>{});
  try{chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.contentConfig) { config = changes.contentConfig.newValue || { enabled: false, sources: [] }; seen.clear(); schedule(); }
    if (area === 'local' && changes.contentState) { if ((changes.contentState.newValue?.items.length || 0) < ContentCore.limit('maxArticles',120)) full = false; schedule(); }
  })}catch{/* Disconnected extension context; the page must reload. */}
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  addEventListener('scroll', schedule, { passive: true, capture: true });
  addEventListener('popstate', schedule);
  document.addEventListener('visibilitychange', schedule);
  // Handles SPA URL changes even when the route does not mutate the feed DOM.
  setInterval(schedule, 5000);
})();
