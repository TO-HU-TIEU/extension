(() => {
  const clean = globalThis.ContentCore.clean;
  function visible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }
  function extract(doc = document, pageUrl = location.href, onlyVisible = true) {
    const page = new URL(pageUrl), output = [];
    if (page.hostname === 'sosovalue.com' && page.pathname.startsWith('/research')) {
      // The timeline body anchor has title + article text; the other anchor is only the publisher.
      for (const node of doc.querySelectorAll('a[href*="/research/"]')) {
        const href = node.getAttribute('href') || '';
        if (!/^\/research\/\d+(?:[?#].*)?$/.test(href) && !/^https:\/\/sosovalue\.com\/research\/\d+(?:[?#].*)?$/.test(href)) continue;
        if (node.closest('nav,aside,header,footer,[role="navigation"],[role="toolbar"]')) continue;
        if ((onlyVisible && !visible(node)) || clean(node.innerText).length < 80) continue;
        const titleNode = node.querySelector('h1,h2,h3,[class*="font-bold"],[class*="font-semibold"]');
        if (!titleNode) continue; // Ignore the compact ticker and audio-player links.
        output.push({ url: new URL(href, pageUrl).href, title: clean(titleNode.innerText), text: globalThis.ContentReader?ContentReader.text(node):clean(node.innerText), ...(globalThis.ContentReader?ContentReader.nearby(node.parentElement):{}), lang: doc.documentElement.lang });
      }
      // Some timeline rows are clickable containers instead of article links.
      if (!output.length && globalThis.ContentReader) {
        const used = new Set();
        for (const stamp of doc.querySelectorAll('time,span,small,p,strong,b')) {
          if (!ContentReader.relative(stamp.textContent) || stamp.closest('nav,aside,header,footer,[role="navigation"]')) continue;
          let row = stamp.parentElement;
          for (let depth = 0; row && depth < 5; depth++, row = row.parentElement) {
            if (used.has(row)) break;
            const heading = row.querySelector('h1,h2,h3,[class*="font-bold"],[class*="font-semibold"]');
            const timestamps = [...row.querySelectorAll('time,span,small,p,strong,b')].filter(el => ContentReader.relative(el.textContent));
            if (timestamps.length > 1) break;
            if (!heading || heading === stamp || ContentReader.relative(heading.textContent)) continue;
            const body = ContentReader.text(row);
            if (body.length < 80 || body.length > 10000) continue;
            if (onlyVisible && !visible(row)) break;
            const link = row.querySelector('a[href*="/research/"]');
            output.push({ url: link ? new URL(link.getAttribute('href'), pageUrl).href : pageUrl, title: clean(heading.innerText || heading.textContent), text: body, ...ContentReader.details(row), lang: doc.documentElement.lang });
            used.add(row); break;
          }
        }
      }
      if (output.length || !/^\/research\/\d+$/.test(page.pathname)) return output.slice(0, 20);
    }
    const adapter=globalThis.RemoteConfig?.get('adapters')?.[page.hostname.replace(/^www\./,'')];const selector = ['article,[role="article"],[data-testid="tweet"],.news-item,.post-item,.feed-item',...(adapter?.feed||[])].join(',');
    let safeSelector=selector;try{doc.querySelectorAll(safeSelector)}catch{safeSelector='article,[role="article"],.news-item,.post-item,.feed-item'}const nodes = [...doc.querySelectorAll(safeSelector)].filter(node => !node.querySelector(safeSelector));
    for (const node of nodes) {
      if(node.closest('nav,aside,footer,.related-news,.related-posts,.related-articles,.article-related,.box-related,.box-comment'))continue;
      if (onlyVisible && !visible(node)) continue;
      const body = node.querySelector('[data-testid="tweetText"],[itemprop="articleBody"],.entry-content,.post-content') || node;
      const text = globalThis.ContentReader?ContentReader.text(body):clean(body.innerText);
      if (text.length < 80) continue;
      const heading = node.querySelector('h1,h2,h3');
      const link = node.querySelector('a[href*="/status/"]:has(time)') || heading?.closest('a[href]') || heading?.querySelector('a[href]') || node.querySelector('a[rel="bookmark"],a[href]:has(time)')||node.querySelector('a[href]');
      output.push({ url: link?.href || pageUrl, title: heading?.innerText || text.split('\n')[0], text, publishedAt: globalThis.ContentReader?.published(node)||null, lang: body.lang || doc.documentElement.lang });
    }
    if (!nodes.length) {
      const body = doc.querySelector('[itemprop="articleBody"],.entry-content,.article-content');
      if (body && (!onlyVisible || visible(body))) output.push({ url: pageUrl, title: doc.querySelector('h1')?.innerText || doc.title, text: globalThis.ContentReader?ContentReader.text(body):clean(body.innerText), publishedAt: globalThis.ContentReader?.structured(doc).publishedAt||globalThis.ContentReader?.published(doc)||null, lang: doc.documentElement.lang });
    }
    return output.slice(0, 20);
  }
  globalThis.ContentExtractor = { extract };
})();
