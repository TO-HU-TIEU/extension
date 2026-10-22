(function () {
  let speedTimer;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "followSpeed") return;
    globalThis.__assistantFollowSpeed = 2;
    clearInterval(speedTimer);
    speedTimer = setInterval(
      () =>
        window.scrollBy({ top: Math.max(180, innerHeight * 0.24), left: 0, behavior: "smooth" }),
      260,
    );
    setTimeout(() => {
      clearInterval(speedTimer);
      speedTimer = null;
    }, 12000);
    sendResponse({ ok: true, speed: 2 });
  });
})();
