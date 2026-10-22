/* Comment automation scanner. It only collects visible X post/comment IDs; the
 * side panel decides what to keep and never treats a missing DOM node as a
 * completed reply. */
(() => {
  if (globalThis.__assistantCommentAutomation) return;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  const postId = (article) =>
    article?.querySelector('a[href*="/status/"]')?.href.match(/\/status\/(\d+)/)?.[1] || "";
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
    const own = ownHandle();
    return [...document.querySelectorAll('main article[data-testid="tweet"]')]
      .filter((article) => !isReplyOrReshare(article))
      .map(currentPost)
      .filter(
        (item) =>
          item &&
          (!own ||
            String(item.handle || "")
              .replace(/^@/, "")
              .toLowerCase() === own) &&
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
    let stable = 0,
      last = 0;
    for (let i = 0; i < 45; i++) {
      if (autoFlowBusy()) return autoFlowBusyResult();
      if (scanCancelled) break;
      const before = profilePosts().length;
      window.scrollBy({ top: Math.max(420, innerHeight * 0.8), behavior: "smooth" });
      await sleep(700);
      const count = profilePosts().length;
      const reachedCutoff = profilePosts().some(
        (item) =>
          item.publishedAt &&
          !Number.isNaN(Date.parse(item.publishedAt)) &&
          Date.parse(item.publishedAt) < cutoff,
      );
      stable = count === before ? stable + 1 : 0;
      if (count === last) stable++;
      last = count;
      if (reachedCutoff || stable >= 5) break;
    }
    const posts = profilePosts();
    const reachedCutoff = posts.some(
      (item) =>
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
    let stable = 0,
      last = 0;
    for (let i = 0; i < 20; i++) {
      if (autoFlowBusy()) return autoFlowBusyResult();
      const count = document.querySelectorAll('main article[data-testid="tweet"]').length;
      window.scrollBy({ top: Math.max(360, innerHeight * 0.75), behavior: "smooth" });
      await sleep(600);
      const next = document.querySelectorAll('main article[data-testid="tweet"]').length;
      stable = next === count && next === last ? stable + 1 : 0;
      last = next;
      if (stable >= 4) break;
    }
    const articles = [...document.querySelectorAll('main article[data-testid="tweet"]')];
    const rootId = postId(articles[0]);
    if (expectedPostId && rootId !== String(expectedPostId))
      return {
        ok: false,
        error: "Trang bài đăng chưa khớp bài cần quét.",
        postId: rootId,
        comments: [],
      };
    // A self-reply can appear as a sibling in the profile timeline. Once its
    // status page is opened, X exposes the reply relationship in social
    // context; reject it before it reaches the feedback list.
    if (articles[0] && isReplyOrReshare(articles[0])) {
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
    const comments = [];
    let lastUnanswered = null;
    for (const article of articles.slice(1)) {
      const item = currentPost(article);
      if (!item) continue;
      const isOwnReply =
        own &&
        String(item.handle || "")
          .replace(/^@/, "")
          .toLowerCase() === own;
      if (isOwnReply) {
        if (lastUnanswered) lastUnanswered.responded = true;
        continue;
      }
      // A reaction-only comment has no message to answer. Exclude it from
      // the candidate list so it never consumes the requested reply target;
      // the runner continues with the next comment instead.
      if (isEmojiOnly(item.text) || isInteractionRequest(item.text)) continue;
      const comment = { ...item, postId: rootId, responded: false };
      comments.push(comment);
      lastUnanswered = comment;
    }
    return { ok: true, postId: rootId, comments };
  }
  async function waitForReplyBox(timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const box = document.querySelector(".xra-box");
      if (box?.isConnected) return box;
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
    let stable = 0;
    for (let attempt = 0; attempt < 16; attempt++) {
      if (autoFlowBusy()) return false;
      if (domHasOwnReply(handle)) return true;
      const before = document.querySelectorAll('main article[data-testid="tweet"]').length;
      window.scrollBy({ top: Math.max(420, innerHeight * 0.8), behavior: "smooth" });
      await sleep(550);
      const after = document.querySelectorAll('main article[data-testid="tweet"]').length;
      stable = after === before ? stable + 1 : 0;
      if (stable >= 4) break;
    }
    return domHasOwnReply(handle);
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
    if (commentUrl && !location.href.startsWith(commentUrl)) {
      location.href = commentUrl;
      return { ok: false, reload: true };
    }
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
  }
  const api = {
    scanProfile,
    inspectPost,
    replyComment,
    profile: () => ({ ok: true, handle: ownHandle(), url: location.href }),
  };
  globalThis.__assistantCommentAutomation = api;
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
