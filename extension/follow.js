(function () {
  if (globalThis.__assistantFollowLoaded) return;
  globalThis.__assistantFollowLoaded = true;
  const currentMode = () =>
    location.pathname.match(/^\/[^/]+\/(following|followers)\/?$/i)?.[1]?.toLowerCase();
  const text = (n) =>
    String(n || "")
      .replace(/\s+/g, " ")
      .trim();
  const isSuggested = (row) => {
    if (row.closest('aside,[data-testid="sidebarColumn"],[data-testid="UserRecommendations"]'))
      return true;
    for (
      let node = row.parentElement, depth = 0;
      node && node !== document.body && depth < 7;
      node = node.parentElement, depth++
    ) {
      const label = `${node.getAttribute("aria-label") || ""} ${node.textContent || ""}`;
      if (
        /Bạn có thể thích|Who to follow|You might like|Suggested for you|Đề xuất cho bạn/i.test(
          label,
        ) &&
        node.querySelectorAll('[data-testid="UserCell"]').length <= 25
      )
        return true;
    }
    return false;
  };
  const read = () =>
    Array.from(
      document.querySelectorAll('[data-testid="UserCell"],article[data-testid="UserCell"]'),
    )
      .filter((row) => !isSuggested(row))
      .map((row) => {
        const link = row.querySelector('a[href^="/"]'),
          href = link?.href || "";
        const handle = text(link?.getAttribute("href")?.replace(/^\//, ""));
        if (!handle) return null;
        const buttons = [...row.querySelectorAll('button,[role="button"]')],
          followButton = buttons.find((x) =>
            /Follow|Theo dõi|Following|Đang theo dõi/i.test(text(x.textContent)),
          ),
          avatarContainer =
            row.querySelector('[data-testid^="UserAvatar-Container"]') ||
            row.querySelector('[data-testid*="Avatar"]'),
          styleAvatar = [
            ...row.querySelectorAll('[style*="background-image"],[style*="profile_images"]'),
          ].find((x) => /profile_images|pbs\.twimg\.com/i.test(x.getAttribute("style") || "")),
          styleUrl =
            styleAvatar?.style?.backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/i)?.[1] || "",
          imageUrls = [...row.querySelectorAll("img")]
            .flatMap((img) => [
              img.currentSrc,
              img.src,
              img.getAttribute("src"),
              img.getAttribute("data-src"),
              (img.getAttribute("srcset") || "").split(",")[0]?.trim().split(/\s+/)[0],
            ])
            .filter(Boolean),
          avatarUrl =
            imageUrls.find(
              (url) =>
                /profile_images|pbs\.twimg\.com/i.test(url) &&
                !/default_profile|default_avatar|avatar_default/i.test(url),
            ) || styleUrl,
          hasAvatar =
            !!avatarUrl && !/default_profile|default_avatar|avatar_default/i.test(avatarUrl),
          tick = row.querySelector(
            '[data-testid*="icon-verified" i],[aria-label*="verified" i],[aria-label*="xác nhận" i],svg[aria-label*="Verified" i]',
          );
        return {
          id: href || handle,
          name: text(row.querySelector('[dir="ltr"] span')?.textContent || handle),
          handle: "@" + handle.replace(/^@/, ""),
          bio: (() => {
            const direct = row.querySelector(
              '[data-testid="UserDescription"],[data-testid="UserDescription"] div',
            );
            const original =
              direct?.getAttribute("data-original-text") ||
              direct?.getAttribute("data-text") ||
              direct?.getAttribute("title") ||
              direct?.querySelector("[lang]")?.textContent ||
              "";
            const candidate = text(original || direct?.textContent || "");
            if (candidate && !/Nhấp để|Theo dõi|Following|Follow|Đang theo dõi/i.test(candidate))
              return candidate;
            return (
              [
                ...row.querySelectorAll(
                  '[data-testid="UserDescription"] [lang],[data-testid="UserDescription"] [dir="auto"]',
                ),
              ]
                .map((n) => text(n.textContent))
                .find((v) => v && !/Nhấp để|Theo dõi|Following|Follow|Đang theo dõi/i.test(v)) || ""
            );
          })(),
          avatarUrl: hasAvatar ? avatarUrl : "",
          avatar: hasAvatar,
          tick:
            tick?.getAttribute("aria-label") ||
            tick?.getAttribute("data-testid") ||
            tick?.className?.baseVal ||
            "",
          tickType: /gold|business|yellow|d18800|32-a|32-b/i.test(tick?.outerHTML || "")
            ? "gold"
            : /gray|grey|silver|829aab/i.test(tick?.outerHTML || "")
              ? "gray"
              : "blue",
          verified: !!tick,
          followsYou: /Follows you|Theo dõi bạn/i.test(row.textContent || ""),
          followAction: text(followButton?.textContent || "Theo dõi"),
          isFollowing: /Following|Đang theo dõi/i.test(text(followButton?.textContent || "")),
        };
      })
      .filter(Boolean);
  let stopped = false,
    contextAlive = true,
    collectMultiplier = 1,
    profileKey = location.pathname.split("/")[1] || "",
    observedItems = new Map();
  function progress(mode, all) {
    if (!contextAlive) return;
    profileKey = location.pathname.split("/")[1] || profileKey;
    for (const item of all.values()) observedItems.set(item.id, item);
    try {
      const pending = chrome.runtime.sendMessage({
        type: "followProgress",
        mode,
        profile: profileKey,
        items: [...observedItems.values()],
        count: observedItems.size,
      });
      pending?.catch?.((error) => {
        if (
          /context invalidated|receiving end does not exist/i.test(String(error?.message || error))
        )
          contextAlive = false;
      });
    } catch (error) {
      if (/context invalidated|receiving end does not exist/i.test(String(error?.message || error)))
        contextAlive = false;
    }
  }
  async function collect() {
    const mode = currentMode();
    if (!mode)
      return { ok: false, error: "Hãy mở trang Following hoặc Followers của một profile X." };
    stopped = false;
    collectMultiplier = 1;
    observedItems = new Map();
    const all = new Map();
    let stable = 0,
      last = 0;
    for (let i = 0; i < 250 && !stopped; i++) {
      for (const item of read()) all.set(item.id, item);
      progress(mode, all);
      const before = scrollY,
        multiplier = collectMultiplier,
        step = Math.max(320, Math.min(innerHeight * 0.9, innerHeight * 0.58 * multiplier));
      window.scrollBy({ top: step, left: 0, behavior: "smooth" });
      await new Promise((r) => setTimeout(r, Math.max(260, 550 / multiplier)));
      if (all.size === last && Math.abs(scrollY - before) < 20) stable++;
      else stable = 0;
      last = all.size;
      if (stable >= 6) break;
    }
    return {
      ok: true,
      mode,
      profile: profileKey,
      items: [...observedItems.values(), ...all.values()].filter(
        (item, index, array) => array.findIndex((x) => x.id === item.id) === index,
      ),
      count: observedItems.size || all.size,
      stopped,
    };
  }
  let scrollTimer;
  const reportVisible = () => {
    const mode = currentMode();
    if (!mode) return;
    const visible = new Map(read().map((x) => [x.id, x]));
    if (visible.size) progress(mode, visible);
  };
  const scheduleReport = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(reportVisible, 180);
  };
  addEventListener("scroll", scheduleReport, { passive: true, capture: true });
  setTimeout(() => {
    const mode = currentMode();
    if (mode) {
      const all = new Map(read().map((x) => [x.id, x]));
      if (all.size) progress(mode, all);
    }
  }, 700);
  addEventListener(
    "click",
    (event) => {
      const button = event.target.closest('button,[role="button"]');
      if (!button) return;
      const label = text(button.textContent || button.getAttribute("aria-label"));
      if (!/Follow|Theo dõi/i.test(label) || /Following|Đang theo dõi/i.test(label)) return;
      const row = button.closest('[data-testid="UserCell"],article[data-testid="UserCell"]');
      if (!row) return;
      setTimeout(() => {
        const link = row.querySelector('a[href^="/"]');
        const handle = link?.getAttribute("href")?.replace(/^\//, "");
        const item = read().find(
          (x) =>
            String(x.handle || "")
              .replace(/^@/, "")
              .toLowerCase() === String(handle || "").toLowerCase(),
        );
        if (item)
          chrome.runtime
            .sendMessage({
              type: "followTracked",
              item: { ...item, isFollowing: true, followedAt: Date.now() },
            })
            .catch(() => {});
      }, 900);
    },
    true,
  );
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const mode = currentMode();
    if (message?.type === "followPageInfo") {
      sendResponse({ ok: !!mode, mode });
      return;
    }
    if (message?.type === "followReadCurrent") {
      const currentModeName = currentMode();
      profileKey = location.pathname.split("/")[1] || profileKey;
      const items = read();
      sendResponse({
        ok: !!currentModeName,
        mode: currentModeName,
        profile: profileKey,
        items,
        count: items.length,
      });
      return;
    }
    if (message?.type === "followStop") {
      stopped = true;
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "followUnfollow") {
      const username = String(message.username || "")
        .replace(/^@/, "")
        .trim();
      if (!username) {
        sendResponse({ ok: false, error: "Thiếu username." });
        return;
      }
      const token = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1];
      fetch("/i/api/1.1/friendships/destroy.json", {
        method: "POST",
        credentials: "include",
        headers: {
          authorization:
            "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
          "content-type": "application/x-www-form-urlencoded",
          "x-csrf-token": decodeURIComponent(token || ""),
        },
        body: new URLSearchParams({ screen_name: username }).toString(),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => null);
          if (!r.ok || data?.errors?.length)
            throw Error(data?.errors?.[0]?.message || `API ${r.status}`);
          sendResponse({ ok: true, username });
        })
        .catch(async (error) => {
          const row = [
            ...document.querySelectorAll(
              '[data-testid="UserCell"],article[data-testid="UserCell"]',
            ),
          ].find((node) => {
            const a = node.querySelector('a[href^="/"]');
            return (
              a?.getAttribute("href")?.replace(/^\//, "").toLowerCase() === username.toLowerCase()
            );
          });
          const fallback = row?.querySelector(
            '[data-testid$="-unfollow"],button[aria-label*="Đang theo dõi" i],button[aria-label*="Following" i]',
          );
          if (fallback) {
            fallback.click();
            sendResponse({ ok: true, username, fallback: true });
            return;
          }
          sendResponse({ ok: false, error: error.message || "Không thể ngừng theo dõi." });
        });
      return true;
    }
    if (message?.type === "followCollect") {
      collect().then(sendResponse);
      return true;
    }
  });
})();
