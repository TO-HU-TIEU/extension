(() => {
  document.documentElement.classList.remove("xra-hide-discovery");
  let settings = {},
    menu,
    dialog,
    styleMenu,
    timer;
  const P = globalThis.ReplyPreferences,
    CHEVRON_PATH =
      "M12.7071 14.7071C12.3166 15.0976 11.6834 15.0976 11.2929 14.7071L6.29289 9.70711C5.90237 9.31658 5.90237 8.68342 6.29289 8.29289C6.68342 7.90237 7.31658 7.90237 7.70711 8.29289L12 12.5858L16.2929 8.29289C16.6834 7.90237 17.3166 7.90237 17.7071 8.29289C18.0976 8.68342 18.0976 9.31658 17.7071 9.70711L12.7071 14.7071Z";
  const save = async (patch) => {
    await chrome.storage.local.set(patch);
    settings = { ...settings, ...patch };
    update();
    document.dispatchEvent(new CustomEvent("xra-preferences-changed"));
  };
  function account(target) {
    const a = target.closest?.("a[href]");
    if (!a && target.closest?.('[data-testid="UserName"]')) return P.handle(location.href);
    if (
      !a ||
      (!a.closest(
        '[data-testid="User-Name"],[data-testid^="UserAvatar-Container"],[data-testid="UserName"]',
      ) &&
        !a.querySelector("img") &&
        !a.querySelector('[data-testid^="UserAvatar"]'))
    )
      return "";
    try {
      const u = new URL(a.href);
      if (
        !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(u.hostname) ||
        !/^\/[A-Za-z0-9_]{1,15}(?:\/photo)?\/?$/.test(u.pathname)
      )
        return "";
      return P.handle(a.href);
    } catch {
      return "";
    }
  }
  function open(handle) {
    dialog?.remove();
    menu?.remove();
    dialog = document.createElement("dialog");
    dialog.className = "xra-person-dialog";
    const title = document.createElement("h3");
    title.textContent = `Phong cách trả lời @${handle}`;
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Phong cách riêng");
    const list = P.catalog(settings);
    for (const item of list) select.append(new Option(item.name, item.id));
    const person = P.person(settings, handle);
    if (person && !list.some((x) => x.id === person.styleId)) {
      list.push({ id: person.styleId, name: P.label(person), prompt: person.prompt });
      select.append(new Option(P.label(person), person.styleId));
    }
    select.value = person?.styleId || settings.styleId || list[0]?.id;
    const label = document.createElement("label");
    label.textContent = "Yêu cầu bổ sung cho tài khoản này (không bắt buộc)";
    const extra = document.createElement("textarea");
    extra.maxLength = 2000;
    extra.rows = 4;
    extra.value = person?.extraPrompt || "";
    extra.placeholder = "Ví dụ: Trao đổi thẳng thắn, tránh tiếng lóng.";
    const row = document.createElement("div");
    row.className = "xra-dialog-actions";
    const error = document.createElement("small");
    const button = (text, action) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.onclick = async () => {
        b.disabled = true;
        try {
          await action();
          dialog.close();
          dialog.remove();
        } catch (e) {
          error.textContent = e.message;
          b.disabled = false;
        }
      };
      row.append(b);
    };
    button("Lưu", async () => {
      const fresh = await chrome.storage.local.get("personalReplyStyles"),
        chosen = list.find((x) => x.id === select.value);
      if (!chosen) throw new Error("Hãy chọn phong cách.");
      await save({
        personalReplyStyles: {
          ...fresh.personalReplyStyles,
          [handle]: {
            styleId: chosen.id,
            name: chosen.name,
            prompt: chosen.prompt,
            extraPrompt: extra.value.trim(),
          },
        },
      });
    });
    if (person)
      button("Xoá phong cách riêng", async () => {
        const fresh = await chrome.storage.local.get("personalReplyStyles"),
          people = { ...fresh.personalReplyStyles };
        delete people[handle];
        await save({ personalReplyStyles: people });
      });
    button("Huỷ", async () => {});
    dialog.append(title, select, label, extra, error, row);
    document.body.append(dialog);
    dialog.showModal();
  }
  document.addEventListener("contextmenu", (event) => {
    const handle = account(event.target);
    if (!handle) return;
    event.preventDefault();
    menu?.remove();
    menu = document.createElement("div");
    menu.className = "xra-person-menu";
    menu.setAttribute("role", "menu");
    menu.style.left = Math.min(event.clientX, innerWidth - 260) + "px";
    menu.style.top = Math.min(event.clientY, innerHeight - 50) + "px";
    const b = document.createElement("button");
    b.textContent = P.person(settings, handle)
      ? "Thay đổi phong cách trả lời riêng"
      : "Gán phong cách trả lời riêng";
    b.onclick = () => open(handle);
    menu.append(b);
    document.body.append(menu);
  });
  document.addEventListener("click", (event) => {
    if (menu && !menu.contains(event.target)) menu.remove();
    if (
      styleMenu &&
      !styleMenu.contains(event.target) &&
      !event.target.closest?.(".xra-style-select")
    )
      closeStyleMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu?.remove();
      closeStyleMenu();
    }
  });
  function update() {
    for (const group of document.querySelectorAll(
      '[data-testid="User-Name"],[data-testid="UserName"]',
    )) {
      const link = [...group.querySelectorAll("a[href]")].find((a) => {
        try {
          return P.handle(a.href) && /^\/[A-Za-z0-9_]{1,15}\/?$/.test(new URL(a.href).pathname);
        } catch {
          return false;
        }
      });
      const handle = link && P.handle(link.href),
        person = P.person(settings, handle);
      let tag = group.querySelector(".xra-person-tag");
      if (!person) {
        tag?.remove();
        continue;
      }
      if (!tag) {
        tag = document.createElement("button");
        tag.className = "xra-person-tag";
        group.append(tag);
      }
      if (tag.textContent !== P.label(person)) tag.textContent = P.label(person);
      tag.title = `Phong cách riêng @${handle} — bấm để sửa hoặc xoá`;
      tag.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        open(handle);
      };
    }
    toolbar();
    theme();
  }
  function closeStyleMenu() {
    styleMenu?.remove();
    styleMenu = null;
  }
  function styleSummary(item) {
    const value = `${item?.name || ""} ${item?.prompt || ""}`.toLowerCase();
    if (value.includes("tiên hiệp"))
      return "Đạo hữu nói vậy thì đúng là linh khí bữa nay hơi nghịch thiên rồi.";
    if (value.includes("trang trọng") || value.includes("nghiêm túc"))
      return "Ý này khá hợp lý, nhất là khi nhìn vào chi tiết chính của bài.";
    if (value.includes("phân tích"))
      return "Điểm đáng chú ý là chi tiết nhỏ này lại nói khá nhiều về toàn cảnh.";
    if (value.includes("hóm hỉnh") || value.includes("châm biếm"))
      return "Cú này nhìn nhẹ nhàng vậy thôi chứ độ sát thương hơi cao đó.";
    if (
      value.includes("ngắn") ||
      value.includes("gọn") ||
      value.includes("giới trẻ") ||
      value.includes("đời thường")
    )
      return "Nhìn vậy là hiểu mood luôn, gọn mà đúng ý.";
    return "Một góc nhìn ngắn gọn, rõ ý và phù hợp với nội dung bài.";
  }
  function openStyleMenu(box, trigger, list) {
    closeStyleMenu();
    styleMenu = document.createElement("div");
    styleMenu.className = "xra-style-menu";
    styleMenu.setAttribute("role", "menu");
    const head = document.createElement("div");
    head.className = "xra-style-menu-title";
    head.textContent = "Chọn phong cách trả lời";
    styleMenu.append(head);
    const current = trigger.dataset.styleId || settings.styleId || list[0]?.id;
    for (const item of list) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "xra-style-option";
      option.setAttribute("role", "menuitem");
      option.classList.toggle("active", item.id === current);
      const text = document.createElement("span"),
        name = document.createElement("b"),
        summary = document.createElement("small"),
        check = document.createElement("i");
      name.textContent = item.name;
      summary.textContent = styleSummary(item);
      check.textContent = item.id === current ? "✓" : "";
      text.append(name, summary);
      option.append(text, check);
      option.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeStyleMenu();
        const handle = P.handle(location.href);
        if (P.person(settings, handle)) {
          const fresh = await chrome.storage.local.get("personalReplyStyles");
          await save({
            personalReplyStyles: {
              ...fresh.personalReplyStyles,
              [handle]: {
                ...fresh.personalReplyStyles[handle],
                styleId: item.id,
                name: item.name,
                prompt: item.prompt,
              },
            },
          });
        } else await save({ styleId: item.id, stylePrompt: item.prompt });
      };
      styleMenu.append(option);
    }
    document.body.append(styleMenu);
    styleMenu.style.width = "min(420px, calc(100vw - 32px))";
    styleMenu.style.left = "50%";
    styleMenu.style.top = "50%";
    styleMenu.style.transform = "translate(-50%, -50%)";
  }
  function toolbar() {
    for (const box of document.querySelectorAll(".xra-box")) {
      let select = box.querySelector(".xra-style-select");
      const count = box.querySelector(".xra-count-wrap");
      if (!select) {
        select = document.createElement("button");
        select.type = "button";
        select.className = "xra-style-select xra-style-trigger";
        select.title = "Phong cách trả lời";
        select.setAttribute("aria-label", "Phong cách trả lời");
        const label = document.createElement("span");
        label.className = "xra-style-label";
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.className.baseVal = "xra-dropdown-icon";
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("fill", "none");
        icon.setAttribute("aria-hidden", "true");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill-rule", "evenodd");
        path.setAttribute("clip-rule", "evenodd");
        path.setAttribute("d", CHEVRON_PATH);
        path.setAttribute("fill", "currentColor");
        icon.append(path);
        select.append(label, icon);
        count.before(select);
        select.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const list = P.catalog(settings),
            person = P.person(settings, location.href);
          if (person && !list.some((x) => x.id === person.styleId))
            list.push({ id: person.styleId, name: P.label(person), prompt: person.prompt });
          openStyleMenu(box, select, list);
        };
      }
      const list = P.catalog(settings),
        person = P.person(settings, location.href);
      if (person && !list.some((x) => x.id === person.styleId))
        list.push({ id: person.styleId, name: P.label(person), prompt: person.prompt });
      const signature = JSON.stringify(list.map((x) => [x.id, x.name]));
      if (select.dataset.catalog !== signature) select.dataset.catalog = signature;
      const selectedId = person?.styleId || settings.styleId || list[0]?.id,
        selected = list.find((x) => x.id === selectedId) || list[0];
      select.dataset.styleId = selected?.id || "";
      select.querySelector(".xra-style-label").textContent = selected?.name || "Mặc định";
      let fast = box.querySelector(".xra-fast");
      if (!fast) {
        fast = document.createElement("button");
        fast.className = "xra-button xra-fast";
        const flashIcon =
          globalThis.AssistantIcons?.svg("flash") ||
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16v-5m4 5V8m4 8v-2M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M19 2v3m0 3V5m0 0h3m-3 0h-3"/></svg>';
        fast.innerHTML =
          flashIcon.replace("ui-icon-flash", "xra-icon-outline") +
          flashIcon.replace("ui-icon-flash", "xra-icon-filled");
        count.before(fast);
        fast.onclick = () => save({ fastReplyMode: !settings.fastReplyMode });
      }
      fast.classList.toggle("active", !!settings.fastReplyMode);
      fast.setAttribute("aria-pressed", String(!!settings.fastReplyMode));
      fast.title = settings.fastReplyMode ? "Gợi ý nhanh: đang bật" : "Bật gợi ý nhanh";
      globalThis.ReplyLayout.apply(box, settings.replyLayout);
    }
  }
  function theme() {
    const root = document.documentElement,
      bodyStyle = getComputedStyle(document.body),
      textNode = document.querySelector('[data-testid="tweetText"]'),
      forced = globalThis.AssistantTheme?.mode,
      light = forced === "light",
      color = light
        ? "#0f1419"
        : forced === "dark"
          ? "#e7e9ea"
          : textNode
            ? getComputedStyle(textNode).color
            : bodyStyle.color;
    let background = light ? "#fff" : forced === "dark" ? "#000" : bodyStyle.backgroundColor;
    if (!background || background === "rgba(0, 0, 0, 0)" || background === "transparent")
      background = getComputedStyle(root).backgroundColor;
    for (const [key, value] of Object.entries({
      "--xra-font": textNode ? getComputedStyle(textNode).fontFamily : bodyStyle.fontFamily,
      "--xra-color": color || "rgb(231,233,234)",
      "--xra-bg": background && background !== "rgba(0, 0, 0, 0)" ? background : "rgb(0,0,0)",
    }))
      if (root.style.getPropertyValue(key) !== value) root.style.setProperty(key, value);
  }
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      update();
    }, 120);
  };
  document.addEventListener("xra-theme-change", schedule);
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  new MutationObserver(schedule).observe(document.body, {
    attributes: true,
    attributeFilter: ["style", "class"],
  });
  addEventListener("resize", schedule);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const keys = [
      "styleId",
      "stylePrompt",
      "replyStyleCatalog",
      "remotePresetCache",
      "customStyles",
      "personalReplyStyles",
      "fastReplyMode",
      "replyLayout",
    ];
    if (!keys.some((key) => changes[key])) return;
    for (const key of keys) if (changes[key]) settings[key] = changes[key].newValue;
    schedule();
    if (["styleId", "stylePrompt", "personalReplyStyles"].some((key) => changes[key]))
      document.dispatchEvent(new CustomEvent("xra-style-changed"));
  });
  chrome.storage.local
    .get([
      "styleId",
      "stylePrompt",
      "replyStyleCatalog",
      "remotePresetCache",
      "customStyles",
      "personalReplyStyles",
      "fastReplyMode",
      "replyLayout",
    ])
    .then((s) => {
      settings = s;
      update();
    });
})();
