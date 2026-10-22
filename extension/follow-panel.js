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
    running = false;
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
  const active = () => {
    for (const id of ["replyModule", "contentModule", "quoteModule", "followModule"])
      $(id)?.classList.toggle("active", id === "followModule");
    for (const id of [
      "workspace",
      "xWorkspace",
      "contentWorkspace",
      "quoteWorkspace",
      "followWorkspace",
    ])
      $(id).hidden = id !== "followWorkspace";
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
            ? `<i class="follow-tick ${x.tickType || "blue"}" title="${x.tick}"><svg viewBox="0 0 22 22" aria-hidden="true"><path d="${x.tickType === "gold" ? "M13.324 3.848L11 1.6 8.676 3.848l-3.201-.453-.559 3.184L2.06 8.095 3.48 11l-1.42 2.904 2.856 1.516.559 3.184 3.201-.452L11 20.4l2.324-2.248 3.201.452.559-3.184 2.856-1.516L18.52 11l1.42-2.905-2.856-1.516-.559-3.184zM6.234 11.423l3.429 3.428 5.65-6.17 1.385 1.247-5.683 6.206-3.429-3.429z" : x.tickType === "gray" ? "M12.05 2.056c-.568-.608-1.532-.608-2.1 0l-1.393 1.49c-.284.303-.685.47-1.1.455L5.42 3.932c-.832-.028-1.514.654-1.486 1.486l.069 2.039c.014.415-.152.816-.456 1.1l-1.49 1.392c-.608.568-.608 1.533 0 2.101l1.49 1.393c.304.284.47.684.456 1.1l-.07 2.038c-.027.832.655 1.514 1.487 1.486l2.038-.069c.415-.014.816.152 1.1.455l1.392 1.49c.569.609 1.533.609 2.102 0l1.393-1.49c.283-.303.684-.47 1.099-.455l2.038.069c.832.028 1.515-.654 1.486-1.486L18 14.542c-.015-.415.152-.815.455-1.099l1.49-1.393c.608-.568.608-1.533 0-2.101l-1.49-1.393c-.303-.283-.47-.684-.455-1.1l.068-2.038c.029-.832-.654-1.514-1.486-1.486l-2.038.07c-.415.013-.816-.153-1.1-.456zM6.233 11.423l3.429 3.428 5.683-6.206-1.347-1.247-4.4 4.795z" : "M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"}"/></svg></i>`
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
  };
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
