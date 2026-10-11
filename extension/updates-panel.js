(() => {
  const $ = id => document.getElementById(id);
  const current = chrome.runtime.getManifest().version;
  const latestPage = 'https://github.com/TO-HU-TIEU/extension/releases/latest';
  $('extensionVersion').textContent = `Đang dùng phiên bản ${current}`;
  $('extensionReleaseLink').href = latestPage;
  $('extensionReleaseLink').onclick = event => event.stopPropagation();
  $('checkExtensionUpdate').onclick = async () => {
    $('extensionUpdateStatus').textContent = 'Đang mở trang phiên bản mới nhất…';
    try {
      await chrome.tabs.create({ url: latestPage });
      $('extensionUpdateStatus').textContent = 'Đã mở trang tải bản mới nhất.';
    } catch {
      $('extensionUpdateStatus').textContent = latestPage;
    }
  };
})();
