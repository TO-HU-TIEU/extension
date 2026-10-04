(() => {
  const $c = id => document.getElementById(id);
  let selected=new Set(),sourceFilter='all';
  let view = 'inbox', state = ContentCore.emptyState(), config, rendering = false, rerender = false, dragging = false;
  const say = (text, error = false) => {
    $c('contentStatus').textContent = text;
    $c('contentStatus').classList.toggle('error', error);
  };
  async function request(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || 'Không xử lý được Content.');
    return result.data;
  }
  const safely = fn => async (...args) => { try { await fn(...args); } catch (error) { say(error.message, true); } };
  function element(tag, className, text) {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const copy = safely(async text => { await navigator.clipboard.writeText(text); say('Đã sao chép.'); });
  async function action(item, command) {
    await request({ type: 'contentAction', id: item.id, action: command });
    say(command === 'queue' ? 'Đã chuyển sang Content. Đang tạo content…' : command === 'skip' ? 'Đã bỏ qua bài.' : command==='remove'?'Đã loại bỏ content.': 'Đang thử lại…');
    await refresh();
  }
  function button(text, handler, className = 'secondary compact') {
    const node = element('button', className, text); node.type = 'button'; node.onclick = safely(handler); return node;
  }
  const paths={remove:'M6 6l12 12M18 6 6 18',copy:'M9 9h11v11H9zM5 15H3V3h12v2',reload:'M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6',post:'M5 12h14M13 6l6 6-6 6'};
  function icon(kind,label,handler){const b=button('',handler,'content-icon');b.title=label;b.setAttribute('aria-label',label);b.dataset.action=kind;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[kind]);svg.append(path);b.append(svg);return b}
  const post=safely(async text=>{await chrome.tabs.create({url:'https://twitter.com/intent/tweet?text='+encodeURIComponent(text)});say('Đã đưa nội dung vào trình soạn thảo X.');});
  async function draftAction(item,index,command){await request({type:'contentDraftAction',id:item.id,index,action:command});await refresh()}
  function draftGesture(card,item,index,tray){let start;card.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary||event.target.closest('button,a'))return;start={x:event.clientX,y:event.clientY,id:event.pointerId}});card.addEventListener('pointermove',event=>{if(!start||event.pointerId!==start.id)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(!dragging&&Math.abs(dy)>15&&Math.abs(dy)>Math.abs(dx)){start=null;return}if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.4){dragging=true;card.style.transform=`translateX(${Math.max(-95,Math.min(95,dx))}px)`;card.classList.toggle('swipe-right',dx>0);card.classList.toggle('swipe-left',dx<0);card.setPointerCapture?.(event.pointerId)}});const finish=(event,cancel=false)=>{if(!start||event.pointerId!==start.id)return;const command=cancel?null:ContentCore.swipe(event.clientX-start.x,event.clientY-start.y,card.clientWidth);start=null;dragging=false;card.style.transform='';card.classList.remove('swipe-right','swipe-left');if(card.hasPointerCapture?.(event.pointerId))card.releasePointerCapture(event.pointerId);if(command==='skip')safely(()=>draftAction(item,index,'remove'))();else if(command==='queue'){tray.hidden=false;tray.querySelector('button')?.focus()}else if(rerender){rerender=false;render()}};card.addEventListener('pointerup',event=>finish(event));card.addEventListener('pointercancel',event=>finish(event,true));card.tabIndex=0;card.addEventListener('keydown',event=>{if(event.target!==card)return;if(event.key==='ArrowLeft'){event.preventDefault();tray.hidden=false;tray.querySelector('button')?.focus()}if(event.key==='ArrowRight'){event.preventDefault();safely(()=>draftAction(item,index,'remove'))()}})}
  function gesture(card, item) {
    let start, suppressClick = false;
    card.addEventListener('pointerdown', event => {
      if (event.ctrlKey || event.metaKey || event.button !== 0 || event.target.closest('button,a') || !event.isPrimary) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId }; suppressClick = false;
    });
    card.addEventListener('pointermove', event => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (!dragging && Math.abs(dy) > 15 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        dragging = true; suppressClick = true;
        if (!card.hasPointerCapture(event.pointerId)) card.setPointerCapture(event.pointerId);
        card.style.transform = `translateX(${Math.max(-110, Math.min(110, dx))}px)`;
        card.classList.toggle('swipe-left', dx < 0); card.classList.toggle('swipe-right', dx > 0);
      }
    });
    function finish(event, cancelled = false) {
      if (!start || event.pointerId !== start.id) return;
      const command = cancelled ? null : ContentCore.swipe(event.clientX - start.x, event.clientY - start.y, card.clientWidth);
      start = null; dragging = false; card.style.transform = ''; card.classList.remove('swipe-left', 'swipe-right');
      if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
      if (command) safely(() => action(item, command))();
      else if (rerender) { rerender = false; render(); }
    }
    card.addEventListener('pointerup', finish);
    card.addEventListener('pointercancel', event => finish(event, true));
    card.addEventListener('click', event => {
      if (event.target.closest('button,a') || suppressClick) return;
      if(event.ctrlKey||event.metaKey){event.preventDefault();selected.has(item.id)?selected.delete(item.id):selected.add(item.id);render();return;}
      copy(item.text);
    });
    card.addEventListener('keydown', event => {
      if (event.target !== card) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); copy(item.text); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); safely(() => action(item, event.key === 'ArrowLeft' ? 'queue' : 'skip'))(); }
    });
  }
  function cardFor(item) {
    const card = element('article', 'content-feed-card'); card.dataset.id = item.id;card.classList.toggle('content-selected',selected.has(item.id));
    const heading = element('div', 'content-card-head');
    let host = 'Nội dung thủ công'; try { if (!item.url.includes('manual.assistant.invalid')) host = new URL(item.url).hostname; } catch {}
    heading.append(element('small', 'content-origin', ContentReader.sourceName(item.url)));const time=element('time','content-published',item.publishedAt?new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short'}).format(new Date(item.publishedAt)):'Chưa có thời gian đăng');if(item.publishedAt)time.dateTime=item.publishedAt;time.textContent=(item.publishedApproximate?'≈ ':'')+time.textContent;if(item.publishedLabel)time.title=item.publishedLabel;heading.append(time);
    if (!item.url.includes('manual.assistant.invalid')) {
      const link = element('a', 'content-source-link', 'Nguồn ↗'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; heading.append(link);
    }
    if(item.status!=='inbox')heading.append(icon('remove','Loại bỏ content',()=>action(item,'remove')));
    card.append(heading, element('h3', '', item.title));
    if (item.status === 'inbox') {
      card.tabIndex = 0; card.setAttribute('role', 'button');card.setAttribute('aria-pressed',String(selected.has(item.id))); card.setAttribute('aria-label', 'Sao chép bài: ' + item.title);
      const body = item.text.startsWith(item.title + '\n') ? item.text.slice(item.title.length).trimStart() : item.text;
      card.append(element('div', 'content-original', body));
      if (item.translationVi) card.append(element('small', 'content-translation', item.translationVi));
      else if (!/^vi(?:-|$)/i.test(item.language || '') && item.translationStatus !== 'done') {
        card.append(element('small', 'content-translation', item.translationStatus === 'error' ? item.translationError : 'Đang dịch sang tiếng Việt…'));
      }
      const actions = element('div', 'content-card-actions');
      actions.append(button('← Content', () => action(item, 'queue')), button('Bỏ qua →', () => action(item, 'skip')));
      if (item.translationStatus === 'error') actions.append(button('Dịch lại', () => action(item, 'retry')));
      card.append(actions); gesture(card, item);
    } else if (item.status === 'ready') {
      item.drafts.forEach((text,index)=>{const draft=element('div','content-draft');draft.dataset.index=index;const tools=element('div','content-draft-tools');const reload=icon('reload','Tạo lại content',()=>draftAction(item,index,'regenerate'));reload.disabled=!!item.draftJobs?.[index];tools.append(icon('post','Mở trình soạn thảo X',()=>post(text)),icon('copy','Sao chép content',()=>copy(text)),reload);draft.append(tools,element('div','content-draft-text',text));if(item.draftJobs?.[index])draft.append(element('small','hint','Đang tạo lại content…'));if(item.draftErrors?.[index])draft.append(element('small','content-error',item.draftErrors[index]));const tray=element('div','content-swipe-actions');tray.hidden=true;tray.append(icon('post','Mở trình soạn thảo X',()=>post(text)),icon('copy','Sao chép content',()=>copy(text)));draft.append(tray);draftGesture(draft,item,index,tray);card.append(draft)});
    } else {
      card.append(element('p', item.status === 'error' ? 'content-error' : 'hint', item.status === 'error' ? item.error : 'Đang tạo content tiếng Việt…'));
      if (item.status === 'error') card.append(button('Thử lại', () => action(item, 'retry')));

    }
    return card;
  }
  function render() {
    if (dragging) { rerender = true; return; }
    const inbox = state.items.filter(item => item.status === 'inbox'), queued = state.items.filter(item => item.status !== 'inbox');
    $c('contentGestureHint').textContent=view==='queue'?'Vuốt trái để mở post/copy · Vuốt phải để xoá gợi ý':'Bấm thẻ để copy bài gốc · Vuốt trái để tạo content · Vuốt phải để bỏ qua';
    $c('contentInboxTab').textContent = `Quét nội dung (${inbox.length})`;
    $c('contentQueueTab').textContent = `Content (${queued.length})`;
    $c('contentInboxTab').classList.toggle('active', view === 'inbox'); $c('contentQueueTab').classList.toggle('active', view === 'queue');
    $c('contentInboxTab').setAttribute('aria-selected', view === 'inbox'); $c('contentQueueTab').setAttribute('aria-selected', view === 'queue');
    const candidates=view==='inbox'?inbox:queued;const hostFor=item=>{try{return new URL(item.url).hostname.replace(/^www\./,'')}catch{return'manual.assistant.invalid'}};const hosts=[...new Set([...state.items.map(hostFor),...(config?.sources||[]).map(url=>hostFor({url}))])];if(sourceFilter!=='all'&&!hosts.includes(sourceFilter))sourceFilter='all';const tags=$c('contentSourceFilters');tags.replaceChildren(...['all',...hosts].map(host=>button(host==='all'?'Tất cả':ContentReader.sourceName('https://'+host),()=>{sourceFilter=host;selected.clear();render()},'content-filter'+(sourceFilter===host?' active':''))));const list=ContentCore.ordered(candidates.filter(item=>sourceFilter==='all'||hostFor(item)===sourceFilter));selected=new Set([...selected].filter(id=>list.some(item=>item.id===id)&&view==='inbox'));$c('contentSelection').hidden=!selected.size;$c('contentSelectedCount').textContent=`Đã chọn ${selected.size} bài`;$c('contentClear').hidden=view!=='inbox';$c('contentClear').disabled=!inbox.length;
    $c('contentFeed').replaceChildren(...list.map(cardFor));
    $c('contentEmpty').hidden = !!list.length;
    $c('contentEmpty').textContent = view === 'queue' ? 'Vuốt trái một bài trong Quét nội dung để tạo content tại đây.' : config?.enabled ? 'Mở nguồn đã lưu và lướt qua các bài để thu thập Content.' : 'Thêm nguồn và bật quét tự động trong Cài đặt → Nguồn Content.';
    $c('contentScanInfo').textContent = `${config?.enabled ? 'Đang bật quét' : 'Chưa bật quét'} · ${config?.sources.length || 0} nguồn`;
    $c('contentCapacity').hidden = state.items.length < ContentCore.limit('maxArticles',120);
  }
  async function refresh() {
    if (rendering) { rerender = true; return; }
    rendering = true;
    try { const data = await request({ type: 'contentList' }); state = data.state; config = data.config; render(); }
    finally { rendering = false; if (rerender && !dragging) { rerender = false; await refresh(); } }
  }
  $c('contentInboxTab').onclick = () => { view = 'inbox';selected.clear();render(); };
  $c('contentQueueTab').onclick = () => { view = 'queue';selected.clear();render(); };
  $c('contentOpenSources').onclick = () => { $c('contentSettings').open = !$c('contentSettings').open; if ($c('contentSettings').open) $c('contentSources').focus(); };
  $c('saveContentSources').onclick = async () => {
    try {
    const sources = ContentCore.sourceRules($c('contentSources').value), enabled = $c('contentScanEnabled').checked;
    // Permission request is directly inside the user's click, before asynchronous storage calls.
    if (enabled && sources.length && !await chrome.permissions.request({ origins: ContentCore.origins(sources) })) throw new Error('Bạn chưa cấp quyền đọc các nguồn này.');
    await request({ type: 'contentSaveSources', sources, enabled });
    $c('contentSourcesFeedback').textContent = 'Đã lưu. Quét các bài hiển thị khi bạn lướt nguồn đã chọn.';
    await refresh();
    } catch (error) { $c('contentSourcesFeedback').textContent = error.message; }
  };
  $c('composeNews').onclick = safely(async () => {
    if (!$c('newsSource').value.trim()) await readNews();
    await request({ type: 'contentAddManual', text: $c('newsSource').value, url: $c('newsUrl').value, publishedAt:$c('newsSource').dataset.publishedAt||'' });
    view = 'queue'; say('Đã thêm bài. Đang tạo content…'); await refresh();
  });
  const filters=element('div','content-source-filters');filters.id='contentSourceFilters';$c('contentFeed').before(filters);
  const clear=button('Clear',async()=>{await request({type:'contentClear'});selected.clear();say('Đã xoá toàn bộ bài đã quét.');await refresh()});clear.id='contentClear';clear.title='Xoá toàn bộ bài trong Quét nội dung';$c('contentOpenSources').before(clear);
  const selection=element('div','content-selection');selection.id='contentSelection';selection.hidden=true;const count=element('span','');count.id='contentSelectedCount';selection.append(count,button('Gửi vào chờ soạn thảo',async()=>{await request({type:'contentBatch',ids:[...selected],action:'queue'});selected.clear();say('Đã chuyển các bài đã chọn sang Content.');await refresh()}),button('Loại bỏ',async()=>{await request({type:'contentBatch',ids:[...selected],action:'skip'});selected.clear();await refresh()}),button('Bỏ chọn',()=>{selected.clear();render()}));$c('contentFeed').before(selection);
  document.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='a'||view!=='inbox'||$c('contentWorkspace').hidden||!$c('settingsArea').hidden||event.target.closest('input,textarea,[contenteditable="true"]'))return;event.preventDefault();selected=new Set(state.items.filter(item=>item.status==='inbox'&&(sourceFilter==='all'||new URL(item.url).hostname.replace(/^www\./,'')===sourceFilter)).map(item=>item.id));render()});
  $c('newsSource').addEventListener('input',()=>{delete $c('newsSource').dataset.publishedAt});
  let refreshTimer;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes.contentState && !changes.contentConfig)) return;
    clearTimeout(refreshTimer); refreshTimer = setTimeout(() => safely(refresh)(), 100);
  });
  chrome.storage.local.get('contentConfig').then(({ contentConfig }) => {
    $c('contentSources').value = (contentConfig?.sources || ['https://sosovalue.com/research']).join('\n');
    $c('contentScanEnabled').checked = !!contentConfig?.enabled;
  });
  safely(refresh)();
  let checkingScan = false;
  const scanStatus = element('p', 'hint');
  scanStatus.id = 'contentScanStatus';
  scanStatus.setAttribute('role', 'status');
  $c('contentFeed').before(scanStatus);
  async function checkScan() {
    if (checkingScan || document.visibilityState === 'hidden' || $c('contentWorkspace').hidden || !$c('settingsArea').hidden) return;
    checkingScan = true;
    try {
      const data = await request({ type: 'contentRescan' });
      scanStatus.textContent = data.message;
      if (data.added) await refresh();
    } catch (error) { scanStatus.textContent = 'Không kết nối được bộ quét: ' + error.message; }
    finally { checkingScan = false; }
  }
  setInterval(checkScan, 3000);
  checkScan();
})();
