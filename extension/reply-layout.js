(() => {
  const ids = [
    "generate",
    "regenerate",
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
    right: ["style", "count", "fast", "settings"],
    hidden: [],
    menu: ["autoSuggest", "autoLike", "autoReply", "replyEnterToSend"],
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
      const rows = [...panel.querySelectorAll("label")];
      const ordered = [
        ...layout.menu
          .map((id) => rows.find((row) => row.querySelector("input")?.dataset.key === id))
          .filter(Boolean),
        ...rows.filter((row) => !layout.menu.includes(row.querySelector("input")?.dataset.key)),
      ];
      if (ordered.some((row, index) => panel.children[index] !== row))
        panel.replaceChildren(...ordered);
      for (const row of rows)
        row.hidden = !layout.menu.includes(row.querySelector("input")?.dataset.key);
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
