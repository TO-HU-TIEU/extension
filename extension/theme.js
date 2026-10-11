// Shared light/dark mode for the panel and every injected module.
(() => {
  const KEY = 'themeMode';
  const root = document.documentElement;
  const extensionPage = location.protocol === 'chrome-extension:';
  let mode = 'dark';
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const palette = {
    dark: { bg: '#000000', surface: '#000000', raised: '#16181c', border: '#2f3336', text: '#e7e9ea', muted: '#71767b', accent: '#1d9bf0' },
    light: { bg: '#ffffff', surface: '#ffffff', raised: '#f7f9f9', border: '#cfd9de', text: '#0f1419', muted: '#536471', accent: '#1d9bf0' }
  };
  const normalize = value => value === 'light' ? 'light' : 'dark';
  function paint(next) {
    mode = normalize(next);
    const colors = palette[mode];
    if (extensionPage) root.dataset.theme = mode;
    root.dataset.xraTheme = mode;
    for (const [name, value] of Object.entries({
      '--ui-bg': colors.bg, '--ui-surface': colors.surface, '--ui-surface-raised': colors.raised,
      '--ui-border': colors.border, '--ui-text': colors.text, '--ui-muted': colors.muted, '--ui-accent': colors.accent,
      '--reply-bg': colors.bg, '--reply-surface': colors.surface, '--reply-color': colors.text,
      '--reply-muted': colors.muted, '--reply-border': colors.border, '--xra-bg': colors.bg, '--xra-color': colors.text
    })) root.style.setProperty(name, value);
    const toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) {
      const nextMode = mode === 'dark' ? 'light' : 'dark';
      toggle.innerHTML = globalThis.AssistantIcons?.svg(nextMode) || '';
      toggle.title = nextMode === 'light' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.dataset.themeMode = mode;
    }
    document.dispatchEvent(new CustomEvent('xra-theme-change', { detail: { mode } }));
  }
  async function set(next) {
    const value = normalize(next);
    paint(value);
    try { await chrome.storage.local.set({ [KEY]: value }); } catch {}
    return value;
  }
  async function toggle() { return set(mode === 'dark' ? 'light' : 'dark'); }
  function bind() {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button || button.dataset.themeBound === '1') return;
    button.dataset.themeBound = '1';
    button.addEventListener('click', () => toggle());
  }
  globalThis.AssistantTheme = { get mode() { return mode; }, ready, set, toggle, apply: paint };
  paint(mode);
  bind();
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) paint(changes[KEY].newValue);
    });
    chrome.storage.local.get(KEY).then(value => { paint(value[KEY] || 'dark'); readyResolve(mode); bind(); }).catch(() => { readyResolve(mode); });
  } catch { readyResolve(mode); }
})();
