(() => {
  const ready = el => el.tagName === 'VIDEO' ? el.readyState >= 2 && el.videoWidth > 0 : el.complete && el.naturalWidth > 0;
  const posterUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'pbs.twimg.com' && /^\/(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//.test(u.pathname); } catch { return false; } };
  function wait(el, ms) {
    if (ready(el)) return Promise.resolve(true);
    return new Promise(resolve => {
      let timer;
      const events = ['loadeddata', 'canplay', 'load', 'error'];
      const finish = event => { if (event?.type !== 'error' && event && !ready(el)) return; clearTimeout(timer); for (const name of events) el.removeEventListener(name, finish); resolve(ready(el)); };
      for (const name of events) el.addEventListener(name, finish);
      timer = setTimeout(() => finish(), ms);
    });
  }
  function shot(el, fast) {
    if (!ready(el)) return null;
    try {
      const w = el.videoWidth || el.naturalWidth, h = el.videoHeight || el.naturalHeight, scale = Math.min(1, (fast ? 640 : 960) / Math.max(w, h)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
      const context = canvas.getContext('2d'); context.drawImage(el, 0, 0, canvas.width, canvas.height);
      if (el.tagName === 'VIDEO' && context.getImageData) {
        // A uniform black intro is not useful evidence; retain a real poster/URL instead.
        const probe = document.createElement('canvas'); probe.width = probe.height = 16;
        const small = probe.getContext('2d'); small.drawImage(canvas, 0, 0, 16, 16);
        const pixels = small.getImageData(0, 0, 16, 16).data;
        if (pixels.length && !pixels.some((value, index) => index % 4 !== 3 && value > 10)) return null;
      }
      const data = canvas.toDataURL('image/jpeg', fast ? .72 : .84);
      return data.length > 100 && data.length < 3000000 ? data : null;
    } catch { return null; }
  }
  async function collect(article, fast = false) {
    const frames = [], notes = [], capturedUrls = [], elements = [...(article?.querySelectorAll('video,[data-testid="tweetPhoto"] img,[data-testid="videoPlayer"] img') || [])].filter(e => e.closest('article') === article && !e.closest('[data-testid="card.layoutLarge.media"]')).sort((a, b) => (b.tagName === 'VIDEO') - (a.tagName === 'VIDEO'));
    const limit = fast ? 3 : 5;
    const posterAvailable = elements.some(el => posterUrl(el.poster) || posterUrl(el.currentSrc || el.src));
    // Ready frames and poster URLs can be submitted immediately in fast mode.
    if (!fast || (!elements.some(ready) && !posterAvailable)) await Promise.all(elements.map(el => wait(el, fast ? 1500 : 1800)));
    for (const el of elements) {
      if (frames.length >= limit) break;
      const data = shot(el, fast);
      if (data && !frames.includes(data)) { frames.push(data); if (el.currentSrc || el.src) capturedUrls.push(el.currentSrc || el.src); notes.push(el.tagName === 'VIDEO' ? `Video frame at ${Number(el.currentTime || 0).toFixed(1)} seconds` : posterUrl(el.currentSrc || el.src) ? 'Video poster only; do not infer motion or unseen events' : 'Visible image'); }
      if (el.tagName !== 'VIDEO' || (fast && (data || posterAvailable)) || !ready(el) || !Number.isFinite(el.duration) || el.duration < 2) continue;
      const clone = document.createElement('video'); clone.crossOrigin = 'anonymous'; clone.muted = true; clone.preload = 'auto'; clone.src = el.currentSrc || el.src;
      try {
        clone.load(); if (!await wait(clone, fast ? 500 : 900)) continue;
        for (const fraction of fast ? [.1] : [.25, .7]) {
          if (frames.length >= limit) break;
          const time = Math.min(el.duration - .1, el.duration * fraction);
          const sought = new Promise(resolve => { let timer; const finish = () => { clearTimeout(timer); clone.removeEventListener('seeked', finish); resolve(Math.abs(clone.currentTime - time) < .5 && !clone.seeking); }; clone.addEventListener('seeked', finish); timer = setTimeout(finish, fast ? 300 : 650); });
          clone.currentTime = time; if (!await sought) continue;
          const frame = shot(clone, fast); if (frame && !frames.includes(frame)) { frames.push(frame); notes.push(`Video frame at ${time.toFixed(1)} seconds`); }
        }
      } catch { /* Protected streams retain their visible frame/poster evidence. */ }
      finally { clone.pause(); clone.removeAttribute('src'); clone.load(); }
    }
    if (!frames.length && posterAvailable) notes.push('Video poster URL attached; no decoded video frame. Do not infer motion or unseen events.');
    return { mediaInline: frames, mediaCapturedUrls: capturedUrls, mediaFrameNotes: notes.join('; '), fastMode: fast };
  }
  const pending = new WeakMap();
  const signature = (article, fast) => JSON.stringify([fast, [...(article?.querySelectorAll('video,[data-testid="tweetPhoto"] img,[data-testid="videoPlayer"] img') || [])].map(el => el.currentSrc || el.src || el.poster || '')]);
  function prime(article, fast = false) { if (!article) return; const key = signature(article, fast), old = pending.get(article); if (old?.key === key && Date.now() - old.at < 2000) return; const promise = collect(article, fast); pending.set(article, { key, at: Date.now(), promise }); promise.catch(() => {}); }
  async function capture(article, fast = false) { const old = article && pending.get(article); if (article) pending.delete(article); if (old?.key === signature(article, fast) && Date.now() - old.at < 2000) return old.promise; return collect(article, fast); }
  globalThis.XReplyMedia = { ready, wait, capture, prime };
})();
