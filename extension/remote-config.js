(() => {
  if (globalThis.RemoteConfig) return;
  const BASE = "https://raw.githubusercontent.com/TO-HU-TIEU/configs/main/",
    PATHS = {
      endpoints: "settings/endpoints.json",
      reply: "prompts/reply.json",
      styles: "presets/reply-styles.json",
    };
  let cache = null,
    inflight;
  const defaults = {
    endpoints: { presets: BASE + PATHS.styles },
    reply: { supplement: "" },
    styles: { version: 1, styles: [] },
  };
  function validate(key, value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Cấu hình không hợp lệ: " + key);
    if (
      key === "reply" &&
      (!value.supplement || typeof value.supplement !== "string" || value.supplement.length > 12000)
    )
      throw new Error("Prompt không hợp lệ");
    if (
      key === "styles" &&
      (!Array.isArray(value.styles) ||
        !value.styles.length ||
        value.styles.length > 30 ||
        !value.styles.every(
          (s) =>
            s &&
            typeof s.id === "string" &&
            typeof s.name === "string" &&
            s.name.length <= 80 &&
            typeof s.prompt === "string" &&
            s.prompt.length <= 6000,
        ))
    )
      throw new Error("Preset không hợp lệ");
    if (key === "endpoints" && value.presets !== BASE + PATHS.styles)
      throw new Error("Endpoint không được phép");
    return value;
  }
  function storage() {
    try {
      return globalThis.chrome?.storage?.local;
    } catch {
      return null;
    }
  }
  const ready = Promise.resolve()
    .then(() => storage()?.get("sharedConfigCache") || {})
    .then(({ sharedConfigCache }) => {
      try {
        if (sharedConfigCache?.data) {
          const data = Object.fromEntries(
            Object.keys(PATHS).map((key) => [key, validate(key, sharedConfigCache.data[key])]),
          );
          cache = { ...sharedConfigCache, data };
        }
      } catch {}
      return cache;
    })
    .catch(() => null);
  async function refresh(force = false) {
    await ready;
    if (!storage()) return cache;
    if (inflight) return inflight;
    if (!force && cache && Date.now() - cache.checkedAt < 3600000) return cache;
    inflight = (async () => {
      try {
        const options = { cache: "no-store", signal: globalThis.AbortSignal?.timeout(12000) },
          response = await fetch(BASE + "manifest.json", options);
        if (!response.ok) throw new Error("Không tải được manifest");
        const manifest = await response.json();
        if (
          manifest.schemaVersion !== 1 ||
          typeof manifest.version !== "string" ||
          !manifest.resources
        )
          throw new Error("Manifest không hợp lệ");
        if (cache?.version === manifest.version) {
          cache = { ...cache, checkedAt: Date.now() };
          await storage()?.set({ sharedConfigCache: cache });
          return cache;
        }
        const data = {};
        await Promise.all(
          Object.entries(PATHS).map(async ([key, path]) => {
            const resource = manifest.resources[key];
            if (resource?.path !== path || !/^\w{64}$/.test(resource.sha256))
              throw new Error("Tài nguyên không hợp lệ");
            const r = await fetch(BASE + path, options);
            if (!r.ok) throw new Error("Không tải được cấu hình");
            const raw = await r.text();
            if (raw.length > 250000) throw new Error("Tài nguyên quá lớn");
            const hash = Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))),
              (b) => b.toString(16).padStart(2, "0"),
            ).join("");
            if (hash !== resource.sha256) throw new Error("Cấu hình đang cập nhật");
            data[key] = validate(key, JSON.parse(raw));
          }),
        );
        cache = { version: manifest.version, checkedAt: Date.now(), data };
        const personal = (await storage()?.get("customStyles")) || {};
        await storage()?.set({
          sharedConfigCache: cache,
          replyStyleCatalog: [...data.styles.styles, ...(personal.customStyles || [])],
          remotePresetCache: data.styles,
        });
        return cache;
      } catch {
        return cache;
      }
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }
  function start() {
    if (!storage()) return;
    refresh().catch(() => {});
    chrome.alarms?.create("shared-config-refresh", { periodInMinutes: 60 });
    chrome.alarms?.onAlarm.addListener((alarm) => {
      if (alarm.name === "shared-config-refresh") refresh(true).catch(() => {});
    });
    chrome.runtime.onInstalled?.addListener(() => refresh(true));
    chrome.runtime.onStartup?.addListener(() => refresh());
  }
  try {
    globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area === "local" && changes.sharedConfigCache)
        cache = changes.sharedConfigCache.newValue || cache;
    });
  } catch {
    /* Extension reload can revoke APIs on an old page. */
  }
  globalThis.RemoteConfig = {
    ready,
    refresh,
    start,
    get: (key) => Object.hasOwn(PATHS, key) ? cache?.data?.[key] || defaults[key] : undefined,
    version: () => cache?.version || "bundled",
  };
})();
