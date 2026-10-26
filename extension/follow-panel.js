(() => {
  const $ = (id) => document.getElementById(id);
  let lists = { following: [], followers: [] },
    profiles = { following: "", followers: "" },
    unfollowed = {},
    unfollowedItems = {},
    recentFollows = [],
    unfollowedView = false,
    recentView = false,
    mode = "following",
    filters = new Set(),
    sortMode = "default",
    running = false,
    autoFollowTabId = null,
    autoFollowState = null;
  const AUTO_FOLLOW_SOURCE = "https://x.com/i/jf/creators/inspiration/top_posts";
  const stateKey = (m, p) => `${m}:${p}`,
    normalizeHandle = (value) =>
      String(value || "")
        .replace(/^@/, "")
        .trim()
        .toLowerCase(),
    removeRecent = (handle) => {
      const key = normalizeHandle(handle);
      const next = recentFollows.filter((x) => normalizeHandle(x.handle) !== key);
      if (next.length !== recentFollows.length) {
        recentFollows = next;
        chrome.storage.local.set({ followRecent: recentFollows });
      }
    };
  const ago = (ts) => {
    const seconds = Math.max(0, Math.floor((Date.now() - Number(ts || Date.now())) / 1000));
    if (seconds < 60) return `${seconds}s trước`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  };
  const applyPersisted = (m, p, item) => {
    const key = stateKey(m, p),
      set = new Set(unfollowed[key] || []);
    return set.has(String(item.handle || "").replace(/^@/, ""))
      ? { ...item, isFollowing: false, followAction: "Theo dõi" }
      : item;
  };
  chrome.storage.local
    .get(["followUnfollowed", "followUnfollowedItems", "followRecent"])
    .then(({ followUnfollowed, followUnfollowedItems, followRecent }) => {
      unfollowed = followUnfollowed || {};
      unfollowedItems = followUnfollowedItems || {};
      recentFollows = Array.isArray(followRecent) ? followRecent : [];
      render();
    });
  const valid = (url) =>
    /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/(?:following|followers)\/?(?:\?|$)/i.test(
      url || "",
    );
  const autoFollowValid = (url) =>
    /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/i\/jf\/creators\/inspiration\/top_posts(?:\?|$)/i.test(
      url || "",
    );
  const escapeHtml = (value) =>
    String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const renderAutoFollowLog = (logs = []) => {
    const node = $("autoFollowLog");
    if (!node) return;
    node.replaceChildren(
      ...logs.slice().reverse().map((entry) => {
        const details = document.createElement("details"),
          summary = document.createElement("summary"),
          list = document.createElement("ul");
        summary.textContent = `${entry.author || "unknown"} · ${entry.followed || 0}/${entry.total || 0} · ${entry.postText || entry.postId || "Bài viết"}`;
        list.innerHTML = (entry.people || [])
          .map((person) => `<li>${escapeHtml(person.name || person.handle)} (${escapeHtml(person.handle || "")}) · ${new Date(person.followedAt || Date.now()).toLocaleTimeString("vi-VN")}</li>`)
          .join("");
        details.append(summary, list);
        return details;
      }),
    );
  };
  const renderAutoFollowState = (state, status) => {
    autoFollowState = state || autoFollowState || {};
    const toggle = $("autoFollowToggle"),
      stop = $("autoFollowStop"),
      statusNode = $("autoFollowStatus");
    if (toggle && autoFollowState.enabled !== undefined) toggle.checked = !!autoFollowState.enabled;
    if (stop) stop.hidden = !autoFollowState.enabled;
    if (statusNode) statusNode.textContent = status || (autoFollowState.enabled ? "Đang chạy…" : "Đang tắt");
    renderAutoFollowLog(autoFollowState.logs || []);
  };
  const waitForTabComplete = (tabId, timeout = 15000) =>
    new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      };
      const listener = (id, change) => {
        if (id === tabId && change.status === "complete") done();
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(done, timeout);
    });
  const ensureAutoFollowSourceTab = async (tab) => {
    let current = await chrome.tabs.get(tab.id).catch(() => tab);
    if (autoFollowValid(current?.url)) return current;
    await chrome.tabs.update(tab.id, { url: AUTO_FOLLOW_SOURCE });
    await waitForTabComplete(tab.id);
    current = await chrome.tabs.get(tab.id).catch(() => tab);
    return current;
  };
  const autoFollowStart = async () => {
    const toggle = $("autoFollowToggle"),
      onlyVietnamese = $("autoFollowVietnamese")?.checked !== false;
    toggle.disabled = true;
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      let tab = tabs.find((item) => autoFollowValid(item.url));
      if (!tab)
        tab =
          tabs.find(
            (item) =>
              item.active && /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(item.url || ""),
          ) || tabs.find((item) => /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(item.url || ""));
      if (!tab) throw new Error("Mở một tab X trước khi bật tự động follow.");
      autoFollowTabId = tab.id;
      await chrome.runtime.sendMessage({
        type: "autoFollowSetTab",
        tabId: tab.id,
        enabled: true,
        onlyVietnamese,
      });
      tab = await ensureAutoFollowSourceTab(tab);
      if (!autoFollowValid(tab.url)) throw new Error("Không xác nhận được tab Top Posts sau khi chuyển trang.");
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["follow.js"] });
      } catch {}
      await chrome.tabs.sendMessage(tab.id, { type: "autoFollowStart", onlyVietnamese }).catch(() => {});
      renderAutoFollowState({ ...(autoFollowState || {}), enabled: true }, "Đang mở Top Posts và chuẩn bị quét…");
    } catch (error) {
      if (toggle) toggle.checked = false;
      renderAutoFollowState({ ...(autoFollowState || {}), enabled: false }, error.message || "Không thể bật tự động follow.");
    } finally {
      toggle.disabled = false;
    }
  };
  const autoFollowStop = async () => {
    const toggle = $("autoFollowToggle");
    if (toggle) toggle.disabled = true;
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const targets = tabs.filter((tab) => tab.id === autoFollowTabId || autoFollowValid(tab.url));
    if (autoFollowTabId)
      await chrome.runtime.sendMessage({ type: "autoFollowSetTab", tabId: autoFollowTabId, enabled: false }).catch(() => {});
    await Promise.all(targets.map((tab) => chrome.tabs.sendMessage(tab.id, { type: "autoFollowStop" }).catch(() => {})));
    autoFollowState = { ...(autoFollowState || {}), enabled: false, phase: "stopped" };
    renderAutoFollowState(autoFollowState, "Đã dừng tự động follow.");
    if (toggle) {
      toggle.checked = false;
      toggle.disabled = false;
    }
  };
  const hydrateAutoFollow = async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const source = tabs.find((tab) => autoFollowValid(tab.url));
    if (!source?.id) return;
    autoFollowTabId = source.id;
    const result = await chrome.tabs.sendMessage(source.id, { type: "autoFollowIdentity" }).catch(() => null);
    if (result?.state) renderAutoFollowState(result.state, result.state.enabled ? "Đang chạy…" : "Đang tắt");
  };
  const active = () => {
    for (const id of ["replyModule", "contentModule", "quoteModule", "followModule"])
      $(id)?.classList.toggle("active", id === "followModule");
    for (const id of [
      "workspace",
      "xWorkspace",
      "contentWorkspace",
      "quoteWorkspace",
      "followWorkspace",
    ]) {
      const node = $(id);
      if (node) node.hidden = id !== "followWorkspace";
    }
    $("replySettings").hidden = true;
  };
  function render() {
    document
      .querySelectorAll("[data-follow-filter]")
      .forEach((b) => b.classList.toggle("active", filters.has(b.dataset.followFilter)));
    const q = ($("followSearch").value || "").trim().toLocaleLowerCase(),
      key = stateKey(mode, profiles[mode]),
      showUnfollowed = filters.has("unfollowed"),
      source = recentView
        ? recentFollows
        : showUnfollowed
          ? unfollowedItems[key] || []
          : lists[mode] || [],
      uf = document.querySelector('[data-follow-filter="unfollowed"]');
    uf.hidden = !(unfollowedItems[key] || []).length;
    const matches = (x) =>
      (!q || `${x.name} ${x.handle}`.toLocaleLowerCase().includes(q)) &&
      (!filters.size ||
        [...filters].every((f) =>
          f === "tickNone"
            ? !x.verified
            : f === "tickGray"
              ? x.tickType === "gray"
              : f === "tickBlue"
                ? x.tickType === "blue"
                : f === "tickGold"
                  ? x.tickType === "gold"
                  : f === "followsYou"
                    ? x.followsYou
                    : f === "notFollowsYou"
                      ? !x.followsYou
                      : f === "isFollowing"
                        ? x.isFollowing
                        : f === "unfollowed"
                          ? true
                          : !x.avatar,
        ));
    const view = source.filter(matches);
    const sortRows = (rows) => {
      if (sortMode === "name")
        return rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
      if (sortMode === "newest")
        return rows.sort((a, b) => Number(b.followedAt || 0) - Number(a.followedAt || 0));
      if (sortMode === "oldest")
        return rows.sort((a, b) => Number(a.followedAt || 0) - Number(b.followedAt || 0));
      return rows;
    };
    sortRows(view);
    $("clearFollowList").hidden = view.length === 0;
    const tabSource = (m) => {
      const k = stateKey(m, profiles[m]);
      return filters.has("unfollowed") ? unfollowedItems[k] || [] : lists[m] || [];
    };
    $("followingTab").textContent =
      `Đang theo dõi (${tabSource("following").filter(matches).length})`;
    $("followersTab").textContent =
      `Người theo dõi (${tabSource("followers").filter(matches).length})`;
    $("recentTab").textContent = `Đã theo dõi gần đây (${recentFollows.filter(matches).length})`;
    $("followFilters").hidden = false;
    $("followList").replaceChildren(
      ...view.map((x) => {
        const r = document.createElement("div");
        r.className = "follow-row";
        r.dataset.handle = x.handle || "";
        const image = x.avatarUrl
            ? `<img src="${x.avatarUrl}" alt="" loading="lazy">`
            : '<img src="https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png" alt="" loading="lazy" class="default-avatar">',
          tick = x.tick
            ? `<i class="follow-tick ${x.tickType || "blue"}" title="${x.tick}">${globalThis.AssistantIcons?.svg("badge-check") || ""}</i>`
            : "";
        const profileHandle = normalizeHandle(x.handle),
          profileHref = "https://x.com/" + encodeURIComponent(profileHandle);
        r.innerHTML = `<a class="follow-profile-link follow-avatar-link" href="${profileHref}" aria-label="Mở hồ sơ ${x.name || x.handle}"><span class="follow-avatar">${image}</span></a><span class="follow-person"><a class="follow-profile-link follow-name-link" href="${profileHref}"><b>${x.name} ${tick}</b></a><span class="follow-handle-line"><a class="follow-profile-link follow-handle-link" href="${profileHref}"><small>${x.handle}</small></a>${x.followsYou ? '<span class="follows-you">Theo dõi bạn</span>' : ""}</span>${recentView ? `<small class="recent-age">Đã theo dõi ${ago(x.followedAt)}</small>` : `<em>${x.bio || ""}</em>`}</span><span class="follow-actions"><span class="follow-action-buttons">${x.isFollowing ? '<button class="unfollow-button icon" type="button" aria-label="Ngừng theo dõi" title="Ngừng theo dõi"></button>' : ""}${recentView ? '<button class="recent-remove" type="button" aria-label="Xoá khỏi danh sách gần đây" title="Xoá khỏi danh sách gần đây"></button>' : ""}</span></span>`;
        const unfollowButton = r.querySelector(".unfollow-button");
        if (unfollowButton)
          unfollowButton.innerHTML = globalThis.AssistantIcons?.svg("unfollow") || "";
        const recentRemove = r.querySelector(".recent-remove");
        if (recentRemove) recentRemove.innerHTML = globalThis.AssistantIcons?.svg("delete") || "";
        return r;
      }),
    );
  }
  async function page() {
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0],
      ok = !!tab?.url && valid(tab.url);
    $("followPageHint").textContent = "";
    $("getFollowList").disabled = false;
    if (ok && !running) {
      let result = await chrome.tabs
        .sendMessage(tab.id, { type: "followReadCurrent" })
        .catch(() => null);
      if (!result?.ok) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["follow.js"] });
          result = await chrome.tabs
            .sendMessage(tab.id, { type: "followReadCurrent" })
            .catch(() => null);
        } catch {}
      }
      if (result?.ok && result.mode) {
        const old = profiles[result.mode] === result.profile ? lists[result.mode] : [],
          map = new Map(old.map((x) => [x.id, x]));
        for (const item of result.items || []) {
          const next = applyPersisted(result.mode, result.profile, item);
          map.set(next.id, next);
        }
        profiles[result.mode] = result.profile;
        lists[result.mode] = [...map.values()];
        if (result.mode === mode) render();
      }
    }
    render();
  }
  function setMode(next) {
    mode = next;
    filters.clear();
    $("followSearch").value = "";
    $("followingTab").classList.toggle(
      "active",
      mode === "following" && !unfollowedView && !recentView,
    );
    $("followersTab").classList.toggle(
      "active",
      mode === "followers" && !unfollowedView && !recentView,
    );
    $("recentTab").classList.toggle("active", recentView);
    render();
  }
  $("followModule").onclick = () => {
    active();
    page();
    hydrateAutoFollow().catch(() => {});
  };
  $("autoFollowToggle")?.addEventListener("change", () => {
    if ($("autoFollowToggle").checked) autoFollowStart();
    else autoFollowStop();
  });
  $("autoFollowStop")?.addEventListener("click", () => autoFollowStop());
  $("autoFollowVietnamese")?.addEventListener("change", async () => {
    if (!$("autoFollowToggle")?.checked || !autoFollowTabId) return;
    await chrome.runtime.sendMessage({
      type: "autoFollowSetTab",
      tabId: autoFollowTabId,
      enabled: true,
      onlyVietnamese: $("autoFollowVietnamese").checked,
    });
    chrome.tabs.sendMessage(autoFollowTabId, {
      type: "autoFollowStart",
      onlyVietnamese: $("autoFollowVietnamese").checked,
    }).catch(() => {});
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "autoFollowProgress") return;
    if (message.sourceTabId && autoFollowTabId && Number(message.sourceTabId) !== Number(autoFollowTabId)) return;
    autoFollowTabId ||= message.sourceTabId || null;
    renderAutoFollowState(message.state || {}, message.status);
  });
  $("clearFollowList").onclick = () => {
    if (!confirm("Làm sạch danh sách hiện tại?")) return;
    if (recentView) {
      recentFollows = [];
      chrome.storage.local.set({ followRecent: recentFollows });
    } else if (filters.has("unfollowed")) {
      const key = stateKey(mode, profiles[mode]);
      unfollowedItems[key] = [];
      unfollowed[key] = [];
      chrome.storage.local.set({
        followUnfollowed: unfollowed,
        followUnfollowedItems: unfollowedItems,
      });
    } else {
      lists[mode] = [];
      profiles[mode] = "";
    }
    render();
    $("followStatus").textContent = "Đã xoá danh sách hiện tại.";
  };
  $("followingTab").onclick = () => {
    unfollowedView = false;
    recentView = false;
    filters.clear();
    setMode("following");
  };
  $("followersTab").onclick = () => {
    unfollowedView = false;
    recentView = false;
    filters.clear();
    setMode("followers");
  };
  $("recentTab").onclick = () => {
    unfollowedView = false;
    recentView = true;
    filters.clear();
    $("followingTab").classList.remove("active");
    $("followersTab").classList.remove("active");
    $("recentTab").classList.add("active");
    render();
  };
  $("followSearch").oninput = render;
  $("followSort").onchange = () => {
    sortMode = $("followSort").value || "default";
    render();
  };
  $("followList").onclick = async (e) => {
    const row = e.target.closest(".follow-row");
    if (!row) return;
    const handle = row.dataset.handle?.replace(/^@/, "");
    if (e.target.closest(".unfollow-button")) {
      const btn = e.target.closest(".unfollow-button");
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      const tabs = await chrome.tabs.query({});
      let tab = tabs.find((t) =>
          /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(t.url || ""),
        ),
        temporary = false;
      if (!tab) {
        tab = await chrome.tabs.create({ url: "https://x.com/home", active: false });
        temporary = true;
        await new Promise((resolve) => {
          const listener = (id, change) => {
            if (id === tab.id && change.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 5000);
        });
      }
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["follow.js"] });
      } catch {}
      const result = await chrome.tabs
        .sendMessage(tab.id, { type: "followUnfollow", username: handle })
        .catch((error) => ({ ok: false, error: error.message }));
      if (temporary) chrome.tabs.remove(tab.id).catch(() => {});
      if (result?.ok) {
        const username = normalizeHandle(handle),
          key = stateKey(mode, profiles[mode]),
          base =
            (lists[mode] || []).find((x) => normalizeHandle(x.handle) === username) ||
            recentFollows.find((x) => normalizeHandle(x.handle) === username) ||
            {};
        const record = {
          ...base,
          handle: base.handle || "@" + username,
          isFollowing: false,
          followAction: "Theo dõi",
        };
        unfollowed[key] = [...new Set([...(unfollowed[key] || []), username])];
        unfollowedItems[key] = [
          ...(unfollowedItems[key] || []).filter((x) => normalizeHandle(x.handle) !== username),
          record,
        ];
        lists[mode] = (lists[mode] || []).filter((x) => normalizeHandle(x.handle) !== username);
        removeRecent(username);
        await chrome.storage.local.set({
          followUnfollowed: unfollowed,
          followUnfollowedItems: unfollowedItems,
        });
        row.classList.add("unfollowed");
        render();
        return;
      } else {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = globalThis.AssistantIcons?.svg("unfollow") || "";
        btn.title = "Ngừng theo dõi";
        $("followStatus").textContent = result?.error || "Không thể ngừng theo dõi.";
      }
      return;
    }
    if (e.target.closest(".recent-remove")) {
      removeRecent(handle);
      render();
      return;
    }
    const profile = e.target.closest(".follow-profile-link");
    if (!profile) return;
    e.preventDefault();
    chrome.tabs.create({ url: profile.href });
  };
  document.querySelectorAll("[data-follow-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        const f = b.dataset.followFilter,
          relation = f === "followsYou" || f === "notFollowsYou",
          tick = ["tickNone", "tickGray", "tickBlue", "tickGold"].includes(f);
        if (relation) filters.delete(f === "followsYou" ? "notFollowsYou" : "followsYou");
        if (tick)
          ["tickNone", "tickGray", "tickBlue", "tickGold"]
            .filter((x) => x !== f)
            .forEach((x) => filters.delete(x));
        filters.has(f) ? filters.delete(f) : filters.add(f);
        render();
      }),
  );
  const trackRecent = (item) => {
    const handle = String(item?.handle || "")
      .replace(/^@/, "")
      .trim();
    if (!handle) return;
    const existing = recentFollows.find(
      (x) =>
        String(x.handle || "")
          .replace(/^@/, "")
          .toLowerCase() === handle.toLowerCase(),
    );
    const record = {
      ...(existing || {}),
      ...item,
      handle: "@" + handle,
      isFollowing: true,
      followedAt: existing?.followedAt || Date.now(),
      backFollow: existing?.backFollow || false,
    };
    recentFollows = [
      record,
      ...recentFollows.filter(
        (x) =>
          String(x.handle || "")
            .replace(/^@/, "")
            .toLowerCase() !== handle.toLowerCase(),
      ),
    ];
    chrome.storage.local.set({ followRecent: recentFollows });
    if (recentView) render();
  };
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "followTracked") {
      trackRecent(message.item);
      return;
    }
    if (message?.type !== "followProgress") return;
    const old = profiles[message.mode] === message.profile ? lists[message.mode] : [],
      map = new Map(old.map((x) => [x.id, x]));
    for (const item of message.items || []) {
      const next = applyPersisted(message.mode, message.profile, item);
      map.set(next.id, next);
      if (message.mode === "following" && next.followsYou) {
        const handle = String(next.handle || "")
          .replace(/^@/, "")
          .toLowerCase();
        const recent = recentFollows.find(
          (x) =>
            String(x.handle || "")
              .replace(/^@/, "")
              .toLowerCase() === handle,
        );
        if (recent && !recent.backFollow) {
          recent.backFollow = true;
          recent.followsYou = true;
          recentFollows = [...recentFollows];
          chrome.storage.local.set({ followRecent: recentFollows });
        }
      }
    }
    profiles[message.mode] = message.profile;
    lists[message.mode] = [...map.values()];
    if (message.mode === mode) render();
    $("followStatus").textContent = "";
  });
  $("getFollowList").onclick = async () => {
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (running) {
      running = false;
      await chrome.tabs.sendMessage(tab.id, { type: "followStop" }).catch(() => {});
      $("followStatus").textContent = "Đã dừng thu thập.";
      return;
    }
    if (recentView) {
      const data = await chrome.storage.local.get("followRecent");
      recentFollows = Array.isArray(data.followRecent) ? data.followRecent : [];
      render();
      return;
    }
    if (!valid(tab?.url)) return;
    const pageMode = tab.url.match(/\/(following|followers)(?:\?|$)/i)?.[1]?.toLowerCase();
    if (pageMode) {
      unfollowedView = false;
      setMode(pageMode);
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["follow.js"] });
    } catch {}
    running = true;
    $("getFollowList").innerHTML = globalThis.AssistantIcons?.svg("stop") || "";
    $("getFollowList").title = "Dừng";
    $("followStatus").textContent = "";
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "followCollect" });
      if (!r?.ok) throw Error(r?.error || "Không lấy được danh sách.");
      lists[r.mode] = r.items || [];
      profiles[r.mode] = r.profile;
      render();
      $("followStatus").textContent = "";
    } catch (e) {
      $("followStatus").textContent = e.message;
    } finally {
      running = false;
      $("getFollowList").innerHTML = globalThis.AssistantIcons?.svg("get") || "";
      $("getFollowList").title = "Get";
      page();
    }
  };
  chrome.tabs.onUpdated.addListener((_id, c) => {
    if (c.url || c.status === "complete") page();
  });
  chrome.tabs.onActivated.addListener(page);
  page();
})();
