(() => {
  const $ = id => document.getElementById(id);
  const current = chrome.runtime.getManifest().version;
  $('extensionVersion').textContent = `Đang dùng phiên bản ${current}`;
  let latest = null;
  $('checkExtensionUpdate').onclick = async () => {
    const button = $('checkExtensionUpdate');
    button.disabled = true;
    latest = null;
    $('downloadExtensionUpdate').hidden = true;
    $('extensionReleaseLink').hidden = true;
    $('extensionUpdateHelp').hidden = true;
    $('extensionUpdateStatus').textContent = 'Đang kiểm tra…';
    try {
      latest = await ExtensionUpdates.check();
      const available = ExtensionUpdates.newer(latest.version, current);
      $('extensionUpdateStatus').textContent = available ? `Có phiên bản mới ${latest.version}` : 'Bạn đang dùng phiên bản mới nhất.';
      $('downloadExtensionUpdate').hidden = !available;
      $('extensionReleaseLink').href = latest.page;
      $('extensionReleaseLink').hidden = false;
    } catch (error) {
      $('extensionUpdateStatus').textContent = error.name === 'TimeoutError' ? 'Kiểm tra quá lâu. Hãy thử lại sau.' : error.message;
    } finally { button.disabled = false; }
  };
  $('downloadExtensionUpdate').onclick = async () => {
    if (!latest || !ExtensionUpdates.newer(latest.version, current)) return;
    try {
      await chrome.tabs.create({ url: latest.url });
      $('extensionUpdateHelp').hidden = false;
    } catch { $('extensionUpdateStatus').textContent = 'Không mở được bản cập nhật. Hãy thử lại.'; }
  };
})();
