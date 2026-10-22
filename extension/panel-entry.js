(() => {
  async function configure(chromeApi = globalThis.chrome) {
    const action = chromeApi?.action;
    const sidePanel = chromeApi?.sidePanel;
    if (sidePanel?.setPanelBehavior) {
      try {
        await action?.setPopup?.({ popup: "" });
        await sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        return "side-panel";
      } catch {
        // Some Chromium WebViews expose the API without supporting the feature.
      }
    }
    if (action?.setPopup) {
      await action.setPopup({ popup: "panel.html" });
      return "popup";
    }
    return "unavailable";
  }

  async function open(sender, chromeApi = globalThis.chrome) {
    const sidePanel = chromeApi?.sidePanel;
    if (sidePanel?.open && sender?.tab?.id) {
      try {
        await sidePanel.open({ tabId: sender.tab.id });
      } catch {
        await sidePanel.open({ windowId: sender.tab.windowId });
      }
      return { opened: true, mode: "side-panel" };
    }
    await configure(chromeApi);
    if (chromeApi?.windows?.create) {
      await chromeApi.windows.create({
        url: chromeApi.runtime?.getURL?.("panel.html") || "panel.html",
        type: "popup",
        width: 420,
        height: 720,
      });
      return { opened: true, mode: "popup" };
    }
    return { opened: false, mode: "popup" };
  }

  globalThis.AssistantPanelEntry = Object.freeze({ configure, open });
})();
