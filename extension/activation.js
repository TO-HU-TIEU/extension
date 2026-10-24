(() => {
  const SUPABASE = "https://gmwyhzbtrtpwpwssqync.supabase.co/functions/v1/admin-keys";
  const SHARED_KEY_HASH = "a5a9923303be2b9cd5dd1d0e5bc204530b02f86d7135c61ccf4a46064f04288e";
  const hash = async (value) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  const stored = localStorage.getItem("assistantActivation");
  const storedDeviceHash = localStorage.getItem("assistantActivationDeviceHash");
  const fallbackDevice = [
    navigator.userAgent,
    navigator.platform,
    navigator.language,
    navigator.hardwareConcurrency || "",
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen.width,
    screen.height,
    screen.colorDepth,
  ].join("|");
  let device = fallbackDevice;
  const config = globalThis.X_REPLY_CONFIG || {};
  const loadMachineIdentity = async () => {
    try {
      const response = await fetch(
        `${config.serverUrl || "http://127.0.0.1:8791"}/device-identity`,
        { headers: { "X-Local-Token": config.localToken || "" } },
      );
      if (!response.ok) throw new Error("companion unavailable");
      const identity = await response.json();
      if (identity.machineGuid && identity.installId)
        device = `${identity.machineGuid}|${identity.installId}`;
    } catch {}
  };
  const cover = document.createElement("div");
  cover.id = "assistant-activation-gate";
  cover.innerHTML =
    '<div class="activation-card"><h2>Kích hoạt Assistant</h2><p>Nhập activation key để sử dụng trên thiết bị này.</p><input id="activation-key" type="password" placeholder="Ví dụ: elonmusk" autocomplete="off"><button id="activation-submit">Kích hoạt</button><p id="activation-error"></p></div>';
  const style = document.createElement("style");
  style.textContent =
    "#assistant-activation-gate{position:fixed;inset:0;z-index:2147483647;background:#0b0f14;color:#eef3f8;display:flex;align-items:center;justify-content:center;font:14px system-ui}#assistant-activation-gate .activation-card{width:min(360px,calc(100vw - 40px));padding:24px;border:1px solid #334252;border-radius:14px;background:#151c24;box-shadow:0 16px 50px #0008}#assistant-activation-gate h2{margin:0 0 8px}#assistant-activation-gate p{color:#aab6c3}#assistant-activation-gate input{width:100%;box-sizing:border-box;padding:11px;border-radius:8px;border:1px solid #4a5b6d;background:#0d131a;color:#fff;margin:10px 0}#assistant-activation-gate button{width:100%;padding:11px;border:0;border-radius:8px;background:#1d9bf0;color:#fff;font-weight:600;cursor:pointer}#assistant-activation-error{color:#ff8b8b!important;min-height:18px}";
  const show = () => {
    document.documentElement.append(style, cover);
  };
  const done = () => cover.remove();
  const verify = async (keyHash, deviceHash = null) => {
    const response = await fetch(SUPABASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "validate",
        keyHash,
        deviceHash: deviceHash || (await hash(device)),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Activation key không hợp lệ");
    return data;
  };
  const isSharedActivationConflict = (error) =>
    String(error?.message || "").includes("Key đã được kích hoạt trên thiết bị khác");
  const start = async () => {
    await loadMachineIdentity();
    // Validate a previously activated device before mounting the gate. This
    // avoids flashing the key form every time the side panel is opened.
    if (stored) {
      try {
        await verify(stored, storedDeviceHash);
        localStorage.setItem("assistantActivationVerified", "1");
        return;
      } catch (error) {
        // Keep existing kieu.eth installations usable while an older deployed
        // edge function is still enforcing the former one-device rule.
        if (!(stored === SHARED_KEY_HASH && isSharedActivationConflict(error))) throw error;
        localStorage.setItem("assistantActivationVerified", "1");
        return;
      }
    }
    show();
    const input = cover.querySelector("#activation-key"),
      error = cover.querySelector("#activation-error"),
      submit = cover.querySelector("#activation-submit");
    submit.onclick = async () => {
      submit.disabled = true;
      error.textContent = "";
      try {
        const key = input.value.trim();
        if (!key) throw new Error("Vui lòng nhập activation key");
        const keyHash = await hash(key);
        const deviceHash = await hash(device);
        try {
          await verify(keyHash, deviceHash);
        } catch (error) {
          // The server has already matched this key, so only allow the
          // known shared license to bypass a stale one-device response.
          if (!(keyHash === SHARED_KEY_HASH && isSharedActivationConflict(error))) throw error;
        }
        localStorage.setItem("assistantActivation", keyHash);
        localStorage.setItem("assistantActivationDeviceHash", deviceHash);
        localStorage.setItem("assistantActivationVerified", "1");
        done();
      } catch (e) {
        error.textContent = e.message;
      } finally {
        submit.disabled = false;
      }
    };
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
