(() => {
  function preferAboveScore(candidates, threshold = 30) {
    const items = Array.from(candidates || []),
      preferred = items.filter((item) => Number(item?.dataset?.relevanceScore) > threshold);
    return preferred.length ? preferred : items;
  }
  globalThis.AutoReplySelection = Object.freeze({ preferAboveScore });
})();
