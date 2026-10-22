(() => {
  const testId = (node) => node?.getAttribute?.("data-testid") || "";
  function node(article) {
    const own = (selector) =>
      [...(article?.querySelectorAll?.(selector) || [])].find(
        (candidate) => candidate.closest?.('article[data-testid="tweet"]') === article,
      );
    return (
      own('[data-testid="twitterArticleReadView"] [data-testid="longformRichTextComponent"]') ||
      own('[data-testid="twitterArticleReadView"] [data-testid="twitterArticleRichTextView"]') ||
      null
    );
  }
  function text(article, contentNode) {
    const body = String(contentNode?.innerText || contentNode?.textContent || "").trim();
    if (
      !body ||
      !["longformRichTextComponent", "twitterArticleRichTextView"].includes(testId(contentNode))
    )
      return body;
    const title = String(
      article?.querySelector?.('[data-testid="twitter-article-title"]')?.innerText ||
        article?.querySelector?.('[data-testid="twitter-article-title"]')?.textContent ||
        "",
    ).trim();
    return title && !body.startsWith(title) ? `${title}\n${body}` : body;
  }
  globalThis.XArticleContent = { node, text };
})();
