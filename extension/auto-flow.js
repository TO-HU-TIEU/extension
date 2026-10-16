/* Opt-in home-feed automation with a console dashboard. */
(() => {
  if (!globalThis.AutoBotMemory) {
    globalThis.AutoBotMemory = { startTime: Date.now(), processed: [], skipped: [], isPaused: false, speed: 0, consecutiveFailures: 0 };
  }
  const memory = globalThis.AutoBotMemory;
  globalThis.toggleAutoBotPause = () => { memory.isPaused = !memory.isPaused; console.log(`[Assistant Auto] ${memory.isPaused ? "Tạm dừng" : "Tiếp tục"}`); };
  let running = false,
    timer = 0,
    sessionStart = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    log = (...a) => console.log("[Assistant Auto]", ...a),
    processedKey = "assistantAutoProcessedV2",
    skippedKey = "assistantAutoSkippedV2",
    read = (k) => {
      try {
        return JSON.parse(localStorage.getItem(k) || "[]");
      } catch {
        return [];
      }
    },
    save = (k, v) => localStorage.setItem(k, JSON.stringify(v)),
    postId = (a) =>
      a
        ?.querySelector('a[href*="/status/"]')
        ?.href.match(/\/status\/(\d+)/)?.[1] || "",
    own = () =>
      document
        .querySelector('[data-testid^="UserAvatar-Container-"]')
        ?.getAttribute("data-testid")
        ?.replace("UserAvatar-Container-", "")
        .toLowerCase() || "";
  const notifyPanel = (enabled) => chrome.runtime.sendMessage({ type: "autoFlowState", enabled }).catch(() => {});
  const hasVietnamese = (text) => /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/iu.test(String(text || ""));
  const isVietnamesePost = (article) => {
    const textNode = article.querySelector('[data-testid="tweetText"]');
    const langNode = textNode?.closest("[lang]") || textNode?.querySelector("[lang]");
    const lang = langNode?.getAttribute("lang")?.toLowerCase();
    if (lang) return lang === "vi" || lang.startsWith("vi-");
    return hasVietnamese(textNode?.textContent || "");
  };
  const flowDelay = (ms) => {
    const speed = Number(memory.speed || 0);
    const jitter = 0.86 + Math.random() * 0.28;
    return Math.max(350, Math.round(ms * 1.35 * (1 - speed * 0.12) * jitter));
  };
  const domHasOwnReply = (handle) => {
    if (!handle) return false;
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    return articles.slice(1).some((article) =>
      article.querySelector('[data-testid="User-Name"]')?.textContent?.toLowerCase().includes(handle.toLowerCase()),
    );
  };
  async function returnHome() {
    if (location.href.includes("/home") || location.pathname === "/") return true;
    const home = document.querySelector('a[data-testid="AppTabBar_Home_Link"]');
    if (home) home.click();
    else history.back();
    for (let i = 0; i < 16; i++) {
      await sleep(500);
      if (location.href.includes("/home") || location.pathname === "/") {
        return true;
      }
    }
    return false;
  }
  function dashboard() {
    const p = read(processedKey),
      s = read(skippedKey),
      mins = Math.max(1, Math.floor((Date.now() - sessionStart) / 60000)),
      d = new Date(sessionStart),
      stamp = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      title = `[LIST] Processed: ${p.length} | Skipped: ${s.length} | Start: ${stamp} | Trung bình: ${(p.length / mins).toFixed(2)} trả lời/phút`;
    console.clear();
    console.groupCollapsed(`${title} (Click để xem chi tiết)`);
    console.log("Processed List:");
    console.table(p);
    console.log("Skipped List:");
    console.table(s);
    console.groupEnd();
    const box = document.getElementById("assistant-auto-dashboard");
    if (!box) return;
    const recent = p.slice(-5).reverse().map(x => `<button data-auto-url="${String(x.url).replace(/"/g, "&quot;")}" style="display:block;width:100%;margin:4px 0;padding:6px 8px;border:1px solid #38444d;border-radius:7px;background:#15202b;color:#1d9bf0;text-align:left;cursor:pointer">@${x.handle || "user"} · #${x.id}</button>`).join("") || "<small>Chưa có bài đã xử lý</small>";
    box.querySelector("[data-auto-stats]").innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px"><div style="padding:9px 10px;border-radius:10px;background:var(--xra-panel,#202832);border:1px solid var(--xra-border,#303842)"><small style="display:block;color:var(--xra-muted,#9aa4af)">Processed</small><strong style="font-size:22px;color:#20c997">${p.length}</strong></div><div style="padding:9px 10px;border-radius:10px;background:var(--xra-panel,#202832);border:1px solid var(--xra-border,#303842)"><small style="display:block;color:var(--xra-muted,#9aa4af)">Skipped</small><strong style="font-size:22px;color:#ff5864">${s.length}</strong></div></div><div style="color:var(--xra-muted,#9aa4af)">⏳ Bắt đầu: ${stamp} · ${running ? "Đang chạy" : "Đã dừng"}</div><div style="color:var(--xra-muted,#9aa4af)">⚡ Tốc độ: ${(p.length / mins).toFixed(2)} trả lời/phút</div>`;
    box.querySelector("[data-auto-list]").innerHTML = recent;
    box.querySelectorAll("[data-auto-url]").forEach(b => b.onclick = () => { location.href = b.dataset.autoUrl; });
  }
  function dashboardView() {
    let box = document.getElementById("assistant-auto-dashboard");
    if (box) return box;
    box = document.createElement("aside");
    box.id = "assistant-auto-dashboard";
    box.style.cssText = "position:fixed;right:16px;top:78px;width:340px;z-index:2147483647;background:var(--xra-surface,#171b21);color:var(--xra-text,#edf1f5);border:1px solid var(--xra-border,#303842);border-radius:16px;box-shadow:0 14px 34px #0007;font:13px/1.4 var(--xra-font,system-ui);padding:14px";
    box.innerHTML = '<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--xra-border,#303842)"><span style="display:flex;align-items:center;gap:8px"><img src="' + chrome.runtime.getURL("assets/logo.svg") + '" alt="Assistant" style="width:24px;height:24px"><strong style="font-size:16px;color:var(--xra-text,#edf1f5)">Auto Dashboard</strong></span><span style="display:flex;gap:5px"><button data-auto-minimize aria-label="Thu nhỏ" title="Thu nhỏ" style="width:28px;height:28px;border:1px solid var(--xra-border,#303842);border-radius:8px;background:transparent;color:inherit;cursor:pointer">−</button><button data-auto-close aria-label="Dừng" title="Dừng" style="width:28px;height:28px;border:1px solid var(--xra-border,#303842);border-radius:8px;background:transparent;color:inherit;cursor:pointer">×</button></span></div><div style="padding:10px 0 4px"><div style="display:flex;justify-content:space-between;font-size:12px"><b>⚡ Hệ số tốc độ</b><output data-auto-speed-value>0</output></div><input data-auto-speed type="range" min="-3" max="3" step="1" value="0" style="width:100%;accent-color:var(--xra-accent,#1d9bf0)"><div style="display:flex;justify-content:space-between;color:var(--xra-muted,#9aa4af);font-size:9px"><span>Chậm</span><span>Bình thường</span><span>Nhanh</span></div></div><label style="display:flex;align-items:center;gap:8px;padding:10px 0;color:var(--xra-text,#edf1f5);font-size:12px"><input data-auto-vietnamese type="checkbox" checked> Chỉ xử lý bài có nội dung tiếng Việt</label><div data-auto-stats style="font-size:11px;color:var(--xra-muted,#9aa4af);padding:4px 0 10px"></div><div data-auto-list style="max-height:180px;overflow:auto;padding:8px;border:1px solid var(--xra-border,#303842);border-radius:10px;background:var(--xra-bg,#101419)"></div><button data-auto-pause style="width:100%;margin-top:10px;padding:9px;border:0;border-radius:9px;background:#d64555;color:#fff;cursor:pointer;font:inherit">Dừng tự động</button>';
    document.documentElement.appendChild(box);
    box.querySelector("[data-auto-speed]").oninput = (event) => { memory.speed = Number(event.target.value); box.querySelector("[data-auto-speed-value]").value = memory.speed; box.querySelector("[data-auto-speed-value]").textContent = memory.speed; };
    box.querySelector("[data-auto-pause]").onclick = () => { stop("Đã dừng theo yêu cầu"); box.remove(); notifyPanel(false); };
    box.querySelector("[data-auto-close]").onclick = () => { stop("Đã dừng theo yêu cầu"); box.remove(); notifyPanel(false); };
    box.querySelector("[data-auto-minimize]").onclick = () => { box.dataset.minimized = "true"; box.style.width = "48px"; box.style.height = "48px"; box.style.padding = "6px"; box.innerHTML = '<button data-auto-restore aria-label="Mở dashboard" title="Mở dashboard" style="width:36px;height:36px;border:0;border-radius:50%;background:var(--xra-accent,#1d9bf0);color:#fff;font-size:20px;cursor:pointer">↗</button>'; box.querySelector("[data-auto-restore]").onclick = () => { box.remove(); dashboardView(); dashboard(); }; };
    return box;
  }
  function stop(reason = "Đã dừng") {
    running = false;
    clearTimeout(timer);
    log(reason);
    dashboard();
    notifyPanel(false);
  }
  async function loop() {
    if (!running) return;
    while (memory.isPaused && running) await sleep(250);
    if (!location.href.includes("/home") && location.pathname !== "/") {
      stop("Đã dừng: không còn ở trang Home");
      return;
    }
    const p = read(processedKey),
      s = read(skippedKey),
      done = new Set([...p, ...s].map((x) => x.id)),
      me = own();
    for (const article of document.querySelectorAll(
      'article[data-testid="tweet"]',
    )) {
      if (article.querySelector('[data-testid="placementTracking"]')) continue;
      const id = postId(article),
        link = article.querySelector('a[href*="/status/"]'),
        author = link?.href
          .match(/x\.com\/([^/]+)\/status/)?.[1]
          ?.toLowerCase();
      if (!id || done.has(id) || author === me) continue;
      const onlyVietnamese = document.querySelector("[data-auto-vietnamese]")?.checked !== false;
      if (onlyVietnamese && !isVietnamesePost(article)) continue;
      const item = { id, url: link.href };
      log("Đang xử lý:", id, link.href);
      link?.click();
      let opened = false;
      for (let wait = 0; wait < 20; wait++) {
        await sleep(500);
        if (location.pathname.includes("/status/")) {
          opened = true;
          break;
        }
      }
      if (!opened) {
        s.push({ ...item, reason: "Không mở được bài viết" });
        save(skippedKey, s);
        log("Bỏ qua:", id, "Không mở được bài viết");
        continue;
      }
      await sleep(2000);
      let replyButton = null;
      for (let scrollTry = 0; scrollTry < 20; scrollTry++) {
        replyButton = document.querySelector(
          ".xra-button.xra-generate,.xra-button.xra-sync",
        );
        if (replyButton) {
          replyButton.scrollIntoView({ behavior: "smooth", block: "center" });
          break;
        }
        window.scrollBy({ top: 520, behavior: "smooth" });
        await sleep(500);
      }
      await sleep(900);
      const currentDone = new Set([...read(processedKey), ...read(skippedKey)].map((entry) => entry.id));
      const myHandle = own();
      if (currentDone.has(id) || domHasOwnReply(myHandle)) {
        log("Bỏ qua: bài đã có trong lịch sử hoặc đã có reply của tài khoản hiện tại");
        await returnHome();
        dashboard();
        break;
      }
      log("Status: Ban đầu (đang chờ giao diện và kết quả gợi ý)");
      let button = null;
      while (running) {
        button = document.querySelector(
          ".xra-button.xra-generate,.xra-button.xra-sync",
        );
        if (button && !button.disabled) break;
        // Do not click X's native Reply button here: that opens the global
        // compose dialog and steals the target article from the assistant.
        // Wait for the assistant content UI to mount instead.
      await sleep(flowDelay(700));
      }
      if (!running) return;
      if (button && !button.disabled) {
        button.click();
        log("Status: Normal (đã yêu cầu tạo gợi ý)");
        let suggestion = null;
        let providerError = "";
        while (running && !suggestion) {
          await sleep(flowDelay(700));
          suggestion = document.querySelector(".xra-results .xra-suggestion-wrap .xra-chip-main");
          const errorNode = document.querySelector(".xra-error,[role=alert],.xra-status-error");
          providerError = errorNode?.textContent?.trim() || "";
          if (providerError) break;
        }
        if (providerError) {
          memory.consecutiveFailures += 1;
          log(`Lỗi gợi ý (${memory.consecutiveFailures}/3):`, providerError);
          await returnHome();
          if (memory.consecutiveFailures >= 3) {
            stop("Đã dừng: 3 bài liên tiếp không trả lời được");
            return;
          }
          dashboard();
          break;
        }
        if (suggestion) {
          const suggestions = document.querySelectorAll(
            ".xra-results .xra-suggestion-wrap",
          );
          log("Result: " + suggestions.length);
          log("Choose: 1");
          suggestion.click();
          memory.consecutiveFailures = 0;
          p.push(item);
          save(processedKey, p);
          log(
            "Done [Total done: " +
              p.length +
              " | Total skip: " +
              s.length +
              "]",
          );
          await sleep(1800);
        }
      }
      dashboard();
      log("Đang quay về Home để chuyển bài tiếp theo");
      const returnedHome = await returnHome();
      if (!returnedHome) log("Cảnh báo: chưa xác nhận được Home, tiếp tục kiểm tra lại");
      await sleep(flowDelay(1200));
      break;
    }
    if (running) {
      window.scrollBy({ top: 450, behavior: "smooth" });
      timer = setTimeout(loop, flowDelay(2200));
    }
  }
  chrome.runtime.onMessage.addListener((m, _s, send) => {
    if (m?.type !== "autoReplyFlow") return;
    stop("Đã reset phiên");
    if (m.enabled) {
      sessionStart = Date.now();
      running = true;
      notifyPanel(true);
      log("Bắt đầu phiên tự động");
      dashboardView();
      dashboard();
      (async () => {
        if (!location.href.includes("/home") && location.pathname !== "/") {
          log("Đang chuyển về Home");
          document.querySelector("a[data-testid=AppTabBar_Home_Link]")?.click();
          await sleep(4000);
        }
        loop().catch((e) => {
          log("Lỗi:", e);
          stop("Đã dừng do lỗi");
        });
      })();
    }
    send({ ok: true });
    return false;
  });
})();

