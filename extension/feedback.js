/* Profile feedback scanner. It only collects visible X post/comment IDs; the
 * side panel decides what to keep and never treats a missing DOM node as a
 * completed reply. */
(() => {
  if (globalThis.__assistantFeedbackScanner) return;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const feedbackReplyLocks = new Set();
  const autoFlowBusy = () => globalThis.__assistantAutoFlowRunning === true;
  const autoFlowBusyResult = () => ({
    ok: false,
    error: "Tab này đang chạy tự động; Phản hồi không cuộn hoặc thao tác trên tab này.",
  });
  const ownHandle = () =>
    document
      .querySelector('[data-testid^="UserAvatar-Container-"]')
      ?.getAttribute("data-testid")
      ?.replace("UserAvatar-Container-", "")
      .toLowerCase() || "";
  const postId = (article, preferredId = "") => {
    const links = [...(article?.querySelectorAll('a[href*="/status/"]') || [])];
    const ids = links.map((link) => link.href.match(/\/status\/(\d+)/)?.[1] || "").filter(Boolean);
    if (preferredId && ids.includes(String(preferredId))) return String(preferredId);
    // A post can contain a quoted status before its own permalink. Prefer the
    // bare permalink belonging to the article author, not /photo, /analytics,
    // or the quoted account's status URL.
    const handle =
      article
        ?.querySelector('[data-testid="User-Name"] a[href^="/"]')
        ?.getAttribute("href")
        ?.replace(/^\//, "")
        ?.split("/")[0]
        ?.toLowerCase() || "";
    const ownBare = links.find((link) => {
      try {
        const url = new URL(link.href);
        const parts = url.pathname.split("/").filter(Boolean);
        return (
          parts.length === 3 &&
          parts[1] === "status" &&
          (!handle || parts[0].toLowerCase() === handle)
        );
      } catch {
        return false;
      }
    });
    if (ownBare) return ownBare.href.match(/\/status\/(\d+)/)?.[1] || "";
    const bare = links.find((link) => {
      try {
        return new URL(link.href).pathname.split("/").filter(Boolean).length === 3;
      } catch {
        return false;
      }
    });
    return bare?.href.match(/\/status\/(\d+)/)?.[1] || ids[0] || "";
  };
  const author = (article) => {
    const node = article?.querySelector('[data-testid="User-Name"]');
    return {
      name: node?.querySelector("span")?.textContent?.trim() || "",
      handle: node?.querySelector('a[href^="/"]')?.getAttribute("href")?.replace(/^\//, "") || "",
    };
  };
  const text = (article) => {
    const node = article?.querySelector('[data-testid="tweetText"]');
    if (!node) return "";
    const visible = node.textContent?.trim() || "";
    const emojiAlts = [...node.querySelectorAll("img[alt],svg[aria-label]")]
      .map((item) => item.getAttribute("alt") || item.getAttribute("aria-label") || "")
      .filter(Boolean)
      .join(" ");
    return [visible, emojiAlts].filter(Boolean).join(" ").trim();
  };
  const isEmojiOnly = (value) => {
    const input = String(value || "").trim();
    if (!input || !/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(input)) return false;
    // Keep ordinary text (including numbers) eligible. Allow only emoji
    // presentation marks, joiners, skin-tone modifiers, keycap marks, and
    // whitespace after an emoji has been detected.
    return (
      input.replace(
        /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\uFE0F\u200D\u20E3\s]/gu,
        "",
      ) === ""
    );
  };
  const isInteractionRequest = (value) => {
    const input = String(value || "")
      .trim()
      .toLocaleLowerCase("vi");
    if (!input) return false;
    return /(?:chéo\s*(?:follow|fl|f)|follow\s*(?:back|lại|mình|nhau|chéo)|(?:fl|f)\s*(?:back|chéo|nhau)|theo\s*dõi\s*(?:mình|nhau|lại)|kết\s*bạn|làm\s*bạn\s*(?:với\s*mình|nhé|nha|đi)?|\bkb\b|\bfl\b|tương\s*tác\s*(?:chéo|qua\s*lại)|giao\s*lưu\s*(?:với\s*mình|nhé|nha|đi)|ib\s*(?:mình|nhé|nha)|dm\s*(?:mình|nhé|nha)|follow\s*for\s*follow|f4f|l4l)/iu.test(
      input,
    );
  };
  const publishedAt = (article) => article?.querySelector("time")?.dateTime || "";
  const replyCount = (article) => {
    const button = article?.querySelector('[data-testid="reply"]');
    const value =
      button?.getAttribute("aria-label")?.match(/([\d,.]+)/)?.[1] ||
      button?.textContent?.trim() ||
      "0";
    return Number(String(value).replace(/,/g, "")) || 0;
  };
  function currentPost(article) {
    const id = postId(article);
    if (!id) return null;
    const identity = author(article);
    return {
      id,
      url: `https://x.com/${identity.handle || location.pathname.split("/")[1] || "i"}/status/${id}`,
      text: text(article),
      publishedAt: publishedAt(article),
      replyCount: replyCount(article),
      // A pinned post can be older than the selected range while appearing
      // before today's posts. It must not trigger the cutoff early.
      pinned: /^\s*đã ghim\b/i.test(article?.innerText || ""),
      ...identity,
    };
  }
  function isReplyOrReshare(article) {
    // X renders a reply in the profile timeline as a normal tweet article,
    // but adds the relationship in a small social-context node. Do not use
    // the whole article text here: a normal post can mention “reply” too.
    const contextNodes = [
      ...(article?.querySelectorAll(
        '[data-testid="socialContext"],[data-testid*="social" i],[data-testid*="conversation" i],a[aria-label*="reply" i],a[aria-label*="trả lời" i]',
      ) || []),
    ];
    const context = contextNodes
      .map((node) => `${node.textContent || ""} ${node.getAttribute("aria-label") || ""}`)
      .join(" ");
    const statusLinks = [
      ...(article?.querySelectorAll('a[href*="/status/"],[role="link"][href*="/status/"]') || []),
    ];
    const explicitReply =
      /replying to\s+@|in reply to\s+@|replied to\s+@|đang trả lời\s+@|đã trả lời\s+@|trả lời\s+@|phản hồi\s+@/i.test(
        context,
      );
    return (
      /replied|responded|commented|reposted|đã đăng lại|đã trả lời|đã phản hồi/i.test(context) ||
      explicitReply
    );
  }
  function profilePosts() {
    const seen = new Set();
    // The profile URL remains stable even when X changes the avatar testid.
    const profileHandle = location.pathname.match(/^\/([^/]+)/)?.[1]?.toLowerCase() || "";
    return [...document.querySelectorAll('main article[data-testid="tweet"]')]
      .filter((article) => !isReplyOrReshare(article))
      .map(currentPost)
      .filter(
        (item) =>
          item &&
          (!profileHandle ||
            String(item.handle || "")
              .replace(/^@/, "")
              .toLowerCase() === profileHandle) &&
          !seen.has(item.id) &&
          seen.add(item.id),
      );
  }
  async function ensurePostsTab() {
    // A profile keeps the selected timeline tab in the DOM while the URL
    // stays /:handle. Always switch back to the root “Bài đăng/Posts” tab so
    // the scanner cannot mistake the user's own replies for posts.
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const postsTab = tabs.find((tab) =>
      /^(?:bài đăng|posts?)$/i.test((tab.textContent || "").trim()),
    );
    if (!postsTab || postsTab.getAttribute("aria-selected") === "true") return;
    postsTab.click();
    await sleep(900);
  }
  let scanCancelled = false;
  const stopScan = () => {
    scanCancelled = true;
  };
  async function scanProfile({ rangeMode = "day", sinceHours } = {}) {
    if (autoFlowBusy()) return autoFlowBusyResult();
    scanCancelled = false;
    await ensurePostsTab();
    const now = new Date();
    const cutoff =
      rangeMode === "day" || (!rangeMode && sinceHours === undefined)
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        : Date.now() - Math.max(1, Number(rangeMode ?? sinceHours) || 24) * 3600000;
    // X virtualizes profile timelines: articles that have already scrolled
    // past are removed from the DOM. Keep a map while scrolling instead of
    // reading only the final viewport (which used to produce an empty list).
    const collected = new Map();
    let stable = 0,
      lastScrollY = window.scrollY;
    for (let i = 0; i < 45; i++) {
      if (autoFlowBusy()) return autoFlowBusyResult();
      if (scanCancelled) break;
      const visible = profilePosts();
      const beforeSize = collected.size;
      for (const item of visible) {
        if (item?.id && !collected.has(item.id)) collected.set(item.id, item);
      }
      window.scrollBy({ top: Math.max(420, innerHeight * 0.8), behavior: "smooth" });
      await sleep(700);
      const afterVisible = profilePosts();
      for (const item of afterVisible) {
        if (item?.id && !collected.has(item.id)) collected.set(item.id, item);
      }
      const reachedCutoff = [...collected.values()].some(
        (item) =>
          !item.pinned &&
          item.publishedAt &&
          !Number.isNaN(Date.parse(item.publishedAt)) &&
          Date.parse(item.publishedAt) < cutoff,
      );
      const scrollY = window.scrollY;
      const changed = collected.size > beforeSize || Math.abs(scrollY - lastScrollY) > 2;
      stable = changed ? 0 : stable + 1;
      lastScrollY = scrollY;
      if (reachedCutoff || stable >= 5) break;
    }
    const posts = [...collected.values()];
    const reachedCutoff = posts.some(
      (item) =>
        !item.pinned &&
        item.publishedAt &&
        !Number.isNaN(Date.parse(item.publishedAt)) &&
        Date.parse(item.publishedAt) < cutoff,
    );
    const filtered = posts
      .filter(
        (item) =>
          !item.publishedAt ||
          Number.isNaN(Date.parse(item.publishedAt)) ||
          Date.parse(item.publishedAt) >= cutoff,
      )
      .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
    return {
      ok: true,
      cancelled: scanCancelled,
      reachedCutoff,
      handle: ownHandle(),
      posts: filtered,
    };
  }
  async function inspectPost({ expectedPostId = "", ownHandleOverride = "" } = {}) {
    if (autoFlowBusy()) return autoFlowBusyResult();
    const requestedId = String(expectedPostId || "");
    // `tabs.onUpdated(..., complete)` can fire before X has mounted the root
    // article. Wait briefly for the requested status instead of treating a
    // transient empty DOM as a mismatched post and dropping the row.
    let initialArticles = [...document.querySelectorAll('main article[data-testid="tweet"]')];
    if (requestedId) {
      const started = Date.now();
      while (
        !initialArticles.some((article) => postId(article) === requestedId) &&
        Date.now() - started < 9000
      ) {
        await sleep(300);
        initialArticles = [...document.querySelectorAll('main article[data-testid="tweet"]')];
      }
    }
    // X virtualizes the thread while scrolling and can remove the root post
    // from the DOM. Capture the expected root ID before loading comments.
    const initialRootId = requestedId || postId(initialArticles[0]) || "";
    const initialHasRequested =
      !requestedId ||
      initialArticles.some((article) => postId(article, requestedId) === requestedId);
    const rootArticle =
      initialArticles.find((article) => postId(article, initialRootId) === initialRootId) || null;
    const rootId = initialRootId || postId(rootArticle);
    const requestedIndex = requestedId
      ? initialArticles.findIndex((article) => postId(article, requestedId) === requestedId)
      : -1;
    if (requestedId && !initialHasRequested)
      return {
        ok: false,
        error: "Trang bài đăng chưa khớp bài cần quét.",
        postId: rootId,
        comments: [],
      };
    // Opening a continuation status shows the earlier root post first and the
    // requested status after it. It is a thread continuation, not a separate
    // main post for the profile feedback list.
    if (requestedId && requestedIndex > 0) {
      const rootPostId = postId(initialArticles[0]);
      return {
        ok: false,
        continuation: true,
        error: "Đây là bài nối tiếp trong cùng chuỗi, không phải bài đăng chính.",
        postId: requestedId,
        rootPostId,
        comments: [],
      };
    }
    // A self-reply can appear as a sibling in the profile timeline. Once its
    // status page is opened, X exposes the reply relationship in social
    // context; reject it before it reaches the feedback list.
    if (rootArticle && isReplyOrReshare(rootArticle)) {
      return {
        ok: false,
        error: "Đây là phản hồi, không phải bài đăng gốc.",
        postId: rootId,
        comments: [],
      };
    }
    const own = String(ownHandleOverride || ownHandle())
      .replace(/^@/, "")
      .toLowerCase();
    // X virtualizes long threads too. Accumulate each visible comment across
    // scrolls so the final result is not limited to the last viewport.
    const commentsById = new Map();
    const comments = [];
    let lastUnanswered = null;
    const collectVisibleComments = () => {
      const visible = [...document.querySelectorAll('main article[data-testid="tweet"]')];
      const rootIndex = visible.findIndex((article) => postId(article, rootId) === rootId);
      const candidates = visible.slice(rootIndex >= 0 ? rootIndex + 1 : 0);
      for (const article of candidates) {
        const item = currentPost(article);
        if (!item || item.id === rootId) continue;
        const isOwnReply =
          own &&
          String(item.handle || "")
            .replace(/^@/, "")
            .toLowerCase() === own;
        if (isOwnReply) {
          if (lastUnanswered) lastUnanswered.responded = true;
          continue;
        }
        // A reaction-only or interaction-request comment has no useful
        // response. Exclude it without consuming the requested target.
        if (isEmojiOnly(item.text) || isInteractionRequest(item.text)) continue;
        const key = String(item.id);
        const existing = commentsById.get(key);
        if (existing) {
          lastUnanswered = existing;
          continue;
        }
        const comment = { ...item, postId: rootId, responded: false };
        commentsById.set(key, comment);
        comments.push(comment);
        lastUnanswered = comment;
      }
      return visible.length;
    };
    let stable = 0;
    let lastScrollY = window.scrollY;
    for (let i = 0; i < 24; i++) {
      if (autoFlowBusy()) return autoFlowBusyResult();
      const beforeSize = comments.length;
      collectVisibleComments();
      window.scrollBy({ top: Math.max(360, innerHeight * 0.75), behavior: "smooth" });
      await sleep(600);
      collectVisibleComments();
      const scrollY = window.scrollY;
      const changed = comments.length > beforeSize || Math.abs(scrollY - lastScrollY) > 2;
      stable = changed ? 0 : stable + 1;
      lastScrollY = scrollY;
      if (stable >= 4) break;
    }
    return { ok: true, postId: rootId, comments };
  }
  async function waitForReplyBox(timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const box = document.querySelector(".xra-box");
      if (box?.isConnected) {
        // Reply execution should stop at the assistant reply box. Do not use
        // a repeated page scroll here: it makes X keep loading the thread to
        // the bottom and interferes with the next comment.
        box.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
        return box;
      }
      await sleep(250);
    }
    return null;
  }
  const domHasOwnReply = (handle) => {
    const expected = String(handle || "")
      .replace(/^@/, "")
      .toLowerCase();
    if (!expected) return false;
    return [...document.querySelectorAll('main article[data-testid="tweet"]')]
      .slice(1)
      .some((article) => {
        const authorLink = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
        const author = authorLink
          ?.getAttribute("href")
          ?.replace(/^\//, "")
          .split("/")[0]
          .toLowerCase();
        return author === expected;
      });
  };
  async function threadHasOwnReply(handle) {
    if (!handle) return false;
    if (autoFlowBusy()) return false;
    // The scan already stored the comment/replied checkpoint. At execution
    // time only inspect what X has mounted for this status; never scroll the
    // whole thread just to look for a self-reply.
    return domHasOwnReply(handle);
  }
  async function likeCurrentPostIfEnabled(expectedId = "") {
    let enabled = false;
    try {
      enabled = (await chrome.storage.local.get("autoLike"))?.autoLike === true;
    } catch {}
    if (!enabled) return false;
    const article = [...document.querySelectorAll('main article[data-testid="tweet"]')].find(
      (candidate) => postId(candidate, expectedId) === String(expectedId),
    );
    const like = article?.querySelector('[data-testid="like"]');
    if (!like) return false;
    like.click();
    return true;
  }
  async function waitForChip(box, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const chip = box?.querySelector(".xra-chip");
      if (chip && !box.querySelector(".xra-loading")) return chip;
      if (box?.querySelector(".xra-error")) return null;
      await sleep(250);
    }
    return null;
  }
  async function replyComment({ commentUrl = "", extraContext = "", ownHandleOverride = "" } = {}) {
    if (autoFlowBusy()) return autoFlowBusyResult();
    const replyKey = String(commentUrl || location.href);
    if (feedbackReplyLocks.has(replyKey)) {
      return { ok: false, duplicate: true, error: "Comment này đang được xử lý." };
    }
    feedbackReplyLocks.add(replyKey);
    const previousFeedbackFlag = globalThis.__assistantFeedbackReplyRunning;
    globalThis.__assistantFeedbackReplyRunning = true;
    try {
      if (commentUrl && !location.href.startsWith(commentUrl)) {
        location.href = commentUrl;
        return { ok: false, reload: true };
      }
      const currentId = String(commentUrl || location.href).match(/\/status\/(\d+)/)?.[1] || "";
      await likeCurrentPostIfEnabled(currentId);
      if (extraContext)
        await chrome.storage.local
          .set({ feedbackExtraContext: String(extraContext).slice(0, 500) })
          .catch(() => {});
      const expectedOwnHandle = String(ownHandleOverride || ownHandle())
        .replace(/^@/, "")
        .toLowerCase();
      if (await threadHasOwnReply(expectedOwnHandle)) {
        return { ok: false, alreadyReplied: true, error: "Comment đã được phản hồi trước đó." };
      }
      if (autoFlowBusy()) return autoFlowBusyResult();
      const box = await waitForReplyBox();
      if (!box) return { ok: false, error: "Chưa thấy khung gợi ý phản hồi trên bài viết." };
      const generate = box.querySelector(".xra-generate");
      if (!generate) return { ok: false, error: "Chưa thấy nút tạo gợi ý phản hồi." };
      // X can finish rendering the thread after the reply box appears. Check
      // the DOM one final time immediately before generating so an existing
      // self-reply can never trigger another suggestion/comment.
      if (await threadHasOwnReply(expectedOwnHandle)) {
        return { ok: false, alreadyReplied: true, error: "Comment đã được phản hồi trước đó." };
      }
      if (autoFlowBusy()) return autoFlowBusyResult();
      generate.click();
      const chip = await waitForChip(box);
      if (!chip)
        return {
          ok: false,
          error: box.querySelector(".xra-error")?.textContent || "Không tạo được gợi ý phản hồi.",
        };
      chip.click();
      await sleep(150);
      const submit =
        box.closest("article")?.querySelector('[data-testid="tweetButtonInline"]') ||
        document.querySelector('[data-testid="tweetButtonInline"]');
      if (!submit || submit.disabled) return { ok: false, error: "Chưa thấy nút đăng phản hồi." };
      submit.click();
      await sleep(700);
      return { ok: true };
    } finally {
      feedbackReplyLocks.delete(replyKey);
      if (previousFeedbackFlag === undefined)
        delete globalThis.__assistantFeedbackReplyRunning;
      else globalThis.__assistantFeedbackReplyRunning = previousFeedbackFlag;
    }
  }
  const api = {
    scanProfile,
    inspectPost,
    replyComment,
    profile: () => ({ ok: true, handle: ownHandle(), url: location.href }),
  };
  globalThis.__assistantFeedbackScanner = api;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "feedbackProfile") {
      sendResponse(api.profile());
      return false;
    }
    if (message?.type === "feedbackStopScan") {
      stopScan();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "feedbackScanProfile") {
      api
        .scanProfile(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === "feedbackInspectPost") {
      api
        .inspectPost(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === "feedbackReplyComment") {
      api
        .replyComment(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    return false;
  });
})();
