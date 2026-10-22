/* Side-panel-only icon system: 24px canvas, 1.75px rounded outline. */
(() => {
  const stroke = (body) =>
    `<g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
  const icons = {
    reply: stroke(
      '<path d="M8 9h8M8 13h5"/><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-3.8A3 3 0 0 1 2 14V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/>',
    ),
    post: stroke('<path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5M8 13h8M8 17h6"/>'),
    follow: stroke(
      '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M18 8v6M15 11h6"/>',
    ),
    refresh: stroke(
      '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8.5A7 7 0 0 1 18.7 9M17.9 15.5A7 7 0 0 1 5.3 15"/>',
    ),
    plus: stroke('<path d="M12 5v14M5 12h14"/>'),
    save: stroke('<path d="m5 12 4 4L19 6"/>'),
    cancel: stroke('<path d="m6 6 12 12M18 6 6 18"/>'),
    close: stroke('<path d="m6 6 12 12M18 6 6 18"/>'),
    source: stroke(
      '<path d="M14 5h5v5M19 5l-8 8"/><path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/>',
    ),
    queue: stroke('<path d="M4 6h16v12H4zM8 10h8M8 14h5"/>'),
    copy: stroke(
      '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    ),
    remove: stroke('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'),
    "clear-list": stroke('<path d="M4 6h12M4 12h8M4 18h6M16 15l4 4M20 15l-4 4"/>'),
    user: stroke('<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
    users: stroke(
      '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 6.5a3 3 0 0 1 0 5.5M17 15a5 5 0 0 1 4 5"/>',
    ),
    "user-question": stroke(
      '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 11-3.3M18 15.5a2 2 0 1 1 2 2c-1 0-1.5.7-1.5 1.5M18.5 22h.01"/>',
    ),
    sort: stroke('<path d="M8 4v16M5 7l3-3 3 3M16 20V4M13 17l3 3 3-3"/>'),
    help: stroke(
      '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2 1-1.2 2M12 17h.01"/>',
    ),
    get: stroke('<path d="M5 4H3v16h2M19 4h2v16h-2M12 6v10M8.5 12.5 12 16l3.5-3.5"/>'),
    unfollow: stroke('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 10.5-4M16 17h6"/>'),
    warning: stroke('<path d="M12 3 2.8 20h18.4zM12 9v4M12 17h.01"/>'),
    delete: stroke('<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>'),
    stop: stroke('<rect x="7" y="7" width="10" height="10" rx="1"/>'),
    more: stroke(
      '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    ),
    setting: stroke(
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
    ),
    up: stroke('<path d="m6 14 6-6 6 6"/>'),
    dropdown: stroke('<path d="m7 10 5 5 5-5"/>'),
    light: stroke(
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    ),
    dark: stroke('<path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5z"/>'),
    flash: stroke('<path d="m13 2-8 12h7l-1 8 8-12h-7z"/>'),
    generate: stroke(
      '<path d="M5 5h14v11H9l-4 3z"/><path d="m12 7 .6 1.4L14 9l-1.4.6L12 11l-.6-1.4L10 9l1.4-.6z"/>',
    ),
    quote: stroke('<path d="M5 6h14v12H8l-3 3zM9 10h6M9 14h4"/>'),
    assistant: stroke('<path d="M5 7h14v10H9l-4 3zM9 11h6"/>'),
    chatgpt: stroke(
      '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M5.1 8l13.8 8M5.1 16l13.8-8"/>',
    ),
    gemini: stroke(
      '<path d="M12 3c.8 5 3.2 7.4 8 8-4.8.6-7.2 3-8 8-.8-5-3.2-7.4-8-8 4.8-.6 7.2-3 8-8z"/>',
    ),
    openai: stroke('<circle cx="12" cy="12" r="8"/><path d="M12 4v16M5 8l14 8M5 16l14-8"/>'),
    deepseek: stroke('<path d="M4 14c3-6 8-9 16-7-1 7-6 12-13 12-2 0-3-2-3-5zM8 15c3 0 6-1 9-4"/>'),
  };
  const aliases = { reload: "refresh", retry: "refresh", trash: "delete" };
  const resolve = (name) => aliases[name] || name;
  const svg = (name, extra = "") => {
    const key = resolve(name);
    return `<svg class="ui-icon ui-icon-${name}" viewBox="0 0 24 24" aria-hidden="true"${extra}>${icons[key] || icons.more}</svg>`;
  };
  globalThis.AssistantIcons = Object.freeze({
    icons: Object.freeze(icons),
    svg,
    path: (name) => icons[resolve(name)] || icons.more,
  });
})();
