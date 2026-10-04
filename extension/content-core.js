(() => {
  const limit=(key,fallback)=>globalThis.RemoteConfig?.get('limits')?.[key]||fallback;
  const clean = value => String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  function sourceRules(value) {
    const lines = Array.isArray(value) ? value : String(value || '').split('\n');
    const rules = [...new Set(lines.map(line => String(line).trim()).filter(Boolean).map(line => {
      const url = new URL(line.includes('://') ? line : `https://${line}`);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')) throw new Error('Nguồn phải là địa chỉ HTTPS hợp lệ.');
      url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, '') || '/';
      return url.href;
    }))];
    if (rules.length > limit('maxSources',20)) throw new Error('Tối đa 20 nguồn.');
    return rules;
  }
  function matches(raw, rules) {
    try {
      const url = new URL(raw);
      return rules.some(rule => {
        const source = new URL(rule), path = source.pathname.replace(/\/$/, '');
        return url.origin === source.origin && (!path || url.pathname === path || url.pathname.startsWith(path + '/')) && (!source.search || source.search === url.search);
      });
    } catch { return false; }
  }
  const origins = rules => [...new Set(rules.map(rule => `${new URL(rule).origin}/*`))];
  function fingerprint(text) {
    let hash = 2166136261;
    for (const character of text) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function article(input, sourceUrl) {
    const text = clean(input.text).slice(0, limit('maxSourceCharacters',10000));
    if (text.length < limit('minSourceCharacters',80)) return null;
    let url; try { url = new URL(input.url || sourceUrl, sourceUrl); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    const page = new URL(sourceUrl); page.hash = '';
    const identity = url.href === page.href ? `${url.href}|${text}` : url.href;
    return { id: 'article-' + fingerprint(identity), url: url.href, sourceUrl: page.href,
      title: clean(input.title).slice(0, 200) || text.split('\n')[0].slice(0, 160), text,
      language: globalThis.X_REPLY_LANGUAGE(text, clean(input.lang).slice(0, 35)),
      publishedAt: globalThis.ContentReader?.date(input.publishedAt) || null, publishedApproximate:!!input.publishedApproximate,publishedLabel:clean(input.publishedLabel).slice(0,60), discoveredAt: new Date().toISOString(), status: 'inbox', translationStatus: 'waiting', translationVi: null, drafts: [] };
  }
  const emptyState = () => ({ version: 1, items: [], skipped: [] });
  function ingest(state, inputs, sourceUrl) {
    const known = new Set([...state.items.map(item => item.id), ...state.skipped]);
    let added = 0;
    for (const input of inputs.slice(0, 20)) {
      const item = article(input, sourceUrl);
      if(!item)continue;const existing=state.items.find(value=>value.id===item.id);if(existing&&existing.status==='inbox'){if(item.publishedAt&&!existing.publishedAt){existing.publishedAt=item.publishedAt;existing.publishedApproximate=item.publishedApproximate;existing.publishedLabel=item.publishedLabel;}if(item.text!==existing.text){existing.text=item.text;existing.title=item.title;existing.language=item.language;existing.translationVi=null;existing.translationStatus=/^vi(?:-|$)/i.test(item.language)?'done':'waiting';existing.revision=(existing.revision||0)+1;}}
      if (known.has(item.id) || state.items.length >= limit('maxArticles',120)) continue;
      known.add(item.id); state.items.push(item); added++;
      if (/^vi(?:-|$)/i.test(item.language)) item.translationStatus = 'done';
    }
    return added;
  }
  function transition(state, id, action) {
    const item = state.items.find(item => item.id === id);
    if (!item) throw new Error('Bài đã được xử lý ở bảng khác.');
    if(action==='remove'){state.items=state.items.filter(value=>value.id!==id);state.skipped=[...new Set([...state.skipped,id])].slice(-500);return null;}
    if (action === 'skip') {
      if (item.status !== 'inbox') throw new Error('Chỉ bỏ qua bài trong danh sách quét.');
      state.items = state.items.filter(value => value.id !== id);
      state.skipped = [...new Set([...state.skipped, id])].slice(-500); return null;
    }
    if (action === 'queue') {
      if (item.status !== 'inbox') return item;
      if (state.items.filter(value => value.status !== 'inbox').length >= limit('maxQueue',120)) throw new Error('Mục chờ đăng đã đầy.');
      item.status = item.drafts?.length === 2 ? 'ready' : 'queued'; item.error = '';
      item.revision = (item.revision || 0) + 1; return item;
    }
    if (action === 'return') {
      item.status = 'inbox'; item.revision = (item.revision || 0) + 1; return item;
    }
    if (action === 'retry') {
      if (item.status === 'error') { item.status = 'queued'; item.error = ''; }
      else if (item.translationStatus === 'error') { item.translationStatus = 'waiting'; item.translationError = ''; }
      return item;
    }
    throw new Error('Thao tác không hợp lệ.');
  }
  function swipe(dx, dy, width = 320) {
    return Math.abs(dx) >= Math.max(55, Math.min(100, width * .22)) && Math.abs(dx) > Math.abs(dy) * 1.4 ? (dx < 0 ? 'queue' : 'skip') : null;
  }
  function drafts(value) {
    if (!Array.isArray(value?.drafts) || value.drafts.length !== 2) throw new Error('Mô hình chưa trả về content hợp lệ.');
    const result = value.drafts.map(text => {
      if (typeof text !== 'string' || text.trim().length < 80 || Array.from(text.trim()).length > 520 || text.includes('```')) throw new Error('Mẫu bài viết chưa đúng định dạng.');
      const paragraphs = text.trim().split(/\n\s*\n/);
      if (paragraphs.length < 2 || paragraphs.length > 3 || paragraphs.some(paragraph=>Array.from(paragraph).length>350)) throw new Error('Mỗi mẫu cần 2–3 đoạn rõ ràng.');
      if (globalThis.X_REPLY_LANGUAGE(text, '') !== 'vi') throw new Error('Mẫu bài viết phải bằng tiếng Việt.');
      return text.trim();
    });
    if (result[0] === result[1]) throw new Error('Content gợi ý bị trùng.');
    return result;
  }
  function ordered(items){return items.slice().sort((a,b)=>Number(!!b.publishedAt)-Number(!!a.publishedAt)||(Date.parse(b.publishedAt||b.discoveredAt)||0)-(Date.parse(a.publishedAt||a.discoveredAt)||0))}
  function batch(state,ids,action){const selected=[...new Set(ids)].filter(id=>state.items.some(item=>item.id===id&&item.status==='inbox'));if(!['queue','skip'].includes(action))throw new Error('Thao tác không hợp lệ.');if(action==='queue'&&state.items.filter(item=>item.status!=='inbox').length+selected.length>limit('maxQueue',120))throw new Error('Mục chờ đăng đã đầy.');for(const id of selected)transition(state,id,action);return selected.length}
  function clearInbox(state){const ids=state.items.filter(item=>item.status==='inbox').map(item=>item.id);state.items=state.items.filter(item=>item.status!=='inbox');state.skipped=[...new Set([...state.skipped,...ids])].slice(-500);return ids.length}
  globalThis.ContentCore = { limit, ordered, batch, clearInbox, clean, sourceRules, matches, origins, article, emptyState, ingest, transition, swipe, drafts };
})();
