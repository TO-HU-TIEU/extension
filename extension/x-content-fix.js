// Keep the assistant attached to the reply editor of the active status article.
// X can keep a global post composer mounted above the article; never select it.
try {
  const scopedEditor = () => { const id = location.pathname.match(/\/status\/(\d+)/)?.[1]; const article = typeof articleFor === 'function' ? articleFor(id) : null; return article?.querySelector('[data-testid="tweetTextarea_0"]') || null; };
  globalThis.editor = scopedEditor;
  if (typeof safeMount === 'function') safeMount();
} catch {}
