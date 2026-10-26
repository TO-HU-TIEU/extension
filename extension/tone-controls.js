(() => {
  document.querySelectorAll(".module-nav button").forEach((button) => {
    const label = button.querySelector(".panel-nav-label")?.textContent?.trim();
    if (label) button.title = label;
  });
  const select = document.getElementById("replyTone");
  if (!select) return;
  const toneCard = document.getElementById("toneSettings");
  const wrap = document.createElement("div");
  wrap.className = "tone-choice";
  [
    ["male", "Nam"],
    ["female", "Nữ"],
  ].forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tone = value;
    button.innerHTML = `<span>${label}</span><span class="tone-check" aria-hidden="true"></span>`;
    button.addEventListener("click", () => {
      select.value = select.value === value ? "" : value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
    });
    wrap.append(button);
  });
  select.after(wrap);
  function sync() {
    wrap
      .querySelectorAll("button")
      .forEach((button) => {
        const active = button.dataset.tone === select.value;
        button.classList.toggle("active", active);
        const check = button.querySelector(".tone-check");
        if (check) check.innerHTML = active ? globalThis.AssistantIcons?.svg("check") || "" : "";
      });
    toneCard?.classList.toggle("tone-required", !select.value);
  }
  select.addEventListener("change", sync);
  if (toneCard) {
    toneCard.hidden = false;
    toneCard.classList.add("tone-inline-card");
    toneCard.querySelector("h2")?.replaceChildren(document.createTextNode("Tone"));
    toneCard.querySelector(".hint")?.remove();
    toneCard.querySelector(".section-head")?.append(wrap);
    select.hidden = true;
  }
  sync();
})();
