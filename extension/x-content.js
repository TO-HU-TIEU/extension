(() => {
  document.querySelectorAll(".xra-box").forEach((e) => e.remove());
  let state = {
      postId: null,
      replies: [],
      replyHistory: [],
      selected: null,
      generated: false,
      liked: false,
    },
    invalid = false,
    mounting = false,
    observer,
    hideAdsEnabled = false,
    lastQuoteTarget = null;
  const removedHomeAds = new Map();
  const discreet = (text) =>
    String(text || "")
      .replace(/X Reply Assistant|Reply Assistant/gi, "Assistant")
      .replace(/trang X/gi, "trang hiện tại")
      .replace(/bài X/gi, "bài viết")
      .replace(/trên X/gi, "trên trang");
  function applyAiIconMask(root = document) {
    const markup = globalThis.AssistantIcons?.svg?.("generate");
    if (!markup) return;
    root.querySelectorAll?.(".ai-icon").forEach((icon) => {
      if (!icon.querySelector(".ui-icon-generate")) icon.innerHTML = markup;
      icon.style.backgroundColor = "transparent";
      icon.style.backgroundImage = "none";
      icon.style.webkitMaskImage = "none";
      icon.style.maskImage = "none";
      icon.style.opacity = "1";
    });
  }
  const contextError = (e) => /Extension context invalidated/i.test(e?.message || "");
  const safeGet = async (keys) => {
    try {
      return await chrome.storage.local.get(keys);
    } catch (e) {
      if (contextError(e)) {
        invalid = true;
        observer?.disconnect();
        return null;
      }
      throw e;
    }
  };
  const safeSet = async (data) => {
    try {
      return await chrome.storage.local.set(data);
    } catch (e) {
      if (contextError(e)) {
        invalid = true;
        observer?.disconnect();
        return false;
      }
      throw e;
    }
  };
  const safeMessage = async (data) => {
    try {
      return await chrome.runtime.sendMessage(data);
    } catch (e) {
      if (contextError(e)) {
        invalid = true;
        observer?.disconnect();
        return null;
      }
      throw e;
    }
  };
  const request = async (body) => {
    try {
      const r = await chrome.runtime.sendMessage({ type: "suggest", ...body });
      if (!r?.ok) throw new Error(r?.error || "Không tạo được gợi ý.");
      return r.data;
    } catch (e) {
      if (contextError(e)) throw new Error("Extension vừa cập nhật. Hãy tải lại trang X.");
      throw e;
    }
  };
  const safeUrl = (value, base = location.origin) => {
    try {
      return new URL(value, base);
    } catch {
      return null;
    }
  };
  const urlPath = (value, base = location.origin) => safeUrl(value, base)?.pathname || "";
  function insideQuote(element, article) {
    for (let node = element?.parentElement; node && node !== article; node = node.parentElement)
      if (
        node.dataset.testid === "quoteTweet" ||
        (node.tagName !== "A" && node.getAttribute?.("role") === "link")
      )
        return true;
    return false;
  }
  function ownPermalink(article) {
    return (
      [...(article?.querySelectorAll("a[href]") || [])].find(
        (a) =>
          a.closest("article") === article &&
          !insideQuote(a, article) &&
          a.querySelector("time") &&
          /\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(urlPath(a.href)),
      ) || null
    );
  }
  function articleFor(id) {
    return [...document.querySelectorAll('article[data-testid="tweet"]')].find(
      (a) => ownPermalink(a)?.href.match(/\/status\/(\d+)/)?.[1] === id,
    );
  }
  function currentArticle(id) {
    // On a post/Article page X also renders recommended posts after the target.
    // The reply composer can appear after those recommendations in DOM order,
    // so proximity to the composer must never outrank the status ID in the URL.
    const exact = articleFor(id);
    if (exact) return exact;
    const e = document.querySelector('[data-testid="tweetTextarea_0"]'),
      articles = [...document.querySelectorAll('main article[data-testid="tweet"]')];
    if (e) {
      const inside = e.closest('article[data-testid="tweet"]');
      if (inside) return inside;
      const before = articles.filter(
        (a) => a.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      if (before.length) return before.at(-1);
    }
    return articles.at(-1) || null;
  }
  const originalLabel = /^(?:hiện|xem) bản gốc$|^show original$|^view original$/i,
    scriptLanguage = globalThis.X_REPLY_LANGUAGE;
  function originalControl(article) {
    return [...(article?.querySelectorAll('button,[role="button"],a,span') || [])].find((el) =>
      originalLabel.test((el.textContent || "").trim()),
    );
  }
  function promotedArticle(article) {
    if (!article) return false;
    if (article.querySelector('[data-testid*="promoted" i],[data-testid*="sponsor" i]'))
      return true;
    const exact =
        /^(?:promoted|sponsored|ad|advertisement|quảng cáo|được quảng cáo|được tài trợ|tài trợ)$/iu,
      contains =
        /(?:promoted|sponsored|advertisement|được\s+quảng\s+cáo|quảng\s+cáo|được\s+tài\s+trợ|tài\s+trợ)/iu,
      translation = /được\s+dịch\s+từ|translated\s+from|hiện\s+bản\s+gốc|show\s+original/iu,
      ownAdLabel = (element) => {
        if (
          element.closest("article") !== article ||
          element.closest('[data-testid="quoteTweet"]') ||
          element.closest('[data-testid="tweetText"]')
        )
          return false;
        const aria = (element.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "),
          text = (element.textContent || "").trim().replace(/\s+/g, " ");
        return exact.test(aria) || exact.test(text);
      };
    // X currently renders the localized "Quảng cáo" badge as plain nested
    // div/span text without a stable test id. Detect the exact label in the
    // post header, independent of X's role=link wrappers.
    if ([...article.querySelectorAll("[aria-label],span,div")].some(ownAdLabel)) return true;
    const markers = [
      ...article.querySelectorAll('[data-testid="socialContext"],[aria-label],span,div'),
    ]
      .filter((e) => e.closest("article") === article && !insideQuote(e, article))
      .slice(0, 1200);
    return markers.some((e) => {
      const label = (e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "),
        text = (e.textContent || "").trim().replace(/\s+/g, " "),
        short = text.slice(0, 220),
        compact = short.replace(translation, " ").replace(/\s+/g, " ").trim();
      if (exact.test(label) || contains.test(label)) return true;
      if (exact.test(text) || exact.test(compact)) return true;
      if (text.length <= 120 && contains.test(text)) return true;
      if (compact.length <= 120 && contains.test(compact)) return true;
      if (contains.test(short) && translation.test(short)) return true;
      return false;
    });
  }
  function applyAdHiding() {
    // Ẩn quảng cáo chỉ áp dụng cho timeline Home. Search, trang bài viết,
    // phản hồi và các màn hình khác phải giữ nguyên nội dung X.
    const isHome = /^\/home(?:\/|$)/i.test(location.pathname);
    if (!isHome) {
      document.documentElement.classList.remove("xra-hide-ads-enabled");
      for (const [article, placeholder] of removedHomeAds) {
        if (placeholder.isConnected) placeholder.replaceWith(article);
        removedHomeAds.delete(article);
      }
      removedHomeAds.clear();
      for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
        article.classList.remove("xra-hidden-ad");
      }
      return;
    }
    document.documentElement.classList.toggle("xra-hide-ads-enabled", hideAdsEnabled);
    if (!hideAdsEnabled) {
      for (const [article, placeholder] of removedHomeAds) {
        if (placeholder.isConnected) placeholder.replaceWith(article);
        removedHomeAds.delete(article);
      }
      removedHomeAds.clear();
      for (const article of document.querySelectorAll('article[data-testid="tweet"]'))
        article.classList.remove("xra-hidden-ad");
      return;
    }
    for (const article of [...document.querySelectorAll('article[data-testid="tweet"]')]) {
      const shouldHide = hideAdsEnabled && promotedArticle(article);
      if (shouldHide) {
        if (!removedHomeAds.has(article)) {
          const placeholder = document.createComment("xra-hidden-ad");
          article.before(placeholder);
          removedHomeAds.set(article, placeholder);
          article.remove();
        }
      } else article.classList.toggle("xra-hidden-ad", shouldHide);
    }
  }
  function originalTextNode(article) {
    const nodes = [...(article?.querySelectorAll('[data-testid="tweetText"]') || [])].filter(
        (n) => n.closest("article") === article && !insideQuote(n, article),
      ),
      // X can leave the original-language node in the DOM while showing a
      // translated sibling. Prefer that node even before the translation
      // toggle finishes updating its labels.
      originalForeign = nodes.find((n) => n.lang && !/^vi(?:-|$)/i.test(n.lang)),
      notTranslated = nodes.find((n) => {
        let p = n.parentElement,
          depth = 0;
        while (p && p !== article && depth++ < 4) {
          if (/translated from|dịch từ|bản dịch/i.test(p.getAttribute("aria-label") || ""))
            return false;
          p = p.parentElement;
        }
        return true;
      });
    return (
      originalForeign ||
      notTranslated ||
      nodes[0] ||
      globalThis.XArticleContent?.node(article) ||
      null
    );
  }
  function postText(article, node = originalTextNode(article)) {
    return globalThis.XArticleContent?.text(article, node) || node?.innerText?.trim() || "";
  }
  function mediaFor(article) {
    if (!article) return { mediaUrls: [], mediaCount: 0, mediaKind: "none" };
    const own = (e) =>
        e.closest("article") === article &&
        !insideQuote(e, article) &&
        !e.closest('[data-testid="card.layoutLarge.media"]'),
      elements = [
        ...article.querySelectorAll(
          '[data-testid="tweetPhoto"] img,[data-testid="videoPlayer"] img,img[src*="pbs.twimg.com/media/"],video[poster],source[src]',
        ),
      ].filter(own),
      urls = elements.flatMap((e) => [
        e.currentSrc,
        e.src,
        e.poster,
        ...(e.getAttribute("srcset") || "").split(",").map((part) => part.trim().split(/\s+/)[0]),
      ]);
    for (const el of article.querySelectorAll(
      '[style*="pbs.twimg.com"],[style*="video.twimg.com"]',
    ))
      if (own(el))
        urls.push(...((el.getAttribute("style") || "").match(/https:\/\/[^"')]+/g) || []));
    const valid = (u) => {
        try {
          const x = new URL(u);
          return (
            x.protocol === "https:" &&
            ((x.hostname === "pbs.twimg.com" &&
              /^\/(?:media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//.test(
                x.pathname,
              )) ||
              x.hostname === "video.twimg.com")
          );
        } catch {
          return false;
        }
      },
      mediaUrls = [...new Set(urls.filter(valid))].slice(0, 4),
      hasVideo = !![...article.querySelectorAll('[data-testid="videoPlayer"],video')].find(own),
      mediaCount = [
        ...article.querySelectorAll('[data-testid="tweetPhoto"],[data-testid="videoPlayer"],video'),
      ].filter(own).length;
    return {
      mediaUrls,
      mediaCount,
      mediaKind: hasVideo ? "video_thumbnail" : mediaCount ? "images" : "none",
    };
  }
  function embeddedContext(article) {
    const quoted = [...article.querySelectorAll('[data-testid="quoteTweet"]')]
        .filter((q) => q.closest("article") === article)
        .slice(0, 2)
        .map((q) => ({
          type: "quoted_post",
          text: (q.innerText || q.textContent || "").trim().replace(/\s+/g, " ").slice(0, 1200),
        }))
        .filter((x) => x.text),
      cards = [
        ...article.querySelectorAll(
          '[data-testid^="card."], [data-testid="card.layoutLarge.media"], [data-testid="card.layoutSmall.media"]',
        ),
      ]
        .filter((c) => c.closest("article") === article && !c.closest('[data-testid="quoteTweet"]'))
        .slice(0, 2)
        .map((c) => ({
          type: "link_preview",
          text: (c.innerText || c.textContent || "").trim().replace(/\s+/g, " ").slice(0, 800),
        }))
        .filter((x) => x.text);
    return { embedded: [...quoted, ...cards] };
  }

  function targetPost() {
    const id = location.pathname.match(/\/status\/(\d+)/)?.[1],
      article = currentArticle(id),
      node = originalTextNode(article),
      text = postText(article, node),
      author = location.pathname.match(/^\/([^/]+)\/status/)?.[1];
    if (!id || !article) return null;
    const ownMedia = mediaFor(article),
      embedded = embeddedContext(article).embedded,
      articles = [...document.querySelectorAll('main article[data-testid="tweet"]')],
      before = articles
        .slice(0, articles.indexOf(article))
        .filter((a) => !promotedArticle(a) && originalTextNode(a))
        .slice(-6),
      urls = [...ownMedia.mediaUrls];
    const turns = before
      .map((a, index) => {
        const link = ownPermalink(a),
          turnMedia = mediaFor(a),
          mediaIndexes = [];
        for (const url of turnMedia.mediaUrls) {
          if (!urls.includes(url) && urls.length < 4) urls.push(url);
          if (urls.includes(url)) mediaIndexes.push(urls.indexOf(url) + 1);
        }
        return {
          turn: index + 1,
          author: urlPath(link?.href).split("/")[1] || "",
          text: postText(a),
          media_count: turnMedia.mediaCount,
          media_indexes: mediaIndexes,
        };
      })
      .filter((t) => t.text);
    if (
      !text &&
      !ownMedia.mediaCount &&
      !ownMedia.mediaUrls.length &&
      !embedded.length &&
      !turns.length
    )
      return null;
    return {
      url: `https://x.com/${author}/status/${id}`,
      postId: id,
      username: author,
      text,
      context: JSON.stringify({
        order: "oldest_to_newest",
        target_author: author,
        target_turn: { author, text },
        instruction: text
          ? "Reply directly to target_text, which is the exact latest comment/post being answered. If it is a comment, answer its claim or tone first; use the nearest ancestor/root post only as background to resolve references. Do not reply to the root post instead of the target comment, and do not repeat the root caption."
          : "The target post has no caption or only an icon. Use its own media first; if absent, use embedded quoted_post/link_preview or visible ancestor/root posts as the context being reacted to.",
        turns,
        embedded,
      }).slice(0, 3000),
      conversationDepth: turns.length + 1,
      lang: text ? scriptLanguage(text, node?.lang || "") : "",
      mediaUrls: urls,
      mediaCount: ownMedia.mediaCount + turns.reduce((sum, t) => sum + t.media_count, 0),
      mediaKind:
        ownMedia.mediaKind === "video_thumbnail"
          ? "video_thumbnail"
          : urls.length
            ? "images"
            : "none",
    };
  }
  async function readOriginalPost() {
    const id = location.pathname.match(/\/status\/(\d+)/)?.[1],
      article = currentArticle(id),
      control = originalControl(article);
    if (control) {
      (control.closest('button,[role="button"],a') || control).click();
      for (let i = 0; i < 15 && originalControl(article); i++)
        await new Promise((resolve) => setTimeout(resolve, 100));
      if (originalControl(article))
        throw new Error("Không chuyển được về nội dung gốc. Hãy bấm “Hiện bản gốc” rồi thử lại.");
    }
    let post = targetPost();
    if (post) {
      const preferences = await safeGet(["fastReplyMode"]),
        fast = true;
      let captured = {};
      for (let attempt = 0; attempt < 3; attempt++) {
        captured = await globalThis.XReplyMedia.capture(article, fast);
        const refreshed = targetPost();
        if (refreshed) post = { ...post, ...refreshed };
        if (!post.mediaCount || captured.mediaInline?.length || post.mediaUrls?.length) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
      Object.assign(post, captured);
      post.publishedAt = article.querySelector("time")?.dateTime || "";
      post.generatedAt = new Date().toISOString();
      post.clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      post.clientLocalHour = new Date().getHours();
    }
    return post;
  }
  function postFromArticle(article) {
    const link = ownPermalink(article),
      id = link?.href.match(/\/status\/(\d+)/)?.[1],
      author = urlPath(link?.href || "").split("/")[1] || "",
      node = originalTextNode(article),
      text = postText(article, node),
      ownMedia = mediaFor(article),
      embedded = embeddedContext(article).embedded,
      authorNode = article.querySelector('[data-testid="User-Name"]'),
      authorName = (
        authorNode?.querySelector('[dir="ltr"] span')?.textContent ||
        authorNode?.querySelector("span")?.textContent ||
        author
      ).trim(),
      avatar = (() => {
        const scopes = [
          article,
          article.parentElement,
          article.closest('[data-testid="cellInnerDiv"]') || null,
        ].filter(Boolean);
        for (const scope of scopes) {
          const found = [
            ...scope.querySelectorAll(
              '[data-testid^="UserAvatar-Container"] img,[data-testid*="Avatar"] img,img[src*="profile_images"],img[src*="pbs.twimg.com/profile_images"],img[alt*="avatar" i]',
            ),
          ].find((x) => x);
          if (found) return found;
          const small = [...scope.querySelectorAll("img")].find((x) => {
            const src = x.currentSrc || x.src || x.getAttribute("data-src") || "";
            const r = x.getBoundingClientRect?.();
            return (
              /profile_images|pbs\\.twimg\\.com/i.test(src) ||
              ((r?.width || 0) <= 80 && (r?.height || 0) <= 80)
            );
          });
          if (small) return small;
        }
        return null;
      })(),
      avatarUrl =
        avatar?.getAttribute("src") ||
        avatar?.getAttribute("data-src") ||
        avatar?.currentSrc ||
        avatar?.src ||
        avatar
          ?.closest('[style*="background-image"]')
          ?.style?.backgroundImage?.match(/url\\(["']?([^"')]+)["']?\\)/i)?.[1] ||
        "";
    if (!id || !article) return null;
    if (!text && !ownMedia.mediaCount && !ownMedia.mediaUrls.length && !embedded.length)
      return null;
    return {
      url: `https://x.com/${author}/status/${id}`,
      postId: id,
      username: author,
      authorName,
      handle: "@" + author,
      avatarUrl,
      text,
      context: JSON.stringify({
        instruction: text
          ? "Write a quote-post analysis about target_text and its media."
          : "The target post has no caption or only an icon. Use its own media first; if absent, use quoted_post/link_preview context.",
        embedded,
      }).slice(0, 3000),
      conversationDepth: 1,
      lang: text ? scriptLanguage(text, node?.lang || "") : "",
      mediaUrls: ownMedia.mediaUrls,
      mediaCount: ownMedia.mediaCount,
      mediaKind: ownMedia.mediaKind,
    };
  }
  async function readQuotePost(article) {
    let post = postFromArticle(article);
    if (!post) return null;
    const mediaUrls = post.mediaUrls || [],
      needsCapture = !mediaUrls.length || mediaUrls.some(isVideoMedia);
    let captured = {};
    if (needsCapture) {
      const fast = true;
      for (let attempt = 0; attempt < 2; attempt++) {
        captured = await globalThis.XReplyMedia.capture(article, fast);
        const refreshed = postFromArticle(article);
        if (refreshed) post = { ...post, ...refreshed };
        if (captured.mediaInline?.length || post.mediaUrls?.length) break;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 120));
      }
      Object.assign(post, captured);
    }
    post.publishedAt = article.querySelector("time")?.dateTime || "";
    post.generatedAt = new Date().toISOString();
    post.clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    post.clientLocalHour = new Date().getHours();
    return post;
  }
  async function composeQuoteFromArticle(article, button) {
    button.disabled = true;
    button.classList.add("xra-quote-loading");
    try {
      safeMessage({ type: "openPanel" }).catch(() => {});
      const post = await readQuotePost(article);
      if (!post) throw new Error("Không đọc được bài viết để phân tích.");
      if (
        !(await safeSet({
          quoteAnalysisState: {
            status: "loading",
            postUrl: post.url,
            updatedAt: Date.now(),
            draft: "",
            quotePost: { ...post, mediaInline: [] },
          },
        }))
      )
        return;
      const s = await safeGet([
        "provider",
        "apiKey",
        "apiModel",
        "geminiKey",
        "geminiKeys",
        "geminiModel",
        "deepseekKey",
        "deepseekModel",
        "fastReplyMode",
        "quoteExtraPrompt",
      ]);
      const provider = s.provider || "gemini",
        model =
          provider === "gemini"
            ? s.geminiModel || "gemini-3.1-flash-lite"
            : provider === "deepseek"
              ? s.deepseekModel || "deepseek-flash"
              : s.apiModel || "gpt-4.1-mini",
        extraInstruction = String(s.quoteExtraPrompt || "").trim();
      const r = await safeMessage({
        type: "composeQuotePost",
        provider,
        model,
        apiKey: s.apiKey,
        geminiKey: s.geminiKey,
        geminiKeys: s.geminiKeys,
        deepseekKey: s.deepseekKey,
        extraInstruction,
        post: { ...post, fastMode: true },
      });
      if (invalid || !r) return;
      if (!r?.ok) throw new Error(r?.error || "Không tạo được bài trích dẫn.");
      await safeSet({
        quoteAnalysisState: {
          status: "ready",
          postUrl: post.url,
          updatedAt: Date.now(),
          draft: r.data.draft,
          model: r.data.model,
          quotePost: { ...post, mediaInline: [] },
        },
      });
    } catch (error) {
      if (contextError(error)) return;
      await safeSet({
        quoteAnalysisState: {
          status: "error",
          updatedAt: Date.now(),
          error: discreet(error.message),
        },
      });
    } finally {
      button.disabled = false;
      button.classList.remove("xra-quote-loading");
    }
  }
  function topActionRow(anchor, article) {
    for (
      let node = anchor?.parentElement, depth = 0;
      node && node !== article && depth < 6;
      depth++, node = node.parentElement
    ) {
      const ownButtons = [...node.querySelectorAll('button,[role="button"],a')].filter(
          (el) => el.closest("article") === article && !insideQuote(el, article),
        ),
        hasMenu = ownButtons.some(
          (el) =>
            el.matches('[data-testid="caret"]') ||
            /more|thêm|khác|more options/i.test((el.getAttribute("aria-label") || "").trim()),
        ),
        hasAnchor = ownButtons.some(
          (el) => el === anchor || el.contains(anchor) || anchor?.contains(el),
        );
      if (hasAnchor && hasMenu && ownButtons.length <= 8) return node;
    }
    return anchor?.parentElement || null;
  }
  function clearQuoteButtons() {
    document
      .querySelectorAll(".xra-quote-top-wrap,.xra-quote-floating")
      .forEach((node) => node.remove());
    document
      .querySelectorAll('article[data-testid="tweet"]')
      .forEach((article) => delete article.dataset.xraQuoteButton);
  }
  function injectQuoteButtons() {
    const id = location.pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1];
    if (!id) {
      if (lastQuoteTarget !== null) clearQuoteButtons();
      lastQuoteTarget = null;
      return;
    }
    const target = articleFor(id);
    if (!target) {
      if (lastQuoteTarget !== id) clearQuoteButtons();
      return;
    }
    // The current target already has its control. Most X mutations are feed
    // updates; avoid rescanning every article for the same target each time.
    if (
      target.dataset.xraQuoteButton &&
      lastQuoteTarget === id &&
      target.querySelector(".xra-quote-top-wrap,.xra-quote-floating")
    )
      return;
    lastQuoteTarget = id;
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (article !== target) {
        article
          .querySelectorAll(".xra-quote-top-wrap,.xra-quote-floating")
          .forEach((node) => node.remove());
        delete article.dataset.xraQuoteButton;
        continue;
      }
      if (article.dataset.xraQuoteButton) continue;
      const link = ownPermalink(article);
      if (!link) continue;
      const own = (el) => el.closest("article") === article && !insideQuote(el, article),
        controls = [...article.querySelectorAll('button,[role="button"],a')].filter(own),
        subscribe = controls.find(
          (el) =>
            /^\d+-subscribe$/.test(el.getAttribute("data-testid") || "") ||
            /subscribe|đăng ký/i.test(
              (el.getAttribute("aria-label") || el.textContent || "").trim(),
            ),
        ),
        grok = controls.find((el) =>
          /grok|phân tích|analy/i.test(
            (el.getAttribute("aria-label") || el.textContent || "").trim(),
          ),
        ),
        caret = controls.find(
          (el) =>
            el.matches('[data-testid="caret"]') ||
            /more|thêm|khác|more options/i.test((el.getAttribute("aria-label") || "").trim()),
        );
      const anchor = subscribe || grok || caret,
        row = topActionRow(anchor, article),
        host =
          row ||
          (subscribe ? subscribe.parentElement?.parentElement : anchor?.parentElement) ||
          article;
      article.dataset.xraQuoteButton = "1";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "xra-quote-action xra-quote-top-action";
      button.title = "Viết bài trích dẫn phân tích góc nhìn";
      button.setAttribute("aria-label", "Viết bài trích dẫn phân tích góc nhìn");
      button.innerHTML =
        globalThis.AssistantIcons?.svg("quote") ||
        '<span class="ai-icon" aria-hidden="true"></span>';
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        composeQuoteFromArticle(article, button);
      };
      const wrap = document.createElement("span");
      wrap.className = "xra-quote-top-wrap";
      wrap.append(button);
      if (anchor) {
        const slot = [...host.children].find((child) => child === anchor || child.contains(anchor));
        (slot || anchor).insertAdjacentElement("beforebegin", wrap);
      } else {
        article.classList.add("xra-quote-anchor");
        button.classList.add("xra-quote-floating");
        host.append(button);
      }
    }
  }
  const replyTextareaSelector = '[data-testid^="tweetTextarea_"][contenteditable="true"]',
    replySendButtonSelector = '[data-testid="tweetButtonInline"],[data-testid="tweetButton"]';
  const isReplyControlVisible = (node) => {
    if (!node || !node.isConnected) return false;
    const rect = node.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const editor = () => {
    const editors = [...document.querySelectorAll(replyTextareaSelector)];
    return (
      editors.find((candidate) => isReplyControlVisible(candidate)) ||
      editors[0] ||
      document.querySelector('[data-testid="tweetTextarea_0"]')
    );
  };
  const modelFilledEditors = new WeakSet();
  const manuallyEditedEditors = new WeakSet();
  const manualReplyDrafts = new WeakMap();
  const autoFlowMutedSetting = (key) =>
    globalThis.__assistantAutoFlowRunning === true && ["autoReply", "autoSuggest"].includes(key);
  function syncAutoFlowSettingUi() {
    const update = (control, key) => {
      if (!["autoReply", "autoSuggest"].includes(key)) return;
      const muted = autoFlowMutedSetting(key),
        savedValue = control.dataset.savedEnabled === "true",
        value = muted ? false : savedValue;
      control.disabled = false;
      if (control.matches("button")) {
        control.classList.toggle("active", value);
        control.setAttribute("aria-pressed", String(value));
      } else control.checked = value;
      control.title = muted ? "Tạm tắt trong tab đang chạy tự động" : "";
    };
    document
      .querySelectorAll(".xra-box .xra-auto-reply,.xra-box .xra-auto-suggest")
      .forEach((button) => update(button, button.dataset.xraSettingKey));
    document
      .querySelectorAll(
        '.xra-auto-panel input[data-key="autoReply"],.xra-auto-panel input[data-key="autoSuggest"]',
      )
      .forEach((input) => update(input, input.dataset.key));
  }
  document.addEventListener("assistant-auto-flow-state", syncAutoFlowSettingUi);
  let insertingGeneratedReply = false;
  const clearSubmittedEditorMarker = (editor) =>
    setTimeout(() => {
      if (!String(editor?.innerText || editor?.textContent || "").trim()) {
        modelFilledEditors.delete(editor);
        manuallyEditedEditors.delete(editor);
      }
    }, 800);
  const replyEditorFrom = (node) => {
    const direct = node?.closest?.(replyTextareaSelector);
    if (direct) return direct;
    // X's active composer is a nested div region, not a form/dialog. Walk up
    // from the send control until its nearest shared container includes the
    // editable textbox; do not rely on a form wrapper that X does not render.
    for (let root = node; root && root !== document.documentElement; root = root.parentElement) {
      const candidate = root.matches?.(replyTextareaSelector)
        ? root
        : root.querySelector?.(replyTextareaSelector);
      if (candidate && root.querySelector?.(replySendButtonSelector)) return candidate;
    }
    return null;
  };
  function replyContextType(editor, replyText) {
    const postId = location.pathname.match(/\/status\/(\d+)/)?.[1],
      article = editor?.closest?.('article[data-testid="tweet"]') || currentArticle(postId),
      textNode = originalTextNode(article),
      text = postText(article, textNode),
      media = mediaFor(article),
      embedded = article ? embeddedContext(article).embedded : [],
      postType =
        globalThis.ReplyPreferences?.classifyType?.({
          text,
          mediaCount: media.mediaCount,
          mediaKind: media.mediaKind,
          mediaUrls: media.mediaUrls,
          embedded,
        }) || "other";
    let language = "";
    try {
      language = scriptLanguage(replyText, "") || "";
    } catch {}
    return { type: postType, language: String(language).split("-")[0], mediaKind: media.mediaKind };
  }
  async function rememberManualReply(editor, submittedText = "", submittedContext = null) {
    if (!editor || modelFilledEditors.has(editor) || !manuallyEditedEditors.has(editor)) return;
    const draft = manualReplyDrafts.get(editor),
      text = String(submittedText || draft?.text || editor.innerText || editor.textContent || "")
        .replace(/\s+/gu, " ")
        .trim();
    if (Array.from(text).length < 2) return;
    const context = submittedContext || draft?.context || replyContextType(editor, text),
      fresh = await safeGet(["replyStyleCorpus"]);
    if (!fresh || context.type === "other") return;
    const corpus = Array.isArray(fresh.replyStyleCorpus) ? fresh.replyStyleCorpus : [],
      sample = {
        type: context.type,
        language: context.language,
        mediaKind: context.mediaKind,
        reply: Array.from(text).slice(0, 180).join(""),
        createdAt: Date.now(),
      },
      normalized = sample.reply.toLocaleLowerCase(),
      unique = corpus.filter(
        (item) =>
          !(
            item?.type === sample.type &&
            item?.language === sample.language &&
            String(item?.reply || "")
              .trim()
              .toLocaleLowerCase() === normalized
          ),
      );
    unique.push(sample);
    await safeSet({ replyStyleCorpus: unique.slice(-1000) });
    manuallyEditedEditors.delete(editor);
    modelFilledEditors.delete(editor);
    manualReplyDrafts.delete(editor);
  }
  const saveSubmittedManualReply = (editor) => {
    if (!editor || modelFilledEditors.has(editor) || !manuallyEditedEditors.has(editor)) return;
    const draft = manualReplyDrafts.get(editor),
      text = String(draft?.text || editor.innerText || editor.textContent || "").trim(),
      context = draft?.context || replyContextType(editor, text);
    // Snapshot synchronously: X clears/unmounts its composer immediately after sending.
    rememberManualReply(editor, text, context).catch(() => {});
  };
  document.addEventListener(
    "input",
    (event) => {
      if (insertingGeneratedReply) return;
      const candidate = event.target?.closest?.(replyTextareaSelector);
      if (!candidate) return;
      const text = String(candidate.innerText || candidate.textContent || "").trim();
      if (!text) {
        manuallyEditedEditors.delete(candidate);
        modelFilledEditors.delete(candidate);
        manualReplyDrafts.delete(candidate);
      } else if (event.isTrusted) {
        manuallyEditedEditors.add(candidate);
        manualReplyDrafts.set(candidate, { text, context: replyContextType(candidate, text) });
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        !event.isTrusted ||
        event.key !== "Enter" ||
        event.shiftKey ||
        (!event.ctrlKey && !event.metaKey) ||
        event.isComposing
      )
        return;
      const candidate = replyEditorFrom(event.target);
      if (candidate) {
        if (modelFilledEditors.has(candidate)) {
          clearSubmittedEditorMarker(candidate);
          return;
        }
        saveSubmittedManualReply(candidate);
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      const sendButton = event.target.closest?.(replySendButtonSelector);
      if (!sendButton) return;
      const candidate = replyEditorFrom(event.target);
      if (!candidate) return;
      if (modelFilledEditors.has(candidate)) {
        clearSubmittedEditorMarker(candidate);
        return;
      }
      if (!event.isTrusted) return;
      saveSubmittedManualReply(candidate);
    },
    true,
  );
  document.addEventListener(
    "submit",
    (event) => {
      if (!event.isTrusted) return;
      const candidate = event.target?.querySelector?.(replyTextareaSelector);
      if (candidate) saveSubmittedManualReply(candidate);
    },
    true,
  );
  function activate() {
    const e = editor();
    if (e) {
      e.click();
      e.focus();
    }
  }
  function fillOnce(text) {
    const e = editor();
    if (!e) return;
    modelFilledEditors.add(e);
    insertingGeneratedReply = true;
    try {
      activate();
      if ((e.innerText || "").trim()) document.execCommand("selectAll", false);
      const transfer = new DataTransfer();
      transfer.setData("text/plain", text);
      const event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      });
      const dispatched = e.dispatchEvent(event);
      if (dispatched && !event.defaultPrevented) document.execCommand("insertText", false, text);
    } finally {
      insertingGeneratedReply = false;
    }
  }
  function fill(text, auto) {
    fillOnce(text);
    // The feedback runner submits the selected suggestion itself. Its chip
    // click must not also schedule the toolbar's auto-submit, otherwise X can
    // receive two clicks for the same reply and reject the second one as a
    // duplicate comment.
    if (
      auto &&
      globalThis.__assistantFeedbackReplyRunning !== true &&
      globalThis.__assistantAutoFlowRunning !== true
    )
      setTimeout(() => document.querySelector('[data-testid="tweetButtonInline"]')?.click(), 90);
  }
  async function openMediaPicker(query, kind = "gif") {
    const visible = (e) => {
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      },
      label = (e) =>
        `${e.getAttribute("aria-label") || ""} ${e.getAttribute("data-testid") || ""} ${e.textContent || ""}`.toLowerCase(),
      buttons = [...document.querySelectorAll('button,[role="button"]')].filter(visible),
      picker = buttons.find((e) => /(?:gif|media|ảnh|image)/i.test(label(e)));
    if (!picker) throw new Error("Không tìm thấy bộ chọn GIF/ảnh trong ô trả lời.");
    picker.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    const dialog = document.querySelector('[role="dialog"]') || document.body,
      input = [...dialog.querySelectorAll("input")].find(
        (e) =>
          visible(e) &&
          /(?:search|tìm)/i.test(
            `${e.getAttribute("placeholder") || ""} ${e.getAttribute("aria-label") || ""}`,
          ),
      );
    if (input && query) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(input, String(query));
      else input.value = String(query);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
        }),
      );
    }
    return { ok: true, kind, query };
  }
  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "panelState") {
        const b = document.querySelector(".xra-assistant-fab");
        if (b) b.hidden = !!message.open;
        sendResponse({ ok: true });
        return false;
      }
      if (message?.type === "usageMode") {
        document.querySelectorAll(".xra-box").forEach((e) => e.remove());
        if (message.mode === "x") safeMount();
        sendResponse({ ok: true });
        return false;
      }
      if (message?.type === "mountAssistant") {
        chrome.storage.local.set({ usageMode: "x" }).then(safeMount);
        sendResponse({ ok: true });
        return false;
      }
      if (message?.type === "readQuotePost") {
        const id = location.pathname.match(/\/status\/(\d+)/)?.[1],
          article = currentArticle(id);
        readQuotePost(article).then(
          (post) =>
            sendResponse({
              ok: !!post,
              post: post ? { ...post, mediaInline: [] } : null,
              error: post ? null : "Không đọc được bài viết để phân tích.",
            }),
          (e) => sendResponse({ ok: false, error: e.message }),
        );
        return true;
      }
      if (message?.type === "openMediaPicker") {
        openMediaPicker(String(message.query || ""), message.kind).then(sendResponse, (e) =>
          sendResponse({ ok: false, error: e.message }),
        );
        return true;
      }
      if (message?.type !== "fillReply") return false;
      try {
        fill(String(message.text || ""), !!message.submit);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      return false;
    });
  } catch {}
  function mountAssistantButton() {
    if (document.querySelector(".xra-assistant-fab")) return;
    const button = document.createElement("button");
    button.className = "xra-assistant-fab";
    button.title = "Mở X Assistant";
    button.setAttribute("aria-label", "Mở X Assistant");
    button.innerHTML = `<img class="xra-assistant-logo" src="${chrome.runtime.getURL("assets/logo.svg")}" alt="">`;
    let dragging = false,
      moved = false,
      startX = 0,
      startY = 0,
      startLeft = 0,
      startTop = 0;
    const clamp = () => {
      const r = button.getBoundingClientRect();
      button.style.left = Math.max(4, Math.min(window.innerWidth - r.width - 4, r.left)) + "px";
      button.style.top = Math.max(4, Math.min(window.innerHeight - r.height - 4, r.top)) + "px";
      button.style.right = "auto";
    };
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const r = button.getBoundingClientRect();
      startLeft = r.left;
      startTop = r.top;
      button.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    button.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - startX,
        dy = event.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) {
        button.style.left = startLeft + dx + "px";
        button.style.top = startTop + dy + "px";
        button.style.right = "auto";
      }
    });
    button.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      button.releasePointerCapture?.(event.pointerId);
      if (moved) {
        clamp();
        event.preventDefault();
      }
    });
    button.onclick = async (event) => {
      if (moved) {
        moved = false;
        event.preventDefault();
        return;
      }
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: "openPanel" });
        if (!result?.ok) throw new Error(result?.error || "Không mở được side panel.");
        button.hidden = true;
      } catch (error) {
        button.hidden = false;
        button.title = error.message;
      } finally {
        button.disabled = false;
      }
    };
    document.body.append(button);
  }

  let lastScrollY = scrollY;
  function updateStickyUser() {
    let card = document.querySelector(".xra-sticky-user");
    const id = location.pathname.match(/\/status\/(\d+)/)?.[1],
      article = articleFor(id),
      identity = article?.querySelector('[data-testid="User-Name"]'),
      goingDown = scrollY >= lastScrollY;
    lastScrollY = scrollY;
    if (
      !document.querySelector(".xra-box") ||
      !identity ||
      identity.getBoundingClientRect().bottom >= 8 ||
      !goingDown
    ) {
      if (card) card.hidden = true;
      return;
    }
    if (!card) {
      card = document.createElement("div");
      card.className = "xra-sticky-user";
      document.body.append(card);
    }
    const avatar = article.querySelector(
        '[data-testid="Tweet-User-Avatar"] img,div[data-testid="Tweet-User-Avatar"] img',
      ),
      lines = (identity.innerText || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
    card.replaceChildren();
    if (avatar) {
      const img = document.createElement("img");
      img.src = avatar.currentSrc || avatar.src;
      card.append(img);
    }
    const text = document.createElement("span"),
      name = document.createElement("b"),
      handle = document.createElement("small");
    name.textContent = lines.find((x) => !x.startsWith("@")) || lines[0] || "";
    handle.textContent = lines.find((x) => x.startsWith("@")) || "";
    text.append(name, handle);
    card.append(text);
    card.hidden = false;
  }
  addEventListener("scroll", () => requestAnimationFrame(updateStickyUser), {
    passive: true,
  });
  function likePost() {
    if (state.liked) return;
    const b = articleFor(state.postId)?.querySelector('[data-testid="like"]');
    if (b) {
      b.click();
      state.liked = true;
    }
  }
  function appendReplyQualityText(target, value, issues) {
    const text = String(value || ""),
      phrases = [...new Set((Array.isArray(issues) ? issues : []).map((x) => String(x).trim()))]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    if (!phrases.length) {
      target.textContent = text;
      return;
    }
    const escaped = phrases.map((phrase) =>
      [...phrase]
        .map((character) => {
          const special = ".^$|?*+()[]{}";
          return special.includes(character) ? "\\" + character : character;
        })
        .join(""),
    );
    const matcher = new RegExp(escaped.join("|"), "giu");
    let cursor = 0;
    for (const match of text.matchAll(matcher)) {
      target.append(document.createTextNode(text.slice(cursor, match.index)));
      const highlight = document.createElement("mark");
      highlight.className = "reply-quality-highlight";
      highlight.textContent = match[0];
      highlight.title = "Cụm sáo bị đánh dấu; điểm phù hợp đã giảm.";
      target.append(highlight);
      cursor = match.index + match[0].length;
    }
    target.append(document.createTextNode(text.slice(cursor)));
  }
  function render(box) {
    const results = box.querySelector(".xra-results");
    results.replaceChildren();
    if (!state.replies.length) return;
    state.replies.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    const picks = document.createElement("div");
    picks.className = "xra-pick";
    state.replies.forEach((item, i) => {
      const wrap = document.createElement("div");
      wrap.className = "xra-suggestion-wrap";
      wrap.dataset.relevanceScore = Number.isFinite(item.relevance_score)
        ? String(item.relevance_score)
        : "";
      const issues = Array.isArray(item.quality_issues) ? item.quality_issues : [];
      if (issues.length) wrap.classList.add("quality-flagged");
      const b = document.createElement("button");
      b.className = "xra-chip";
      b.classList.toggle("selected", state.selected === i);
      const row = document.createElement("span"),
        t = document.createElement("span"),
        score = document.createElement("span");
      row.className = "xra-chip-main";
      appendReplyQualityText(t, item.reply, issues);
      score.className = "xra-relevance";
      if (issues.length) {
        score.classList.add("quality-low");
        score.title = "Điểm phù hợp đã giảm do có cụm từ sáo cần cân nhắc.";
      }
      score.textContent = Number.isFinite(item.relevance_score) ? `${item.relevance_score}%` : "";
      row.append(t, score);
      b.append(row);
      if (item.translation_vi) {
        const s = document.createElement("small");
        s.className = "xra-translation";
        s.textContent = item.translation_vi;
        b.append(s);
      }
      b.onclick = () => {
        state.selected = i;
        fill(item.reply, box.querySelector(".xra-auto-reply").classList.contains("active"));
        render(box);
      };
      wrap.append(b);
      if (item.media_suggestion?.query) {
        const media = document.createElement("button");
        media.type = "button";
        media.className = "xra-media-suggestion";
        media.textContent = `${item.media_suggestion.kind === "gif" ? "GIF" : "Ảnh/meme"} · ${item.media_suggestion.query}`;
        media.title = item.media_suggestion.reason || "Mở bộ chọn media với gợi ý này";
        media.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          openMediaPicker(item.media_suggestion.query, item.media_suggestion.kind).catch(
            (error) => {
              media.title = error.message;
            },
          );
        };
        wrap.append(media);
      }
      picks.append(wrap);
    });
    results.append(picks);
    if (Number.isFinite(state.elapsedMs)) {
      const timing = document.createElement("small");
      timing.className = "xra-generation-time";
      timing.textContent =
        new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
          state.elapsedMs / 1000,
        ) + " giây";
      timing.title = "Thời gian đọc bài và nhận đầy đủ gợi ý, gồm bản dịch nếu cần";
      results.append(timing);
    }
  }
  async function mount() {
    if (invalid || mounting) return;
    mounting = true;
    const saved = await safeGet([
      "autoReply",
      "autoSuggest",
      "autoLike",
      "usageMode",
      "replyCount",
      "fastReplyMode",
      "replyMediaSuggestions",
      "replyEnterToSend",
    ]);
    if (!saved) {
      mounting = false;
      return;
    }
    // Never mount or activate reply UI inside X's global composer route. A
    // navigation to /compose/post can be caused by X while opening a post,
    // comment, or reply; letting the assistant click again here creates a
    // compose loop and steals the original target.
    if (/^\/compose\/post(?:\/|$)/i.test(location.pathname)) {
      document.querySelectorAll(".xra-box,.xra-sticky-user").forEach((e) => e.remove());
      mounting = false;
      return;
    }
    if (saved.usageMode === "panel") {
      document.querySelectorAll(".xra-box").forEach((e) => e.remove());
      mounting = false;
      return;
    }
    if (!/^\/[^/]+\/status\/\d+/.test(location.pathname)) {
      document.querySelectorAll(".xra-box").forEach((e) => e.remove());
      mounting = false;
      return;
    }
    const existing = document.querySelector(".xra-box"),
      currentId = location.pathname.match(/\/status\/(\d+)/)?.[1];
    if (existing && existing.dataset.postId !== currentId) existing.remove();
    else if (existing) {
      // X can replace the native toolbar immediately after a successful
      // reply while keeping the assistant card mounted. Re-bind the checkbox
      // and normalize the new action row instead of waiting for a full remount.
      existing.__xraRefreshComposer?.();
      mounting = false;
      return;
    }
    if (saved.autoSuggest && globalThis.__assistantAutoFlowRunning !== true)
      globalThis.XReplyMedia?.prime(currentArticle(currentId), !!saved.fastReplyMode);
    let e = editor();
    if (!e) {
      const id = location.pathname.match(/\/status\/(\d+)/)?.[1],
        reply = articleFor(id)?.querySelector('[data-testid="reply"]');
      // Opening the native Reply button is only part of an explicitly
      // enabled automatic run. Normal navigation must not activate the
      // Reply tab/editor by itself.
      if (globalThis.__assistantAutoFlowRunning === true && reply && !reply.dataset.xraOpened) {
        reply.dataset.xraOpened = "1";
        reply.click();
        setTimeout(safeMount, 250);
      }
      mounting = false;
      return;
    }
    const post = targetPost();
    if (post?.postId !== state.postId)
      state = {
        postId: post?.postId || null,
        replies: [],
        replyHistory: [],
        selected: null,
        generated: false,
        liked: false,
      };
    activate();
    const host =
        e.closest('[data-testid="tweetTextarea_0_label"]')?.parentElement?.parentElement ||
        e.parentElement,
      box = document.createElement("div");
    box.className = "xra-box";
    box.dataset.postId = post?.postId || "";
    const icon = (name) => globalThis.AssistantIcons?.svg(name) || "";
    box.innerHTML = `<div class="xra-tools"><span class="xra-spacer"></span><div class="xra-tools-group xra-tools-left"><button class="xra-button xra-generate" title="Tạo gợi ý"><span class="ai-icon" aria-hidden="true"></span></button><button class="xra-button xra-sync" title="Tạo lại">${icon("refresh")}</button></div><div class="xra-tools-group xra-tools-right"><div class="xra-count-wrap"><button class="xra-count" title="Số lượng gợi ý">2</button><div class="xra-count-menu" hidden></div></div><button class="xra-button xra-settings" title="Cài đặt tự động">${icon("setting")}</button></div><div class="xra-tools-group xra-tools-hidden"><button class="xra-button xra-auto-suggest" title="Tự gợi ý khi mở bài">${icon("sparkles")}</button><button class="xra-button xra-auto-like" title="Tự like khi mở bài">${icon("heart")}</button><button class="xra-button xra-auto-reply" title="Tự đăng khi chọn gợi ý">${icon("send")}</button></div></div><div class="xra-results"></div>`;
    const tools = box.querySelector(".xra-tools");
    const generate = box.querySelector(".xra-generate"),
      sync = box.querySelector(".xra-sync");
    sync.innerHTML = icon("refresh");
    let run,
      running = false,
      pending = false;
    const pairIcon = (selector, name) => {
      const button = box.querySelector(selector),
        outline = button.querySelector("svg"),
        host = document.createElement("span");
      outline.classList.add("xra-icon-outline");
      host.innerHTML = icon(name);
      const filled = host.firstElementChild;
      filled?.classList.add("xra-icon-filled");
      if (filled) button.append(filled);
    };
    pairIcon(".xra-auto-suggest", "sparkles");
    pairIcon(".xra-auto-like", "heart");
    pairIcon(".xra-auto-reply", "send");
    let replyCount = Math.min(10, Math.max(1, Number(saved.replyCount) || 2));
    const countButton = box.querySelector(".xra-count"),
      countMenu = box.querySelector(".xra-count-menu");
    countButton.textContent = replyCount;
    for (let i = 1; i <= 10; i++) {
      const button = document.createElement("button");
      button.textContent = i;
      button.onclick = () => {
        replyCount = i;
        countButton.textContent = i;
        countMenu.hidden = true;
        chrome.storage.local.set({ replyCount: i }).catch(() => {});
      };
      countMenu.append(button);
    }
    countButton.onclick = () => {
      countMenu.hidden = !countMenu.hidden;
    };
    const toggle = (button, key, value) => {
      button.dataset.xraSettingKey = key;
      button.dataset.savedEnabled = String(!!value);
      button.classList.toggle("active", !!value && !autoFlowMutedSetting(key));
      button.setAttribute("aria-pressed", String(!!value && !autoFlowMutedSetting(key)));
      button.disabled = false;
      button.onclick = () => {
        const next = !button.classList.contains("active");
        button.dataset.savedEnabled = String(next);
        button.classList.toggle("active", next);
        button.setAttribute("aria-pressed", String(next));
        try {
          chrome.storage.local.set({ [key]: next }).catch(() => {});
        } catch {}
        if (key === "autoLike" && next) likePost();
        if (
          key === "autoSuggest" &&
          next &&
          !globalThis.__assistantAutoFlowRunning &&
          !state.generated
        )
          run(false);
      };
    };
    toggle(box.querySelector(".xra-auto-reply"), "autoReply", !!saved.autoReply);
    toggle(box.querySelector(".xra-auto-suggest"), "autoSuggest", !!saved.autoSuggest);
    toggle(box.querySelector(".xra-auto-like"), "autoLike", !!saved.autoLike);
    const gear = box.querySelector(".xra-settings") || document.createElement("button");
    gear.className = "xra-button xra-settings";
    gear.title = "Cài đặt tự động";
    gear.innerHTML = icon("setting");
    if (!gear.parentElement) tools.querySelector(".xra-tools-right")?.append(gear);
    const autoPanel = document.createElement("div");
    autoPanel.className = "xra-auto-panel";
    autoPanel.hidden = true;
    autoPanel.innerHTML =
      '<label><span><b>Tự động tạo gợi ý khi mở bài đăng</b></span><input type="checkbox" data-key="autoSuggest"></label><label><span><b>Tự thả like</b></span><input type="checkbox" data-key="autoLike"></label><label><span><b>Tự bấm trả lời sau khi chọn gợi ý</b></span><input type="checkbox" data-key="autoReply"></label><label><span><b>Gợi ý GIF/ảnh</b><small>Đề xuất media khi phù hợp</small></span><input type="checkbox" data-key="replyMediaSuggestions"></label>';
    box.querySelector(".xra-results").before(autoPanel);
    for (const input of autoPanel.querySelectorAll("input")) {
      input.dataset.savedEnabled = String(!!saved[input.dataset.key]);
      input.checked = !!saved[input.dataset.key] && !autoFlowMutedSetting(input.dataset.key);
      input.disabled = false;
      input.onchange = () => {
        const key = input.dataset.key,
          value = input.checked;
        input.dataset.savedEnabled = String(value);
        chrome.storage.local.set({ [key]: value }).catch(() => {});
        box
          .querySelector(`.xra-${key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`)
          ?.classList.toggle("active", value);
        if (key === "autoLike" && value) likePost();
        if (
          key === "autoSuggest" &&
          value &&
          !globalThis.__assistantAutoFlowRunning &&
          !state.generated
        )
          run(false);
      };
    }
    gear.onclick = () => {
      autoPanel.hidden = !autoPanel.hidden;
      gear.classList.toggle("active", !autoPanel.hidden);
    };
    const enterReply = document.createElement("label");
    enterReply.className = "xra-enter-send";
    enterReply.title = "Khi bật, nhấn Enter sẽ bấm nút Trả lời";
    enterReply.innerHTML =
      '<input type="checkbox" data-key="replyEnterToSend"><span>Nhấn Enter để trả lời</span>';
    const enterInput = enterReply.querySelector("input");
    enterInput.checked = !!saved.replyEnterToSend;
    enterInput.onchange = () => {
      chrome.storage.local.set({ replyEnterToSend: enterInput.checked }).catch(() => {});
    };
    const findSendButton = () => {
      const buttons = [...document.querySelectorAll(replySendButtonSelector)].filter(
        isReplyControlVisible,
      );
      return buttons.find((button) => replyEditorFrom(button) === e) || buttons[0] || null;
    };
    let remountBox = null,
      refreshComposer = null,
      composerStructureObserver = null,
      composerObserverTimer = 0;
    const positionEnterReply = () => {
      const sendButton = findSendButton();
      if (!sendButton) return false;
      const sendHost = sendButton.parentElement;
      const actionRow = sendHost?.parentElement;
      if (!actionRow) return false;
      const progressHost = [...actionRow.children].find((child) =>
        child.querySelector?.('[data-testid="dual-phase-countdown-circle"],[role="progressbar"]'),
      );
      const anchor = progressHost || sendHost;
      if (enterReply.parentElement !== actionRow || enterReply.nextElementSibling !== anchor)
        actionRow.insertBefore(enterReply, anchor);
      return actionRow;
    };
    let normalizedActionRow = null,
      composerStack = null,
      composerActionRow = null;
    const clearComposerStackStyles = () => {
      composerStack?.style.removeProperty("flex-wrap");
      composerStack?.style.removeProperty("align-items");
      box.style.removeProperty("flex");
      box.style.removeProperty("width");
      box.style.removeProperty("max-width");
      composerActionRow?.style.removeProperty("flex");
      composerActionRow?.style.removeProperty("width");
      composerActionRow?.style.removeProperty("max-width");
      composerActionRow?.style.removeProperty("position");
      composerActionRow?.style.removeProperty("inset");
    };
    const restoreComposerStack = () => {
      clearComposerStackStyles();
      composerStack?.classList.remove("xra-composer-stack");
      composerActionRow?.classList.remove("xra-composer-action-row");
      composerStack = null;
      composerActionRow = null;
    };
    const normalizeComposerStack = (actionRow) => {
      let parent = box.parentElement;
      for (let node = parent; node && node !== document.body; node = node.parentElement) {
        const display = getComputedStyle(node).display;
        if (node.contains(actionRow) && (display === "flex" || display === "inline-flex")) {
          parent = node;
          break;
        }
      }
      if (!parent || !actionRow) return null;
      // The native X toolbar is nested several levels below the composer
      // stack. Style only the direct flex item that contains our reply row;
      // styling the native row itself can hide GIF/image/emoji controls.
      let actionBranch = actionRow;
      while (actionBranch.parentElement && actionBranch.parentElement !== parent)
        actionBranch = actionBranch.parentElement;
      if (actionBranch.parentElement !== parent) return null;
      if (composerStack && composerStack !== parent) restoreComposerStack();
      if (composerActionRow && composerActionRow !== actionBranch)
        composerActionRow.classList.remove("xra-composer-action-row");
      composerStack = parent;
      composerActionRow = actionBranch;
      parent.classList.add("xra-composer-stack");
      actionBranch.classList.add("xra-composer-action-row");
      // X may apply its flex rules after our stylesheet. Inline priority keeps
      // both rows stable while the suggestion state is changing.
      const flexDirection = getComputedStyle(parent).flexDirection || "row";
      parent.style.setProperty(
        "flex-wrap",
        flexDirection.includes("column") ? "nowrap" : "wrap",
        "important",
      );
      parent.style.setProperty("align-items", "stretch", "important");
      box.style.setProperty("flex", "0 0 100%", "important");
      box.style.setProperty("width", "100%", "important");
      box.style.setProperty("max-width", "100%", "important");
      actionBranch.style.setProperty("flex", "0 0 100%", "important");
      actionBranch.style.setProperty("width", "100%", "important");
      actionBranch.style.setProperty("max-width", "100%", "important");
      // X marks this branch sticky so it can stay at the bottom of a normal
      // composer. Once the assistant card is inserted, that makes the native
      // toolbar jump above the card. Keep the branch in normal flow while
      // preserving all native controls inside it.
      actionBranch.style.setProperty("position", "static", "important");
      actionBranch.style.setProperty("inset", "auto", "important");
      return parent;
    };
    const restoreComposerActionRow = () => {
      if (!normalizedActionRow) return;
      normalizedActionRow.classList.remove("xra-native-action-row");
      normalizedActionRow.style.removeProperty("position");
      normalizedActionRow.style.removeProperty("inset");
      normalizedActionRow = null;
    };
    const normalizeComposerActionRow = () => {
      let stickyRow = null;
      for (let node = enterReply.parentElement; node && node !== document.body; node = node.parentElement) {
        if (
          getComputedStyle(node).position === "sticky" &&
          node.querySelector?.(replySendButtonSelector)
        ) {
          stickyRow = node;
          break;
        }
      }
      if (normalizedActionRow && normalizedActionRow !== stickyRow) restoreComposerActionRow();
      normalizedActionRow = stickyRow;
      if (!stickyRow) return null;
      // The direct action branch is normalized above. Do not modify an outer
      // sticky ancestor, which could hide controls belonging to another X
      // composer.
      return stickyRow;
    };
    let enterReplyObserver = null,
      observedActionRow = null,
      observedStickyRow = null;
    const watchActionRow = (actionRow) => {
      if (!actionRow) return;
      if (observedActionRow === actionRow && enterReplyObserver) return;
      enterReplyObserver?.disconnect();
      observedActionRow = actionRow;
      let observerTimer = 0;
      const observer = new MutationObserver(() => {
        if (observerTimer) return;
        observerTimer = setTimeout(() => {
          observerTimer = 0;
          if (!box.isConnected || !e.isConnected) {
            observer.disconnect();
            enterReplyObserver = null;
            observedActionRow = null;
            composerStructureObserver?.disconnect();
            composerStructureObserver = null;
            observedStickyRow = null;
            restoreComposerStack();
            restoreComposerActionRow();
            enterReply.remove();
            return;
          }
          const nextRow = positionEnterReply();
          normalizeComposerStack(nextRow);
          normalizeComposerActionRow();
          if (nextRow && nextRow !== actionRow) {
            observer.disconnect();
            observedActionRow = null;
            watchActionRow(nextRow);
            return;
          }
          // mountBox is now idempotent; only run it once per coalesced batch
          // instead of recursively reacting to our own DOM move.
          if (nextRow) remountBox?.();
        }, 120);
      });
      enterReplyObserver = observer;
      observer.observe(actionRow, { childList: true, subtree: true });
    };
    const watchComposerStructure = (stickyRow) => {
      const root = stickyRow?.parentElement;
      if (!root) return;
      if (observedStickyRow === stickyRow && composerStructureObserver) return;
      composerStructureObserver?.disconnect();
      observedStickyRow = stickyRow;
      composerStructureObserver = new MutationObserver((records) => {
        if (
          records.length &&
          records.every((record) =>
            record.target?.closest?.(".xra-box,.xra-enter-send"),
          )
        )
          return;
        if (composerObserverTimer) return;
        composerObserverTimer = setTimeout(() => {
          composerObserverTimer = 0;
          if (!box.isConnected || !e.isConnected) {
            composerStructureObserver?.disconnect();
            composerStructureObserver = null;
            observedStickyRow = null;
            observedActionRow = null;
            enterReplyObserver?.disconnect();
            enterReplyObserver = null;
            restoreComposerStack();
            restoreComposerActionRow();
            enterReply.remove();
            return;
          }
          const nextRow = positionEnterReply();
          normalizeComposerStack(nextRow);
          const nextStickyRow = normalizeComposerActionRow();
          if (nextRow) watchActionRow(nextRow);
          if (nextStickyRow) watchComposerStructure(nextStickyRow);
          remountBox?.();
        }, 0);
      });
      composerStructureObserver.observe(root, { childList: true, subtree: true });
    };
    const initialActionRow = positionEnterReply();
    const initialStickyRow = normalizeComposerActionRow();
    refreshComposer = () => {
      const nextRow = positionEnterReply();
      normalizeComposerStack(nextRow);
      const nextStickyRow = normalizeComposerActionRow();
      if (nextRow) watchActionRow(nextRow);
      if (nextStickyRow) watchComposerStructure(nextStickyRow);
      remountBox?.();
    };
    box.__xraRefreshComposer = refreshComposer;
    if (initialStickyRow) watchComposerStructure(initialStickyRow);
    if (initialActionRow) watchActionRow(initialActionRow);
    else {
      const retryObserver = new MutationObserver(() => {
        const actionRow = positionEnterReply();
        if (actionRow) {
          normalizeComposerStack(actionRow);
          const stickyRow = normalizeComposerActionRow();
          if (stickyRow) watchComposerStructure(stickyRow);
          remountBox?.();
          retryObserver.disconnect();
          watchActionRow(actionRow);
        }
      });
      retryObserver.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => retryObserver.disconnect(), 5000);
    }
    e.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.isComposing ||
          !enterInput.checked
        )
          return;
        const sendButton = findSendButton();
        if (
          !sendButton ||
          sendButton.disabled ||
          sendButton.getAttribute("aria-disabled") === "true"
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        setTimeout(() => {
          const current = findSendButton();
          if (current && !current.disabled && current.getAttribute("aria-disabled") !== "true")
            current.click();
        }, 0);
      },
      true,
    );
    syncAutoFlowSettingUi();
    run = async (force) => {
      // Auto-flow owns the single generation request for the current post.
      // Other triggers (autoSuggest, style changes, or a second click) must
      // not start a competing request while that flow is active. The auto
      // loop sets this short-lived flag only for its deliberate click.
      if (
        globalThis.__assistantAutoFlowRunning === true &&
        globalThis.__assistantAutoFlowPaused !== true &&
        !globalThis.__assistantAutoFlowRequest
      )
        return;
      if (running) {
        pending = true;
        return;
      }
      const started = performance.now();
      running = true;
      state.generated = true;
      generate.disabled = sync.disabled = true;
      const results = box.querySelector(".xra-results");
      results.classList.remove("xra-error");
      results.innerHTML =
        '<span class="xra-loading"></span><span class="xra-loading-label">Đang viết gợi ý…</span>';
      try {
        const post = await readOriginalPost();
        if (!post) throw new Error("Chưa đọc được bài viết gốc.");
        const s = await safeGet([
          "provider",
          "apiKey",
          "apiModel",
          "chatgptModel",
          "geminiKey",
          "geminiKeys",
          "geminiModel",
          "deepseekKey",
          "deepseekModel",
          "styleId",
          "stylePrompt",
          "styleMinWords",
          "styleMaxWords",
          "replyStyleCatalog",
          "customStyles",
          "replyTone",
          "replyMediaSuggestions",
          "feedbackExtraContext",
        ]);
        if (!s) throw new Error("Hãy tải lại trang X.");
        const provider = s.provider || "gemini";
        if (provider === "api" && !/^sk-[A-Za-z0-9_-]{20,}$/.test(s.apiKey || ""))
          throw new Error("Mở side panel và nhập API key.");
        if (provider === "chatgpt" && !s.chatgptModel)
          throw new Error("Kết nối ChatGPT và chọn model.");
        if (provider === "gemini" && !s.geminiKey)
          throw new Error("Nhập Gemini API key trong cài đặt.");
        if (provider === "deepseek" && !s.deepseekKey)
          throw new Error("Nhập DeepSeek API key trong cài đặt.");
        const model =
          provider === "chatgpt"
            ? s.chatgptModel
            : provider === "gemini"
              ? s.geminiModel || "gemini-3.1-flash-lite"
              : provider === "deepseek"
                ? s.deepseekModel || "deepseek-flash"
                : s.apiModel || "gpt-4.1-mini";
        const styleCatalog = [
          ...(Array.isArray(s.replyStyleCatalog) ? s.replyStyleCatalog : []),
          ...(Array.isArray(s.customStyles) ? s.customStyles : []),
        ];
        const selectedStyle = styleCatalog.find((item) => item?.id === s.styleId) || null;
        const selectedStylePrompt = selectedStyle?.prompt || s.stylePrompt || "";
        // Keep the numeric constraint alongside the prompt. A style can be
        // enriched by preferences/corpus hints later, so it is safer to pass
        // the user setting as structured data instead of re-parsing the prompt.
        const styleMinWords = Math.min(100, Math.max(1, Number(s.styleMinWords) || 6));
        const styleWordRange = {
          min: styleMinWords,
          max: Math.min(100, Math.max(styleMinWords, Number(s.styleMaxWords) || 10)),
        };
        const data = await request({
          provider,
          apiKey: s.apiKey,
          geminiKey: s.geminiKey,
          geminiKeys: s.geminiKeys,
          deepseekKey: s.deepseekKey,
          model,
          force,
          post: {
            ...post,
            feedbackExtraContext: String(s.feedbackExtraContext || "").slice(0, 500),
            style:
              selectedStylePrompt +
              " " +
              (s.replyTone === "male"
                ? "The reply author is male. Use a natural masculine voice while preserving the post's original language; do not mention gender."
                : s.replyTone === "female"
                  ? "The reply author is female. Use a natural feminine voice while preserving the post's original language; do not mention gender."
                  : ""),
            styleWordRange,
            replyCount,
            fastMode: !!s.fastReplyMode,
            excludeReplies: force ? state.replyHistory : [],
            replyMediaSuggestions: !!s.replyMediaSuggestions,
          },
        });
        if (
          !pending &&
          box.isConnected &&
          location.pathname.match(/\/status\/(\d+)/)?.[1] === box.dataset.postId
        ) {
          state.replies = data.result.replies;
          state.replyHistory = [
            ...new Set([
              ...state.replyHistory,
              ...(state.replies || []).map((x) => x.reply).filter(Boolean),
            ]),
          ].slice(-30);
          state.selected = null;
          state.elapsedMs = performance.now() - started;
          render(box);
        }
      } catch (err) {
        results.textContent = err.message;
        results.classList.add("xra-error");
      } finally {
        running = false;
        generate.disabled = sync.disabled = false;
        if (pending && box.isConnected) {
          pending = false;
          run(true);
        }
      }
    };
    document.addEventListener("xra-style-changed", () => {
      if (box.isConnected && (running || state.replies.length)) run(true);
    });
    generate.onclick = () => run(false);
    sync.onclick = () => run(true);
    const mountBox = () => {
      if (box.parentElement === host.parentElement && box.previousElementSibling === host)
        return true;
      host.insertAdjacentElement("afterend", box);
      return true;
    };
    remountBox = mountBox;
    const mounted = mountBox();
    if (mounted) normalizeComposerStack(positionEnterReply());
    if (!mounted) {
      const retryMount = (attempt = 0) => {
        if (!box.isConnected || !e.isConnected || mountBox() || attempt >= 20) return;
        setTimeout(() => retryMount(attempt + 1), 250);
      };
      retryMount();
      const mountObserver = new MutationObserver(() => {
        if (mountObserver._timer) return;
        mountObserver._timer = setTimeout(() => {
          mountObserver._timer = 0;
          if (!box.isConnected || !e.isConnected) {
            mountObserver.disconnect();
            return;
          }
          if (mountBox()) mountObserver.disconnect();
        }, 120);
      });
      mountObserver.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => mountObserver.disconnect(), 5000);
    }
    render(box);
    applyAiIconMask(box);
    if (saved.autoLike) likePost();
    if (saved.autoSuggest && globalThis.__assistantAutoFlowRunning !== true && !state.generated)
      run(false);
    mounting = false;
  }
  document.addEventListener(
    "click",
    (event) => {
      if (!event.target.closest?.('[data-testid="tweetButtonInline"]') || state.selected === null)
        return;
      const used = state.selected;
      setTimeout(() => {
        state.replies.splice(used, 1);
        state.selected = null;
        const box = document.querySelector(".xra-box");
        if (box) render(box);
      }, 0);
    },
    true,
  );
  let mountTimer = 0,
    adHideTimer = 0,
    lastAdHidePath = location.pathname;
  const scheduleAdHiding = () => {
    const path = location.pathname,
      routeChanged = path !== lastAdHidePath;
    lastAdHidePath = path;
    // Ad hiding only needs to run on Home, and only when it is enabled. A
    // route change still gets one pass so removed Home ads can be restored.
    if (!routeChanged && (!hideAdsEnabled || !/^\/home(?:\/|$)/i.test(path))) return;
    if (adHideTimer) return;
    adHideTimer = setTimeout(
      () => {
        adHideTimer = 0;
        applyAdHiding();
      },
      routeChanged ? 0 : 750,
    );
  };
  const safeMount = () => {
    injectQuoteButtons();
    mountAssistantButton();
    applyAiIconMask();
    const launcher = document.querySelector(".xra-assistant-fab");
    if (launcher) {
      launcher.title = "Mở Assistant";
      launcher.setAttribute("aria-label", "Mở Assistant");
    }
    mount().catch((e) => {
      mounting = false;
      if (contextError(e)) {
        invalid = true;
        observer?.disconnect();
      } else console.error("Assistant:", discreet(e.message));
    });
  };
  // The automatic flow may open X's native reply editor after navigation.
  // Mount immediately when that flow signals the editor is ready instead of
  // waiting for another unrelated mutation batch.
  window.addEventListener("assistant-auto-flow-mount", safeMount);
  const scheduleMount = () => {
    // Coalesce X's frequent feed mutations instead of restarting a full-page
    // scan for every small DOM update. A fixed window also avoids starvation
    // while X is continuously streaming timeline changes.
    if (mountTimer) return;
    mountTimer = setTimeout(() => {
      mountTimer = 0;
      // Ads are injected lazily as the feed streams in. Re-run the ad pass
      // on every DOM batch instead of checking only during initial load or a
      // settings change.
      scheduleAdHiding();
      safeMount();
    }, 500);
  };
  const assistantOwnedMutation = (node) => {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!element?.closest?.(
      ".xra-box,.xra-sticky-user,.xra-assistant-fab,.xra-quote-top-wrap,.xra-quote-floating",
    );
  };
  observer = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      if (assistantOwnedMutation(record.target)) return false;
      const changed = [...record.addedNodes, ...record.removedNodes];
      return !changed.length || changed.some((node) => !assistantOwnedMutation(node));
    });
    if (relevant) {
      scheduleMount();
      scheduleAdHiding();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  safeGet(["hideAds"]).then((s) => {
    hideAdsEnabled = !!s?.hideAds;
    applyAdHiding();
  });
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && Object.hasOwn(changes, "hideAds")) {
        hideAdsEnabled = !!changes.hideAds.newValue;
        applyAdHiding();
      }
      scheduleMount();
    });
  } catch {}
  safeMount();
  // Cho phép nút Phân tích chuyển thành nút dừng trong lúc chờ mô hình, không khoá nút.
  async function composeQuoteFromArticle(article, button) {
    if (button.dataset.xraQuoteRunning === "1") {
      button.dataset.xraQuoteCancel = "1";
      button.title = "Đang dừng phân tích…";
      button.setAttribute("aria-label", "Đang dừng phân tích…");
      return;
    }
    button.dataset.xraQuoteRunning = "1";
    button.dataset.xraQuoteCancel = "0";
    button.classList.add("xra-quote-loading");
    button.title = "Dừng phân tích";
    button.setAttribute("aria-label", "Dừng phân tích");
    const cancelled = () => button.dataset.xraQuoteCancel === "1";
    try {
      safeMessage({ type: "openPanel" }).catch(() => {});
      const post = await readQuotePost(article);
      if (cancelled()) return;
      if (!post) throw new Error("Không đọc được bài viết để phân tích.");
      if (
        !(await safeSet({
          quoteAnalysisState: {
            status: "loading",
            postUrl: post.url,
            updatedAt: Date.now(),
            draft: "",
            quotePost: { ...post, mediaInline: [] },
          },
        })) ||
        cancelled()
      )
        return;
      const s = await safeGet([
        "provider",
        "apiKey",
        "apiModel",
        "geminiKey",
        "geminiKeys",
        "geminiModel",
        "deepseekKey",
        "deepseekModel",
        "fastReplyMode",
        "quoteExtraPrompt",
      ]);
      if (cancelled()) return;
      const provider = s.provider || "gemini",
        model =
          provider === "gemini"
            ? s.geminiModel || "gemini-3.1-flash-lite"
            : provider === "deepseek"
              ? s.deepseekModel || "deepseek-flash"
              : s.apiModel || "gpt-4.1-mini",
        extraInstruction = String(s.quoteExtraPrompt || "").trim();
      const request = safeMessage({
          type: "composeQuotePost",
          provider,
          model,
          apiKey: s.apiKey,
          geminiKey: s.geminiKey,
          geminiKeys: s.geminiKeys,
          deepseekKey: s.deepseekKey,
          extraInstruction,
          post: { ...post, fastMode: true },
        }),
        timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Phân tích quá lâu, hãy bấm lại để thử lại.")), 30000),
        );
      const r = await Promise.race([request, timeout]);
      if (cancelled()) return;
      if (invalid || !r) return;
      if (!r?.ok) throw new Error(r?.error || "Không tạo được bài trích dẫn.");
      await safeSet({
        quoteAnalysisState: {
          status: "ready",
          postUrl: post.url,
          updatedAt: Date.now(),
          draft: r.data.draft,
          model: r.data.model,
          quotePost: { ...post, mediaInline: [] },
        },
      });
    } catch (error) {
      if (contextError(error) || cancelled()) return;
      await safeSet({
        quoteAnalysisState: {
          status: "error",
          updatedAt: Date.now(),
          error: discreet(error.message),
        },
      });
    } finally {
      const wasCancelled = cancelled();
      button.dataset.xraQuoteRunning = "0";
      button.dataset.xraQuoteCancel = "0";
      button.classList.remove("xra-quote-loading");
      button.disabled = false;
      button.title = "Viết bài trích dẫn phân tích góc nhìn";
      button.setAttribute("aria-label", "Viết bài trích dẫn phân tích góc nhìn");
      if (wasCancelled)
        await safeSet({
          quoteAnalysisState: {
            status: "error",
            updatedAt: Date.now(),
            error: "Đã dừng phân tích.",
          },
        });
    }
  }
})();

// Scope reply-editor detection to the active status article; never mount into X's global post composer.
globalThis.__xraScopedEditorFix = true;
