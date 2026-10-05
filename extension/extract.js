(async () => {
  const match = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/|$)/);
  if (!match) return { error: 'Mở trực tiếp một bài hoặc bình luận: https://x.com/user/status/id.' };
  const [ , username, postId ] = match; // ID là chuỗi: không dùng Number/parseInt với snowflake ID.
  function insideQuote(element, article) {
    for (let node = element.parentElement; node && node !== article; node = node.parentElement) {
      if (node.dataset.testid === 'quoteTweet' || (node.tagName !== 'A' && node.getAttribute('role') === 'link')) return true;
    }
    return false;
  }
  function ownPermalink(article) {
    return [...article.querySelectorAll('a[href]')].find(anchor => {
      if (!anchor.querySelector('time') || anchor.closest('article') !== article || insideQuote(anchor, article)) return false;
      const path = new URL(anchor.href, location.origin).pathname;
      return /^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/.test(path);
    });
  }
  const articles = [...document.querySelectorAll('main article[data-testid="tweet"]')];
  const target = articles.find(article => {
    const anchor = ownPermalink(article);
    return anchor && new URL(anchor.href).pathname.match(/\/status\/(\d+)$/)?.[1] === postId;
  });
  if (!target) return { error: 'Chưa thấy đúng bài theo ID trên URL. Chờ X tải xong, cuộn tới bài rồi bấm Đọc bài X.' };
  const originalLabels = /^(?:hiện|xem) bản gốc$|^show original$|^view original$/i;
  const translatedLabels = /được dịch từ|translated from/i;
  const originalControl = article => [...article.querySelectorAll('button,[role="button"],a,span')].find(el => originalLabels.test((el.textContent || '').trim()));
  async function restoreOriginal(article) {
    const control = originalControl(article);
    if (!control) return true;
    (control.closest('button,[role="button"],a') || control).click();
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!originalControl(article) && !translatedLabels.test(article.innerText || '')) return true;
    }
    return !originalControl(article);
  }
  if (!(await restoreOriginal(target))) return { error: 'X đang hiển thị bản dịch tự động và chưa chuyển được về bản gốc. Hãy bấm “Hiện bản gốc” rồi đọc lại.' };
  const scriptLanguage=globalThis.X_REPLY_LANGUAGE;
  function textNode(article) {
    const nodes = [...article.querySelectorAll('[data-testid="tweetText"]')].filter(node => node.closest('article') === article && !insideQuote(node, article));
    const originalForeign = nodes.find(node => node.lang && !/^vi(?:-|$)/i.test(node.lang));
    const notTranslated = nodes.find(node => {
      let parent = node.parentElement, depth = 0;
      while (parent && parent !== article && depth++ < 4) {
        if (/translated from|dịch từ|bản dịch/i.test(parent.getAttribute('aria-label') || '')) return false;
        parent = parent.parentElement;
      }
      return true;
    });
    return originalForeign || notTranslated || nodes[0];
  }
  function embeddedContext(article) {
    const quoted = [...article.querySelectorAll('[data-testid="quoteTweet"]')]
      .filter(node => node.closest('article') === article)
      .slice(0, 2)
      .map(node => ({ type: 'quoted_post', text: (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 1200) }))
      .filter(item => item.text);
    const cards = [...article.querySelectorAll('[data-testid^="card."], [data-testid="card.layoutLarge.media"], [data-testid="card.layoutSmall.media"]')]
      .filter(node => node.closest('article') === article && !node.closest('[data-testid="quoteTweet"]'))
      .slice(0, 2)
      .map(node => ({ type: 'link_preview', text: (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 800) }))
      .filter(item => item.text);
    return [...quoted, ...cards];
  }
  const node = textNode(target);
  const text = node?.innerText?.trim() || '';
  const embedded = embeddedContext(target);
  const userName = target.querySelector('[data-testid="User-Name"]');
  const displayName = [...(userName?.querySelectorAll('span') || [])].map(el => el.textContent?.trim()).find(value => value && !value.startsWith('@') && value !== '·') || username;
  const avatarUrl = target.querySelector('[data-testid="Tweet-User-Avatar"] img')?.src || '';
  const mediaElements = [...target.querySelectorAll('[data-testid="tweetPhoto"] img, [data-testid="videoPlayer"] img, img[src*="pbs.twimg.com/media/"], video[poster], source[src]')].filter(el => el.closest('article') === target && !insideQuote(el, target) && !el.closest('[data-testid="card.layoutLarge.media"]'));
  const candidates = mediaElements.flatMap(el => {
    const srcset = (el.getAttribute('srcset') || '').split(',').map(part => part.trim().split(/\s+/)[0]);
    return [el.currentSrc, el.src, el.poster, ...srcset];
  });
  for (const el of target.querySelectorAll('[style*="pbs.twimg.com"], [style*="video.twimg.com"]')) {
    if (el.closest('article') !== target || insideQuote(el, target)) continue;
    candidates.push(...(el.getAttribute('style') || '').match(/https:\/\/[^"')]+/g) || []);
  }
  const validMediaUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && ((url.hostname === 'pbs.twimg.com' && /^\/(?:media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//.test(url.pathname)) || url.hostname === 'video.twimg.com'); } catch { return false; } };
  let mediaUrls = [...new Set(candidates.filter(validMediaUrl))].slice(0, 4);
  const previewMediaUrls = [...mediaUrls];
  const hasVideo = Boolean([...target.querySelectorAll('[data-testid="videoPlayer"], video')].find(el => el.closest('article') === target && !insideQuote(el, target) && !el.closest('[data-testid="card.layoutLarge.media"]')));
  let mediaCount = [...target.querySelectorAll('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], video')].filter(el => el.closest('article') === target && !insideQuote(el, target) && !el.closest('[data-testid="card.layoutLarge.media"]')).length;
  const before = articles.slice(0, articles.indexOf(target)).filter(article => !article.querySelector('[data-testid="placementTracking"]') && ownPermalink(article) && textNode(article)).slice(-6);
  for (const article of before) await restoreOriginal(article);
  const turns = before.map((article, index) => {
    const ancestorMedia = [...article.querySelectorAll('[data-testid="tweetPhoto"] img, [data-testid="videoPlayer"] img, video[poster], source[src]')].filter(el => el.closest('article') === article && !insideQuote(el, article));
    const urls = ancestorMedia.flatMap(el => [el.currentSrc, el.src, el.poster]).filter(validMediaUrl);
    mediaUrls = [...new Set([...mediaUrls, ...urls])].slice(0, 4);
    const count = [...article.querySelectorAll('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], video')].filter(el => el.closest('article') === article && !insideQuote(el, article)).length;
    mediaCount += count;
    return { turn: index + 1, author: new URL(ownPermalink(article).href).pathname.split('/')[1], text: textNode(article).innerText.trim(), media_count: count };
  });
  const context = JSON.stringify({ order: 'oldest_to_newest', instruction: text ? 'Reply to target_text as the next turn; ancestors and embedded context explain references only.' : 'The target post has no caption or only an icon. Use its own media first; if absent, use embedded quoted_post/link_preview as the context being reacted to.', turns, embedded }).slice(0, 3000);
  const expandable = Boolean(target.querySelector('[data-testid="tweet-text-show-more-link"]'));
  const captured=globalThis.XReplyMedia?await globalThis.XReplyMedia.capture(target,!!(await chrome.storage.local.get('fastReplyMode')).fastReplyMode):{};
  return {
    url: `https://x.com/${username}/status/${postId}`, postId, username, displayName, avatarUrl, text,
    ...captured,
    publishedAt: target.querySelector('time')?.dateTime || '', generatedAt: new Date().toISOString(), clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '', clientLocalHour: new Date().getHours(),
    lang: scriptLanguage(text, node?.getAttribute('lang') || ''), context, mediaCount, mediaUrls, previewMediaUrls, mediaKind: hasVideo ? 'video_thumbnail' : mediaCount ? 'images' : 'none', expandable,
    warning: !text && !(mediaUrls.length || captured.mediaInline?.length || embedded.length) ? 'Bài không có văn bản và chưa lấy được media để phân tích.' :
      expandable ? 'Bài có nút Show more: mở rộng toàn bộ nội dung rồi đọc lại để tránh thiếu ngữ cảnh.' :
      mediaCount ? mediaUrls.length||captured.mediaInline?.length ? `Đã nhận ${mediaUrls.length+(captured.mediaInline?.length||0)} ${hasVideo ? 'thumbnail video/ảnh' : 'ảnh'} để phân tích cùng nội dung.` : 'Phát hiện media nhưng chưa lấy được dữ liệu ảnh. Không nên tạo gợi ý cho đến khi tải lại bài.' : ''
  };
})();
