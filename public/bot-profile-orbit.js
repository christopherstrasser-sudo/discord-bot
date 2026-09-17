(() => {
  const PROFILE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="13" rx="4"/><path d="M9 6V4.5M15 6V4.5M8.5 12h.01M15.5 12h.01M9 16h6"/></svg>';

  function ensureCustomBotAssets() {
    if (!document.querySelector('link[data-orbit-custom-bot]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/custom-bot.css?v=0310';
      link.dataset.orbitCustomBot = '1';
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-orbit-custom-bot]')) {
      const script = document.createElement('script');
      script.src = '/custom-bot.js?v=0310';
      script.defer = true;
      script.dataset.orbitCustomBot = '1';
      document.body.appendChild(script);
    }
  }

  function profileIsCustomized() {
    const profile = workingSettings?.botProfile || {};
    return Boolean(
      String(profile.nickname || '').trim()
      || String(profile.bio || '').trim()
      || String(profile.avatarHash || '').trim()
    );
  }

  function activeModuleCountWithProfile() {
    const ticketConfig = window.RakuTicketStudio?.s?.cfg || null;
    const creatorConfig = window.RakuCreatorHub?.s?.cfg || null;
    return [
      Boolean(workingSettings?.welcome?.enabled),
      Boolean(workingSettings?.autorole?.enabled),
      Boolean(workingSettings?.rolePanels?.enabled),
      Boolean(ticketConfig?.enabled),
      Boolean(workingSettings?.voiceStudio?.enabled || workingSettings?.voice?.enabled),
      Boolean(workingSettings?.customCommands?.enabled),
      Boolean(creatorConfig?.enabled),
      Boolean(workingSettings?.logging?.enabled),
      profileIsCustomized()
    ].filter(Boolean).length;
  }

  function ensureStyles() {
    if (document.querySelector('#orbit-bot-profile-node-style')) return;
    const style = document.createElement('style');
    style.id = 'orbit-bot-profile-node-style';
    style.textContent = `
      .o6-node-i { left:50%; top:2%; width:154px; margin-left:-77px; }
      .o6-orbit-map[data-focus="i"] .link-i {
        opacity:1;
        stroke-width:2;
        filter:drop-shadow(0 0 5px rgba(149,135,255,.55));
      }
      @media (max-width:700px) {
        .o6-node-i {
          position:relative !important;
          left:auto !important;
          right:auto !important;
          top:auto !important;
          bottom:auto !important;
          width:100% !important;
          min-width:0 !important;
          margin-left:0 !important;
          transform:none !important;
        }
        .o6-node-i:hover,.o6-node-i:focus-visible { transform:translateY(-2px) !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureLink(map) {
    const svg = map.querySelector('.o6-orbit-links');
    if (!svg || svg.querySelector('.link-i')) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'o6-link link-i');
    line.setAttribute('x1', '500');
    line.setAttribute('y1', '280');
    line.setAttribute('x2', '500');
    line.setAttribute('y2', '48');
    svg.appendChild(line);
  }

  function ensureProfileNode(map) {
    if (map.querySelector('[data-o6-open="profile"]')) return;
    const customized = profileIsCustomized();
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `o6-node o6-node-i outer${customized ? ' on' : ''}`;
    node.dataset.o6Open = 'profile';
    node.dataset.orbitPosition = 'i';
    node.innerHTML = `
      <span class="o6-module-symbol">${PROFILE_ICON}</span>
      <div><b>Bot-Profil</b><small>${customized ? 'Individuell' : 'Bereit'}</small></div>
      <i class="o6-node-status ${customized ? 'on' : ''}" aria-hidden="true"></i>
    `;

    const focus = () => { map.dataset.focus = 'i'; };
    const clear = () => {
      if (map.dataset.focus === 'i') delete map.dataset.focus;
    };
    node.addEventListener('mouseenter', focus);
    node.addEventListener('focus', focus);
    node.addEventListener('mouseleave', clear);
    node.addEventListener('blur', clear);
    node.addEventListener('click', () => switchTab('profile'));
    map.appendChild(node);
  }

  function syncCounts(root) {
    const activeCount = activeModuleCountWithProfile();
    const metric = root.querySelector('.o6-metric-row span:first-child b');
    if (metric) metric.textContent = String(activeCount);
    const coreMeta = root.querySelector('.o6-core-copy small');
    if (coreMeta) coreMeta.textContent = `${activeCount} von 9 Modulen aktiv`;
  }

  function enhanceOverview() {
    const root = document.querySelector('#guildWorkspace');
    const map = root?.querySelector('.o6-orbit-map');
    if (!root || !map) return;
    ensureStyles();
    ensureLink(map);
    ensureProfileNode(map);
    syncCounts(root);
  }

  if (typeof renderGuildWorkspace === 'function') {
    const previousWorkspace = renderGuildWorkspace;
    renderGuildWorkspace = function renderGuildWorkspaceWithProfileOrbit(tab) {
      previousWorkspace(tab);
      if (tab === 'overview') requestAnimationFrame(enhanceOverview);
    };
  }

  ensureCustomBotAssets();
  requestAnimationFrame(enhanceOverview);
})();