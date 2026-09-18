(() => {
  function nativeToolbar(root) {
    const head = root.querySelector('.workspace-head,.role-studio-toolbar,.ticket-head,.creator-head,.voice-head,.analytics-head,.flow-studio-toolbar');
    if (!head) return;
    head.classList.add('o6-native-toolbar', 'o7-native-toolbar');

    let titleNode = null;
    if (head.matches('.role-studio-toolbar')) titleNode = head.querySelector(':scope > .role-studio-title');
    else if (head.matches('.flow-studio-toolbar')) titleNode = head.querySelector(':scope > .flow-studio-title');
    else if (head.matches('.voice-head')) titleNode = head.querySelector(':scope > .voice-head-copy');
    else titleNode = head.firstElementChild;

    const usefulChildren = [...head.children].filter(child => child !== titleNode && !child.classList.contains('hidden'));
    head.classList.toggle('o6-native-toolbar-empty', usefulChildren.length === 0);
  }

  function decorate(tab) {
    if (!tab || tab === 'overview') return;
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.classList.add('o6-module-canvas', 'o7-module-canvas');
    root.dataset.module = tab;
    nativeToolbar(root);
  }

  if (typeof renderGuildWorkspace !== 'function') return;
  const previousRenderGuildWorkspace = renderGuildWorkspace;
  renderGuildWorkspace = function renderGuildWorkspaceWithModuleShell(tab) {
    previousRenderGuildWorkspace(tab);
    requestAnimationFrame(() => decorate(tab));
  };

  requestAnimationFrame(() => {
    const dashboardVisible = !document.querySelector('#guildDashboard')?.classList.contains('hidden');
    if (dashboardVisible && typeof activeTab !== 'undefined') decorate(activeTab);
  });
})();