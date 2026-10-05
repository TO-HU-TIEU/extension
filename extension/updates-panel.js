(() => {
  const $ = id => document.getElementById(id);
  const current = chrome.runtime.getManifest().version;
  const setVersion = newest => { $('extensionVersion').textContent = `Đang dùng phiên bản ${current}${newest ? ' (Mới nhất)' : ''}`; };
  setVersion(false);
  let latest = null;
  let updaterReady = false;
  async function updaterStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'extensionUpdaterStatus' });
      updaterReady = !!(response?.ok && response.data.supported);
    } catch { updaterReady = false; }
    $('extensionUpdaterStatus').textContent = updaterReady ? 'Trình cập nhật đã kết nối. Không cần giải nén ZIP.' : 'Cài trình cập nhật một lần để dùng Cập nhật ngay.';
    $('setupExtensionUpdater').hidden = updaterReady;
    $('downloadExtensionUpdate').hidden = updaterReady || !latest || !ExtensionUpdates.newer(latest.version,current);
    $('installExtensionUpdate').hidden = !updaterReady || !latest || !ExtensionUpdates.newer(latest.version,current);
  }
  $('installExtensionUpdate').onclick = async () => {
    if (!updaterReady || !latest || !ExtensionUpdates.newer(latest.version,current)) return;
    $('installExtensionUpdate').disabled = true;
    $('checkExtensionUpdate').disabled = true;
    $('extensionUpdateStatus').textContent = 'Đang tải và cài bản cập nhật…';
    try {
      const response = await chrome.runtime.sendMessage({type:'installExtensionUpdate'});
      if (!response?.ok) throw new Error(response?.error || 'Không cập nhật được.');
      $('extensionUpdateStatus').textContent = 'Đã cập nhật. Đang tải lại Assistant…';
      await chrome.storage.local.set({extensionUpdatedTo:response.data.version});
      chrome.runtime.reload();
    } catch(error) {
      $('extensionUpdateStatus').textContent = error.message;
      $('installExtensionUpdate').disabled = false;
      $('checkExtensionUpdate').disabled = false;
    }
  };
  $('setupExtensionUpdater').onclick = () => chrome.tabs.create({url:'https://github.com/TO-HU-TIEU/extension/releases/latest/download/install-assistant-updater.cmd'});
  $('extensionReleaseLink').onclick = event => event.stopPropagation();
  updaterStatus();
  if (chrome.storage?.local) chrome.storage.local.get('extensionUpdatedTo').then(value => {
    if (value.extensionUpdatedTo === current) {
      $('extensionUpdateStatus').textContent = `Đã cập nhật ${current}. Tải lại trang X đang mở để áp dụng.`;
      chrome.storage.local.remove('extensionUpdatedTo');
    }
  }).catch(()=>{});
  $('checkExtensionUpdate').onclick = async () => {
    const button = $('checkExtensionUpdate');
    button.disabled = true;
    latest = null;
    $('downloadExtensionUpdate').hidden = true;
    $('installExtensionUpdate').hidden = true;
    $('extensionReleaseLink').hidden = true;
    $('extensionUpdateHelp').hidden = true;
    $('extensionUpdateStatus').textContent = 'Đang kiểm tra…';
    setVersion(false);
    try {
      latest = await ExtensionUpdates.check();
      const available = ExtensionUpdates.newer(latest.version, current);
      setVersion(!available);
      $('extensionUpdateStatus').textContent = available ? `Có phiên bản mới ${latest.version}` : '';
      $('downloadExtensionUpdate').hidden = !available;
      $('extensionReleaseLink').href = latest.page;
      $('extensionReleaseLink').hidden = false;
      await updaterStatus();
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
