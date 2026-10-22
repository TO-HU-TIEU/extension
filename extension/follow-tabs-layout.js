(function () {
  const tabs = document.querySelector(".follow-tabs");
  if (!tabs) return;
  // Use the side-panel viewport breakpoint instead of observing the tab row.
  // Toggling its own class changes layout and can make ResizeObserver report
  // a feedback loop in Chrome ("undelivered notifications").
  const media = globalThis.matchMedia?.("(max-width: 379px)");
  if (!media) return;
  const update = () => {
    const narrow = media.matches;
    if (tabs.classList.contains("follow-tabs-narrow") !== narrow) {
      tabs.classList.toggle("follow-tabs-narrow", narrow);
    }
  };
  media.addEventListener?.("change", update);
  update();
})();
