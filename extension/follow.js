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

  // The automatic-follow runner deliberately stays in this content script so
  // it can use X's rendered controls instead of private endpoints. Progress
  // is saved before every navigation, allowing a reload or extension restart
  // to resume the same post safely.
  const AUTO_FOLLOW_SOURCE =
      "https://x.com/i/jf/creators/inspiration/top_posts",
    AUTO_FOLLOW_STORAGE_KEY = "autoFollowRunV1";
  let autoFollowBusy = false,
    autoFollowToken = 0;
  const autoFollowSend = (payload) => {
    try {
      chrome.runtime.sendMessage({ type: "autoFollowProgress", ...payload }).catch(() => {});
    } catch {}
  };
  const autoFollowReadState = async () => {
    try {
      const stored = await chrome.storage.local.get(AUTO_FOLLOW_STORAGE_KEY);
      return stored[AUTO_FOLLOW_STORAGE_KEY] || null;
    } catch {
      return null;
    }
  };
  const autoFollowSaveState = async (state) => {
    try {
      await chrome.storage.local.set({ [AUTO_FOLLOW_STORAGE_KEY]: state });
    } catch {}
  };
  const autoFollowIsSource = () =>
    /^\/i\/jf\/creators\/inspiration\/top_posts(?:\/|$)/i.test(location.pathname);
  const autoFollowSleep = (ms, token) =>
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (token !== autoFollowToken) return resolve(false);
        const remaining = ms - (Date.now() - started);
        if (remaining <= 0) return resolve(true);
        setTimeout(tick, Math.min(1000, remaining));
      };
      tick();
    });
  const autoFollowAuthor = (article) => {
    const link = article?.querySelector(
      '[data-testid="User-Name"] a[href^="/"],a[href^="/"]:not([href*="/status/"])',
    );
    const handle = link?.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/)?.[1];
    return handle ? { handle: handle.toLowerCase(), url: `https://x.com/${handle}` } : null;
  };
  const autoFollowVerifiedIconSelector =
    '[data-testid="icon-verified"],[aria-label*="Tài khoản đã xác nhận" i],[aria-label*="Verified account" i],[aria-label="Verified"]';
  const autoFollowIsVerified = (root) => {
    const author = root?.querySelector?.('[data-testid="User-Name"],[data-testid="UserName"]'),
      scope = author || root;
    const icon =
      scope?.querySelector?.(autoFollowVerifiedIconSelector) ||
      root?.querySelector?.(autoFollowVerifiedIconSelector);
    if (!icon) return false;
    const details = `${icon.getAttribute("data-testid") || ""} ${icon.getAttribute("aria-label") || ""} ${icon.outerHTML || ""}`;
    return !/(?:business|government|organization|gold|yellow|gray|grey|silver|d18800|829aab|32-a|32-b|vàng|xám)/i.test(details);
  };
  const autoFollowPostId = (article) =>
    article?.querySelector('a[href*="/status/"]')?.href.match(/\/status\/(\d+)/)?.[1] || "";
  const autoFollowPostText = (article) =>
    text(article?.querySelector('[data-testid="tweetText"]')?.textContent || "").slice(0, 140);
  const autoFollowVietnamese = (value) => {
    const input = text(value);
    if (!input || /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\s]+$/u.test(input)) return false;
    return (
      /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/iu.test(input) ||
      /\b(và|của|cho|được|không|một|những|này|đang|với|trong|là|người)\b/iu.test(input)
    );
  };
  const autoFollowControl = (root) => {
    const buttons = [...(root || document).querySelectorAll("button,[role=button]")];
    return buttons.find((button) => {
      const label = text(button.textContent || button.getAttribute("aria-label"));
      const testId = button.getAttribute("data-testid") || "";
      return (
        !/(?:Following|Đang theo dõi|Unfollow|Ngừng theo dõi)/i.test(label) &&
        (/^follow$/i.test(testId) || /^(?:Follow|Theo dõi)(?:\s|$)/i.test(label))
      );
    });
  };
  const autoFollowAlreadyFollowing = (root) => {
    if (!root) return false;
    const nodes = [
      ...(root.matches?.("button,[role=button]") ? [root] : []),
      ...(root.querySelectorAll?.("button,[role=button]") || []),
    ];
    return nodes.some((node) =>
      /(?:Following|Đang theo dõi|Unfollow|Ngừng theo dõi)/i.test(
        text(node.textContent || node.getAttribute("aria-label")),
      ),
    );
  };
  const AUTO_FOLLOW_SOURCE_TAB_XPATH =
    '//*[@id="react-root"]/div/div/div[2]/main/div/div/div/div/div/div/div[1]/div[1]/div[2]/div[2]/div[2]/div[3]/button';
  const autoFollowSourceTabLabel = (button) =>
    text(button?.textContent || button?.getAttribute("aria-label"));
  const autoFollowIsSourceTabLabel = (label) =>
    /^(?:Nhiều phản hồi nhất|Most replies|Top replies)$/i.test(label) ||
    /(?:Nhiều phản hồi nhất|Most replies|Top replies)/i.test(label);
  const autoFollowSourceTabByXPath = () => {
    try {
      const node = document
        .evaluate?.(AUTO_FOLLOW_SOURCE_TAB_XPATH, document, null, 9, null)
        ?.singleNodeValue;
      if (
        node &&
        /^(?:BUTTON|A)$/i.test(node.tagName || "") &&
        autoFollowIsSourceTabLabel(autoFollowSourceTabLabel(node))
      )
        return node;
    } catch {}
    return null;
  };
  const autoFollowSourceTab = () => {
    const direct = autoFollowSourceTabByXPath();
    if (direct) return direct;
    return [...document.querySelectorAll("button,[role=tab],[role=button]")].find((button) => {
      return autoFollowIsSourceTabLabel(autoFollowSourceTabLabel(button));
    });
  };
  const autoFollowFirstPostId = () =>
    document
      .querySelector('article[data-testid="tweet"] a[href*="/status/"]')
      ?.href.match(/\/status\/(\d+)/)?.[1] || "";
  const autoFollowSelectSourceTab = async (token) => {
    // X renders the tab group asynchronously after the Top Posts shell. Try
    // immediately, then retry briefly so a transient render gap is not treated
    // as a permanent missing tab.
    const deadline = Date.now() + 6000;
    while (token === autoFollowToken && Date.now() < deadline) {
      const button = autoFollowSourceTab();
      if (button) {
        if (token !== autoFollowToken) return false;
        // X uses hashed classes for the active style, so do not infer the
        // current tab from computed colors. Clicking the exact target is safe
        // even when it is already selected and avoids staying on Likes.
        const beforePostId = autoFollowFirstPostId();
        button.scrollIntoView?.({ block: "nearest", inline: "center" });
        button.click();
        // Wait for X to commit the sort and replace the timeline before
        // collecting posts; otherwise the old Likes list can be captured.
        const settleDeadline = Date.now() + 5000;
        while (token === autoFollowToken && Date.now() < settleDeadline) {
          await autoFollowSleep(250, token);
          const currentPostId = autoFollowFirstPostId();
          if (currentPostId && currentPostId !== beforePostId) {
            await autoFollowSleep(500, token);
            break;
          }
        }
        return token === autoFollowToken;
      }
      await autoFollowSleep(150, token);
    }
    return false;
  };
  const autoFollowVisiblePosts = () => {
    const seen = new Set();
    return [...document.querySelectorAll('article[data-testid="tweet"]')]
      .filter((article) => !article.parentElement?.closest('article[data-testid="tweet"]'))
      .filter((article) => autoFollowIsVerified(article))
      .map((article) => {
        const id = autoFollowPostId(article),
          author = autoFollowAuthor(article),
          link = article.querySelector('a[href*="/status/"]')?.href || "";
        if (!id || seen.has(id)) return null;
        seen.add(id);
        return {
          id,
          url: link || `https://x.com/i/status/${id}`,
          author: author?.handle || "unknown",
          text: autoFollowPostText(article),
        };
      })
      .filter(Boolean);
  };
  const autoFollowCollectPosts = async (token) => {
    const posts = new Map();
    let stable = 0,
      previous = 0;
    for (let attempt = 0; attempt < 24 && token === autoFollowToken; attempt++) {
      for (const post of autoFollowVisiblePosts()) posts.set(post.id, post);
      if (posts.size === previous) stable++;
      else stable = 0;
      previous = posts.size;
      if (stable >= 4 && posts.size) break;
      window.scrollBy({ top: Math.max(360, innerHeight * 0.78), behavior: "smooth" });
      await autoFollowSleep(900, token);
    }
    return [...posts.values()];
  };
  const autoFollowCommentArticles = (postId) =>
    [...document.querySelectorAll('article[data-testid="tweet"]')]
      .filter((article) => !article.parentElement?.closest('article[data-testid="tweet"]'))
      .filter((article) => autoFollowPostId(article) !== postId)
      .filter((article) => autoFollowIsVerified(article))
      .map((article) => {
        const author = autoFollowAuthor(article);
        if (!author) return null;
        return {
          id: autoFollowPostId(article) || `${author.handle}:${text(article.textContent).slice(0, 24)}`,
          name: text(article.querySelector('[data-testid="User-Name"]')?.textContent || author.handle).split("@")[0].trim(),
          handle: author.handle,
          profileUrl: author.url,
          text: text(article.querySelector('[data-testid="tweetText"]')?.textContent || ""),
          isFollowing: autoFollowAlreadyFollowing(article),
        };
      })
      .filter(Boolean)
      .filter((item, index, all) => all.findIndex((candidate) => candidate.handle === item.handle) === index);
  const autoFollowLoggedHandlesForPost = (state, postId) =>
    new Set(
      (state.logs || [])
        .filter((entry) => String(entry.postId || "") === String(postId || ""))
        .flatMap((entry) => entry.people || [])
        .map((person) => String(person.handle || "").replace(/^@/, "").toLowerCase())
        .filter(Boolean),
    );
  const autoFollowScrollComments = async (postId, token) => {
    const found = new Map();
    let stable = 0,
      previous = 0;
    for (let attempt = 0; attempt < 30 && token === autoFollowToken; attempt++) {
      for (const comment of autoFollowCommentArticles(postId)) found.set(comment.handle, comment);
      if (found.size === previous) stable++;
      else stable = 0;
      previous = found.size;
      if (stable >= 5 && found.size) break;
      window.scrollBy({ top: Math.max(380, innerHeight * 0.82), behavior: "smooth" });
      await autoFollowSleep(850, token);
    }
    for (const comment of autoFollowCommentArticles(postId)) found.set(comment.handle, comment);
    return [...found.values()];
  };
  const autoFollowDetail = (state, message) => {
    const current = state.currentPost || {},
      entries = Array.isArray(state.logs) ? state.logs : [],
      followed = Number(state.followedInPost || 0),
      total = Number(state.currentTotal || state.comments?.length || 0),
      next = {
        postId: current.id,
        postText: current.text || "Bài không có nội dung chữ",
        author: current.author || "unknown",
        followed,
        total,
        createdAt: Date.now(),
        people: Array.isArray(state.currentPeople) ? state.currentPeople : [],
      };
    state.logs = [...entries, next].slice(-50);
    state.currentPeople = [];
    state.followedInPost = 0;
    state.currentTotal = total;
    autoFollowSend({ state, status: message || `Đã xử lý ${followed}/${total} người trong bài.` });
  };
  const autoFollowFinishPost = async (state, token, message) => {
    autoFollowDetail(state, message);
    state.postIndex = Number(state.postIndex || 0) + 1;
    state.currentPost = null;
    state.comments = [];
    state.commentIndex = 0;
    state.phase = "source";
    await autoFollowSaveState(state);
    if (token !== autoFollowToken || !state.enabled) return;
    location.href = AUTO_FOLLOW_SOURCE;
  };
  const autoFollowWait = async (state, token) => {
    const remaining = Math.max(0, Number(state.nextRunAt || 0) - Date.now());
    autoFollowSend({ state, status: `Đủ lượt ${state.targetLimit} người · nghỉ 20 phút trước lượt tiếp theo.` });
    if (remaining > 0) {
      const ok = await autoFollowSleep(remaining, token);
      if (!ok) return;
    }
    state.followedInWindow = 0;
    state.targetLimit = 12 + Math.floor(Math.random() * 4);
    state.nextRunAt = 0;
    state.phase = state.currentPost ? "post" : "source";
    await autoFollowSaveState(state);
    if (token !== autoFollowToken || !state.enabled) return;
    location.href = state.currentPost?.url || AUTO_FOLLOW_SOURCE;
  };
  const autoFollowProcessProfile = async (state, token) => {
    const candidate = state.currentCandidate;
    if (!candidate || token !== autoFollowToken) return;
    const profileHandle = location.pathname.split("/")[1]?.toLowerCase() || "";
    if (profileHandle && profileHandle !== String(candidate.handle || "").toLowerCase()) {
      state.currentCandidate = null;
      state.commentIndex = Number(state.commentIndex || 0) + 1;
      state.phase = "post";
      await autoFollowSaveState(state);
      location.href = state.currentPost?.url || AUTO_FOLLOW_SOURCE;
      return;
    }
    const profileRoot =
      document.querySelector('[data-testid="UserProfileHeader"]') ||
      document.querySelector("main") ||
      document.body;
    if (!autoFollowIsVerified(profileRoot)) {
      state.currentCandidate = null;
      state.commentIndex = Number(state.commentIndex || 0) + 1;
      state.phase = "post";
      await autoFollowSaveState(state);
      location.href = state.currentPost?.url || AUTO_FOLLOW_SOURCE;
      return;
    }
    const button = autoFollowControl(profileRoot);
    if (button && !autoFollowAlreadyFollowing(button)) {
      button.click();
      await autoFollowSleep(900, token);
      state.followedInWindow = Number(state.followedInWindow || 0) + 1;
      state.followedInPost = Number(state.followedInPost || 0) + 1;
      state.currentPeople = [
        ...(state.currentPeople || []),
        { name: candidate.name || candidate.handle, handle: `@${candidate.handle}`, followedAt: Date.now() },
      ];
    }
    state.currentCandidate = null;
    state.commentIndex = Number(state.commentIndex || 0) + 1;
    state.phase = "post";
    await autoFollowSaveState(state);
    if (state.followedInWindow >= state.targetLimit) {
      state.nextRunAt = Date.now() + 20 * 60 * 1000;
      state.phase = "waiting";
      await autoFollowSaveState(state);
      return autoFollowWait(state, token);
    }
    location.href = state.currentPost?.url || AUTO_FOLLOW_SOURCE;
  };
  const autoFollowProcessPost = async (state, token) => {
    if (!state.currentPost || token !== autoFollowToken) return;
    const onlyVietnamese = state.onlyVietnamese !== false;
    if (
      onlyVietnamese &&
      state.currentPost.text &&
      !autoFollowVietnamese(state.currentPost.text)
    ) {
      return autoFollowFinishPost(state, token, "Bỏ qua bài: nội dung bài không phải tiếng Việt.");
    }
    const all = await autoFollowScrollComments(state.currentPost.id, token),
      currentOnlyVietnamese = state.onlyVietnamese !== false;
    const loggedHandles = autoFollowLoggedHandlesForPost(state, state.currentPost.id);
    state.currentTotal = all.length;
    state.comments = all.filter(
      (comment) =>
        (!currentOnlyVietnamese || autoFollowVietnamese(comment.text)) &&
        !comment.isFollowing &&
        !loggedHandles.has(String(comment.handle || "").toLowerCase()),
    );
    state.commentIndex = Number(state.commentIndex || 0);
    await autoFollowSaveState(state);
    if (!state.comments.length) {
      return autoFollowFinishPost(
        state,
        token,
        "Bỏ qua bài: không có bình luận tiếng Việt phù hợp hoặc không có người tích xanh chưa follow.",
      );
    }
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    while (state.commentIndex < state.comments.length && token === autoFollowToken) {
      if (state.followedInWindow >= state.targetLimit) {
        state.nextRunAt = Date.now() + 20 * 60 * 1000;
        state.phase = "waiting";
        await autoFollowSaveState(state);
        return autoFollowWait(state, token);
      }
      const comment = state.comments[state.commentIndex],
        article = articles.find((node) => autoFollowAuthor(node)?.handle === comment.handle);
      if (comment.isFollowing || autoFollowAlreadyFollowing(article)) {
        state.commentIndex += 1;
        await autoFollowSaveState(state);
        continue;
      }
      state.currentCandidate = comment;
      state.phase = "profile";
      await autoFollowSaveState(state);
      location.href = comment.profileUrl;
      return;
    }
    await autoFollowFinishPost(state, token, `Bài ${state.currentPost.author} · đã follow ${state.followedInPost}/${state.currentTotal} người.`);
  };
  const autoFollowProcessSource = async (state, token) => {
    if (!(await autoFollowSelectSourceTab(token))) {
      autoFollowSend({ state, status: "Không tìm thấy tab Nhiều phản hồi nhất trên trang Top Posts." });
      return;
    }
    if (token !== autoFollowToken || !state.enabled) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    await autoFollowSleep(350, token);
    if (state.nextRunAt && state.nextRunAt > Date.now()) return autoFollowWait(state, token);
    if (!Array.isArray(state.queue) || !state.queue.length || state.postIndex >= state.queue.length) {
      state.queue = await autoFollowCollectPosts(token);
      state.postIndex = 0;
      if (!state.queue.length) {
        autoFollowSend({ state, status: "Chưa tìm thấy bài trong Top Posts." });
        return;
      }
      await autoFollowSaveState(state);
    }
    let skippedNonVietnamese = 0;
    while (state.onlyVietnamese && state.postIndex < state.queue.length) {
      const candidate = state.queue[state.postIndex];
      if (!candidate?.text || autoFollowVietnamese(candidate.text)) break;
      state.postIndex += 1;
      skippedNonVietnamese += 1;
    }
    if (skippedNonVietnamese) await autoFollowSaveState(state);
    if (state.postIndex >= state.queue.length) {
      autoFollowSend({
        state,
        status: "Đã bỏ qua các bài không có nội dung tiếng Việt trong lượt này.",
      });
      return;
    }
    state.currentPost = state.queue[state.postIndex];
    state.phase = "post";
    state.comments = [];
    state.commentIndex = 0;
    state.followedInPost = 0;
    state.currentPeople = [];
    await autoFollowSaveState(state);
    autoFollowSend({ state, status: `Đang mở bài ${state.postIndex + 1}/${state.queue.length}: ${state.currentPost.text || state.currentPost.author}` });
    location.href = state.currentPost.url;
  };
  const autoFollowLoop = async (options = {}) => {
    if (autoFollowBusy) return;
    autoFollowBusy = true;
    const token = ++autoFollowToken;
    let state = await autoFollowReadState();
    const restoring = options.restore === true;
    if (!restoring) {
      state = {
        ...(state || {}),
        phase: "source",
        queue: [],
        postIndex: 0,
        currentPost: null,
        comments: [],
        commentIndex: 0,
        currentCandidate: null,
        followedInPost: 0,
        currentPeople: [],
        currentTotal: 0,
        nextRunAt: 0,
      };
    }
    state = {
      enabled: true,
      onlyVietnamese:
        options.onlyVietnamese !== undefined
          ? options.onlyVietnamese !== false
          : state?.onlyVietnamese !== false,
      phase: state?.phase || "source",
      queue: state?.queue || [],
      postIndex: Number(state?.postIndex || 0),
      currentPost: state?.currentPost || null,
      comments: state?.comments || [],
      commentIndex: Number(state?.commentIndex || 0),
      followedInWindow: Number(state?.followedInWindow || 0),
      targetLimit: Number(state?.targetLimit) >= 12 ? Number(state.targetLimit) : 12 + Math.floor(Math.random() * 4),
      nextRunAt: Number(state?.nextRunAt || 0),
      logs: Array.isArray(state?.logs) ? state.logs : [],
      currentPeople: state?.currentPeople || [],
      followedInPost: Number(state?.followedInPost || 0),
      currentTotal: Number(state?.currentTotal || 0),
      currentCandidate: state?.currentCandidate || null,
    };
    await autoFollowSaveState(state);
    autoFollowSend({ state, status: "Tự động follow đang chạy." });
    try {
      if (!autoFollowIsSource()) {
        if (state.phase === "profile" && state.currentCandidate) return autoFollowProcessProfile(state, token);
        if (state.phase === "post" && state.currentPost) return autoFollowProcessPost(state, token);
        location.href = AUTO_FOLLOW_SOURCE;
        return;
      }
      if (state.phase === "waiting") return autoFollowWait(state, token);
      return autoFollowProcessSource(state, token);
    } finally {
      autoFollowBusy = false;
    }
  };
  const autoFollowStop = async () => {
    autoFollowToken++;
    autoFollowBusy = false;
    const state = (await autoFollowReadState()) || {};
    state.enabled = false;
    state.phase = "stopped";
    await autoFollowSaveState(state);
    autoFollowSend({ state, status: "Đã dừng tự động follow." });
  };
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
    if (message?.type === "autoFollowStart") {
      autoFollowLoop({ onlyVietnamese: message.onlyVietnamese !== false, restore: message.restore === true });
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "autoFollowStop") {
      autoFollowStop();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "autoFollowIdentity") {
      autoFollowReadState().then((state) =>
        sendResponse({ ok: true, enabled: state?.enabled === true, running: autoFollowBusy, state }),
      );
      return true;
    }
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
  try {
    chrome.runtime.sendMessage({ type: "autoFollowReady" }).catch(() => {});
  } catch {}
})();
