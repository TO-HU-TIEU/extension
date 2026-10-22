(function () {
  const originalQuery = chrome.tabs.query.bind(chrome.tabs);
  const isFollowUrl = (url) =>
    /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/(?:following|followers)\/?(?:\?|$)/i.test(
      url || "",
    );
  chrome.tabs.query = async (query) => {
    const tabs = await originalQuery(query);
    if (
      !query?.active ||
      !query?.currentWindow ||
      !document.getElementById("followModule")?.classList.contains("active")
    )
      return tabs;
    const active = tabs.find((tab) => isFollowUrl(tab.url));
    if (active) return [active];
    const all = await originalQuery({ currentWindow: true });
    const follow = all.find((tab) => isFollowUrl(tab.url));
    return follow ? [follow] : tabs;
  };
})();
