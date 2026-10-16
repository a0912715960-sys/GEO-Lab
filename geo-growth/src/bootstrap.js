(function () {
  window.__geoReady = false;
  window.__geoStartupFail = function (error) {
    if (window.__geoReady) return;
    const host = document.getElementById('app');
    if (!host) return;
    const box = document.createElement('main');
    box.className = 'startup';
    const title = document.createElement('h1');
    title.textContent = '工作台未能启动';
    const help = document.createElement('p');
    help.textContent =
      '这不是后台仍在计算。请下载 GEO-Growth-Demo.html，用 Edge 或 Chrome 打开；若使用完整后端，请先启动本地服务。';
    const details = document.createElement('p');
    details.className = 'fine';
    details.textContent =
      '启动信息：' + String((error && error.message) || error || '页面脚本未执行');
    box.append(title, help, details);
    host.replaceChildren(box);
  };
  window.addEventListener('error', function (e) {
    window.__geoStartupFail(e.error || e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__geoStartupFail(e.reason);
  });
  setTimeout(function () {
    if (!window.__geoReady) window.__geoStartupFail('启动超过5秒，请使用离线文件或检查本地服务。');
  }, 5000);
})();
