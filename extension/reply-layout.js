(() => {
  const ids = [
    "generate",
    "regenerate",
    "wordRange",
    "style",
    "count",
    "fast",
    "settings",
    "autoSuggest",
    "autoLike",
    "autoReply",
  ];
  const defaults = {
    left: ["generate", "regenerate"],
    right: ["wordRange", "style", "count", "fast", "settings"],
    hidden: [],
    menu: ["autoSuggest", "autoLike", "autoReply", "replyEnterToSend"],
    panelMenu: ["autoSuggest", "autoLike", "autoRepost", "autoReply", "replyEnterToSend"],
    density: "comfortable",
    showLabels: false,
    border: true,
  };
  function normalize() {
    const result = {
      left: [...defaults.left],
      right: [...defaults.right],
      hidden: [],
      menu: [...defaults.menu],
      panelMenu: [...defaults.panelMenu],
    };
    return result;
  }
  function apply(box) {
    const layout = normalize(),
      tools = box.querySelector(".xra-tools");
    if (!tools) return;
    const selectors = {
        generate: ".xra-generate",
        regenerate: ".xra-sync",
        wordRange: ".xra-word-range",
        style: ".xra-style-select",
        count: ".xra-count-wrap",
        fast: ".xra-fast",
        settings: ".xra-settings",
        autoSuggest: ".xra-auto-suggest",
        autoLike: ".xra-auto-like",
        autoReply: ".xra-auto-reply",
      },
      nodes = Object.fromEntries(ids.map((id) => [id, box.querySelector(selectors[id])]));
    for (const side of ["left", "right", "hidden"]) {
      let group = tools.querySelector(".xra-tools-" + side);
      if (!group) {
        group = document.createElement("div");
        group.className = "xra-tools-group xra-tools-" + side;
        tools.append(group);
      }
      const desired = (side === "hidden" ? [...layout.hidden, ...layout.menu] : layout[side])
        .map((id) => nodes[id])
        .filter(Boolean);
      if (
        desired.length !== group.children.length ||
        desired.some((node, index) => group.children[index] !== node)
      )
        group.replaceChildren(...desired);
    }
    const panel = box.querySelector(".xra-auto-panel");
    if (panel) {
      const groups = new Map(),
        leading = [];
      let activeKey = "";
      for (const child of [...panel.children]) {
        if (child.tagName === "LABEL") {
          activeKey = child.querySelector("input")?.dataset.key || "";
          if (!groups.has(activeKey)) groups.set(activeKey, []);
          groups.get(activeKey).push(child);
        } else if (activeKey) groups.get(activeKey)?.push(child);
        else leading.push(child);
      }
      const keys = [
          ...layout.panelMenu,
          ...[...groups.keys()].filter((key) => !layout.panelMenu.includes(key)),
        ],
        ordered = [...leading, ...keys.flatMap((key) => groups.get(key) || [])];
      if (ordered.some((child, index) => panel.children[index] !== child))
        panel.replaceChildren(...ordered);
      for (const [key, children] of groups)
        for (const row of children)
          if (row.tagName === "LABEL") row.hidden = !layout.panelMenu.includes(key);
    }
    box.classList.remove("xra-compact", "xra-show-labels", "xra-no-border");
    for (const id of ["generate", "regenerate", "fast", "settings"]) {
      const node = nodes[id];
      if (!node) continue;
      const label = {
        generate: "Tạo gợi ý",
        regenerate: "Tạo lại",
        fast: "Gợi ý nhanh",
        settings: "Cài đặt",
      }[id];
      node.setAttribute("aria-label", label);
      if (!node.querySelector(".xra-tool-label")) {
        const span = document.createElement("span");
        span.className = "xra-tool-label";
        span.textContent = label;
        node.append(span);
      }
    }
    return layout;
  }
  globalThis.ReplyLayout = { defaults, normalize, apply, ids };
})();
