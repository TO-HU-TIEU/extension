(function () {
  // This workaround is only for X's Following/Followers virtual list.
  // Never alter scrolling on profiles, posts, media, home, or search pages.
  if (!/^\/[^/]+\/(?:following|followers)\/?$/i.test(location.pathname)) return;
  if (globalThis.__assistantFollowScrollFixed) return;
  globalThis.__assistantFollowScrollFixed = true;
  const nativeScrollBy = window.scrollBy.bind(window);
  const findScroller = () => {
    const row = document.querySelector('[data-testid="UserCell"],article[data-testid="UserCell"]');
    for (let node = row?.parentElement; node && node !== document.body; node = node.parentElement) {
      if (
        node.scrollHeight > node.clientHeight + 20 &&
        /auto|scroll|overlay/.test(getComputedStyle(node).overflowY)
      )
        return node;
    }
    return null;
  };
  window.scrollBy = (optionsOrX, maybeY) => {
    const scroller = findScroller();
    if (scroller) {
      const options =
        typeof optionsOrX === "object" ? optionsOrX : { left: optionsOrX, top: maybeY };
      scroller.scrollBy(options);
      return;
    }
    nativeScrollBy(optionsOrX, maybeY);
  };
})();
