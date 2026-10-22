(function () {
  let lastClick = 0;
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("#getFollowList");
      if (!button) return;
      const now = Date.now();
      if (now - lastClick < 350) {
        event.preventDefault();
        event.stopImmediatePropagation();
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "followSpeed" }).catch(() => {});
        });
      }
      lastClick = now;
    },
    true,
  );
})();
