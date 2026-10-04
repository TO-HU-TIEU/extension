(() => {
  const repo = 'TO-HU-TIEU/extension';
  function version(value) {
    const text = String(value ?? '').replace(/^v/, '');
    if (!/^\d+(?:\.\d+){0,3}$/.test(text)) throw new Error('Phiên bản cập nhật không hợp lệ.');
    const parts = text.split('.').map(Number);
    if (parts.some(n => n > 65535)) throw new Error('Phiên bản cập nhật không hợp lệ.');
    return parts;
  }
  function newer(candidate, current) {
    const a = version(candidate), b = version(current);
    for (let i = 0; i < 4; i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
  }
  function release(data) {
    const value = String(data.tag_name ?? '').replace(/^v/, '');
    version(value);
    const page = `https://github.com/${repo}/releases/tag/v${value}`;
    const url = `https://github.com/${repo}/releases/download/v${value}/assistant-update-${value}.zip`;
    if (data.draft || data.prerelease || data.html_url !== page) throw new Error('Bản phát hành không hợp lệ.');
    if (!data.assets?.some(asset => asset.browser_download_url === url)) throw new Error('Bản phát hành chưa có gói cập nhật.');
    return { version: value, url, page };
  }
  async function check() {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (response.status === 404) throw new Error('Chưa tìm thấy bản phát hành công khai trên nguồn cập nhật. Hãy thử lại sau.');
    if (!response.ok) throw new Error('Không thể kiểm tra cập nhật. Hãy thử lại sau.');
    return release(await response.json());
  }
  globalThis.ExtensionUpdates = Object.freeze({ newer, release, check });
})();
