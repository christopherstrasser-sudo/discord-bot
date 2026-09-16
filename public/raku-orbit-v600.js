(() => {
  const MODULES = [
    ['overview', 'Übersicht', 'overview'],
    ['welcome', 'Willkommen', 'welcome'],
    ['autorole', 'Auto-Roles', 'autorole'],
    ['roles', 'Rollen', 'roles'],
    ['tickets', 'Tickets', 'tickets'],
    ['voice', 'Voice', 'voice'],
    ['commands', 'Commands', 'commands'],
    ['creators', 'Creator Alerts', 'creators'],
    ['logging', 'Logs', 'logging'],
    ['analytics', 'Analytics', 'analytics'],
    ['diagnostics', 'Diagnose', 'diagnostics']
  ];

  const META = {
    overview: ['Übersicht', 'Was gerade läuft, wo etwas fehlt und wohin du als Nächstes willst.'],
    welcome: ['Willkommen', 'Begrüßungen für neue Mitglieder.'],
    autorole: ['Auto-Roles', 'Automatische Rollen beim Beitritt.'],
    roles: ['Rollen', 'Self-Service-Rollen und Panels.'],
    tickets: ['Tickets', 'Support, Formulare und Workflows.'],
    voice: ['Voice', 'Temporäre Räume und Lobby-Automation.'],
    commands: ['Commands', 'Eigene Befehle und Antworten.'],
    creators: ['Creator Alerts', 'Twitch, YouTube und TikTok.'],
    logging: ['Logs', 'Server- und Moderationsereignisse.'],
    analytics: ['Analytics', 'Aktivität und Nutzung im Blick.'],
    diagnostics: ['Diagnose', 'Dashboard, Bot und Discord testen.']
  };

  const MODULE_ICONS = {
    overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
    welcome: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h9v15H5z"/><path d="M14 8h4.5v8H14M8.5 12h.01"/><path d="M18.5 4.5v2M17.5 5.5h2"/></svg>',
    autorole: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3"/><path d="M3.5 19c.4-3.3 2.1-5 5-5 1.6 0 2.9.5 3.8 1.4"/><path d="m14.5 17 2 2 4-5"/></svg>',
    roles: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7.5L20 13.5 13.5 20 5 11.5z"/><circle cx="8.5" cy="8.5" r="1"/></svg>',
    tickets: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v4a2.5 2.5 0 0 0 0 5v4H4v-4a2.5 2.5 0 0 0 0-5z"/><path d="M12 7.5v13" stroke-dasharray="2 2"/></svg>',
    voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13a7 7 0 0 1 14 0v4"/><path d="M5 13h2.5v6H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-1.7M19 13h-2.5v6H18a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-1.7"/></svg>',
    commands: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 4 5-4 5M11.5 17H19"/></svg>',
    creators: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="2.5"/><path d="M8 19v-2.2A4 4 0 0 1 12 13a4 4 0 0 1 4 3.8V19"/><path d="M5.2 6.5a8 8 0 0 0 0 7M18.8 6.5a8 8 0 0 1 0 7"/></svg>',
    logging: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/></svg>',
    diagnostics: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M5.5 12h3l1.8-4.2 3.2 8.4 2-4.2h3"/></svg>'
  };

  function moduleIcon(name) {
    return `<span class="o6-module-symbol">${MODULE_ICONS[name] || MODULE_ICONS.overview}</span>`;
  }

  function ticketConfig() {
    return window.RakuTicketStudio?.s?.cfg || null;
  }

  function creatorConfig() {
    return window.RakuCreatorHub?.s?.cfg || null;
  }

  function moduleState(tab) {
    if (tab === 'welcome') return Boolean(workingSettings?.welcome?.enabled);
    if (tab === 'autorole') return Boolean(workingSettings?.autorole?.enabled);
    if (tab === 'roles') return Boolean(workingSettings?.rolePanels?.enabled);
    if (tab === 'tickets') return Boolean(ticketConfig()?.enabled);
    if (tab === 'voice') return Boolean(workingSettings?.voiceStudio?.enabled || workingSettings?.voice?.enabled);
    if (tab === 'commands') return Boolean(workingSettings?.customCommands?.enabled);
    if (tab === 'creators') return Boolean(creatorConfig()?.enabled);
    if (tab === 'logging') return Boolean(workingSettings?.logging?.enabled);
    if (tab === 'analytics' || tab === 'diagnostics') return true;
    return null;
  }

  function moduleMeta(tab) {
    if (tab === 'roles') return `${workingSettings?.rolePanels?.panels?.length || 0} Panels`;
    if (tab === 'tickets') return `${ticketConfig()?.panels?.length || 0} Panels`;
    if (tab === 'commands') return `${workingSettings?.customCommands?.commands?.length || 0} Befehle`;
    if (tab === 'creators') return `${(creatorConfig()?.rules || []).filter(rule => rule.enabled).length} aktiv`;
    if (tab === 'voice') return moduleState(tab) ? 'Aktiv' : 'Bereit';
    if (tab === 'welcome' || tab === 'autorole' || tab === 'logging') return moduleState(tab) ? 'Aktiv' : 'Aus';
    return '';
  }

  function dockItem(tab, label, iconName) {
    const state = moduleState(tab);
    return `<button class="deck-nav-item o6-dock-item${activeTab === tab ? ' active' : ''}" data-tab="${tab}" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      ${moduleIcon(iconName)}
      <span class="o6-dock-label">${escapeHtml(label)}</span>
      ${state === null ? '' : `<i class="o6-dock-state ${state ? 'on' : ''}" aria-hidden="true"></i>`}
    </button>`;
  }

  function dockMarkup() {
    const groups = [
      MODULES.slice(0, 1),
      MODULES.slice(1, 6),
      MODULES.slice(6, 8),
      MODULES.slice(8)
    ];
    return groups.map((group, index) => `${index ? '<span class="o6-dock-separator" aria-hidden="true"></span>' : ''}${group.map(item => dockItem(...item)).join('')}`).join('');
  }

  function activityMarkup() {
    const history = window.RakuCreatorHub?.s?.history || [];
    if (!history.length) {
      return `<div class="o6-empty"><span>Alles ruhig.</span><small>Neue Creator- und Automationsereignisse tauchen hier auf.</small></div>`;
    }
    return history.slice(0, 7).map(item => {
      const time = item.at ? new Date(item.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
      return `<article class="o6-event">
        <i></i>
        <div><b>${escapeHtml(item.ruleName || 'Creator Alert')}</b><small>${escapeHtml(item.message || String(item.status || 'Ereignis'))}</small></div>
        <time>${escapeHtml(time)}</time>
      </article>`;
    }).join('');
  }

  function issues() {
    const rows = [];
    if (activeGuildData?.capabilities?.canManageRoles === false) rows.push(['roles', 'Rollen-Berechtigung fehlt', 'Der Bot kann aktuell keine Rollen verwalten.']);
    if (workingSettings?.welcome?.enabled && !workingSettings?.welcome?.channelId) rows.push(['welcome', 'Willkommen ohne Kanal', 'Wähle einen Zielkanal.']);
    if (workingSettings?.autorole?.enabled && !workingSettings?.autorole?.roleId) rows.push(['autorole', 'Auto-Role ohne Rolle', 'Wähle eine Rolle für neue Mitglieder.']);
    if (workingSettings?.logging?.enabled && !workingSettings?.logging?.channelId) rows.push(['logging', 'Logs ohne Kanal', 'Wähle einen Zielkanal.']);
    const creators = creatorConfig();
    if (creators?.enabled) {
      const broken = (creators.rules || []).filter(rule => rule.enabled && (!rule.source || !rule.channelId)).length;
      if (broken) rows.push(['creators', `${broken} Creator-Regel${broken === 1 ? '' : 'n'} unvollständig`, 'Quelle oder Zielkanal fehlt.']);
    }
    return rows;
  }

  function issuesMarkup() {
    const rows = issues();
    if (!rows.length) {
      return `<div class="o6-health-ok"><span>✓</span><div><b>Sieht gut aus</b><small>Keine offensichtlichen Konfigurationsprobleme.</small></div></div>`;
    }
    return rows.slice(0, 4).map(([tab, title, copy]) => `<button type="button" class="o6-health-row" data-o6-open="${tab}"><span>!</span><div><b>${escapeHtml(title)}</b><small>${escapeHtml(copy)}</small></div><em>›</em></button>`).join('');
  }

  function constellationNode(tab, label, iconName, position, ring = 'outer') {
    const state = moduleState(tab);
    const status = moduleMeta(tab) || (state ? 'Aktiv' : 'Bereit');
    return `<button type="button" class="o6-node o6-node-${position} ${ring}${state ? ' on' : ''}" data-o6-open="${tab}" data-orbit-position="${position}">
      ${moduleIcon(iconName)}
      <div><b>${escapeHtml(label)}</b><small>${escapeHtml(status)}</small></div>
      <i class="o6-node-status ${state ? 'on' : ''}" aria-hidden="true"></i>
    </button>`;
  }

  function orbitLinks() {
    return `<svg class="o6-orbit-links" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="o6LinkGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9587ff" stop-opacity=".10"/>
          <stop offset=".52" stop-color="#b2a7ff" stop-opacity=".34"/>
          <stop offset="1" stop-color="#6cdcff" stop-opacity=".10"/>
        </linearGradient>
      </defs>
      <line class="o6-link link-a" x1="500" y1="280" x2="185" y2="105"/>
      <line class="o6-link link-b" x1="500" y1="280" x2="785" y2="100"/>
      <line class="o6-link link-c" x1="500" y1="280" x2="105" y2="250"/>
      <line class="o6-link link-d" x1="500" y1="280" x2="895" y2="245"/>
      <line class="o6-link link-e" x1="500" y1="280" x2="120" y2="430"/>
      <line class="o6-link link-f" x1="500" y1="280" x2="875" y2="425"/>
      <line class="o6-link link-g" x1="500" y1="280" x2="295" y2="505"/>
      <line class="o6-link link-h" x1="500" y1="280" x2="700" y2="510"/>
    </svg>`;
  }

  function orbitBeacons() {
    return `<div class="o6-orbit-beacons" aria-hidden="true">
      <i class="beacon-a"></i><i class="beacon-b"></i><i class="beacon-c"></i><i class="beacon-d"></i>
    </div>`;
  }

  function wireOrbitFocus(root) {
    const map = root.querySelector('.o6-orbit-map');
    if (!map) return;
    root.querySelectorAll('.o6-node[data-orbit-position]').forEach(node => {
      const focus = () => { map.dataset.focus = node.dataset.orbitPosition; };
      const clear = () => { delete map.dataset.focus; };
      node.addEventListener('mouseenter', focus);
      node.addEventListener('focus', focus);
      node.addEventListener('mouseleave', clear);
      node.addEventListener('blur', clear);
    });
  }

  function renderOverview() {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    const guild = activeGuildData?.guild || {};
    const activeCount = ['welcome','autorole','roles','tickets','voice','commands','creators','logging'].filter(moduleState).length;

    root.innerHTML = `
      <div class="o6-overview">
        <header class="o6-overview-intro">
          <div>
            <span class="o6-eyebrow">Heute auf deinem Server</span>
            <h1>${escapeHtml(guild.name || 'Discord')}</h1>
            <p>Dein Server als System: Module, Aktivität und offene Punkte in einem Blick.</p>
          </div>
          <div class="o6-metric-row">
            <span><b>${activeCount}</b><small>Module aktiv</small></span>
            <span><b>${guild.memberCount ? Number(guild.memberCount).toLocaleString('de-DE') : '—'}</b><small>Mitglieder</small></span>
            <span><b>${activeGuildData?.channels?.length || 0}</b><small>Kanäle</small></span>
          </div>
        </header>

        <div class="o6-overview-layout">
          <section class="o6-island o6-constellation">
            <div class="o6-island-head">
              <div><span>Orbit Navigator</span><b>Dein Server-System</b></div>
              <small>Hover zeigt die Verbindung · Klick öffnet das Modul</small>
            </div>
            <div class="o6-orbit-map">
              ${orbitLinks()}
              ${orbitBeacons()}
              <i class="o6-orbit-ring ring-a"></i>
              <i class="o6-orbit-ring ring-b"></i>
              <i class="o6-orbit-ring ring-c"></i>
              <div class="o6-core-halo" aria-hidden="true"></div>
              <div class="o6-core">
                <span class="o6-core-status"></span>
                ${guildIcon(guild, 'o6-core-icon')}
                <div class="o6-core-copy">
                  <b>${escapeHtml(guild.name || 'Server')}</b>
                  <small>${activeCount} von 8 Modulen aktiv</small>
                </div>
                <div class="o6-core-signal" aria-hidden="true"><i></i><i></i><i></i></div>
              </div>
              ${constellationNode('welcome', 'Willkommen', 'welcome', 'a', 'outer')}
              ${constellationNode('roles', 'Rollen', 'roles', 'b', 'outer')}
              ${constellationNode('tickets', 'Tickets', 'tickets', 'c', 'inner')}
              ${constellationNode('commands', 'Commands', 'commands', 'd', 'inner')}
              ${constellationNode('creators', 'Creator Alerts', 'creators', 'e', 'outer')}
              ${constellationNode('voice', 'Voice', 'voice', 'f', 'outer')}
              ${constellationNode('autorole', 'Auto-Roles', 'autorole', 'g', 'outer')}
              ${constellationNode('logging', 'Logs', 'logging', 'h', 'outer')}
            </div>
          </section>

          <section class="o6-island o6-activity">
            <div class="o6-island-head"><div><span>Live</span><b>Aktivität</b></div><i class="o6-live-dot"></i></div>
            <div class="o6-event-list">${activityMarkup()}</div>
          </section>

          <section class="o6-island o6-health">
            <div class="o6-island-head"><div><span>Health</span><b>Aufmerksamkeit</b></div><small>${issues().length ? `${issues().length} offen` : 'Alles okay'}</small></div>
            <div class="o6-health-list">${issuesMarkup()}</div>
          </section>

          <section class="o6-island o6-launchpad">
            <div class="o6-island-head"><div><span>Shortcuts</span><b>Schnellzugriff</b></div><small>Häufige Aufgaben ohne Umweg</small></div>
            <div class="o6-launch-grid">
              <button type="button" data-o6-open="tickets">${moduleIcon('tickets')}<div><b>Ticket bauen</b><small>Workflow öffnen</small></div></button>
              <button type="button" data-o6-open="roles">${moduleIcon('roles')}<div><b>Rollen ändern</b><small>Panels bearbeiten</small></div></button>
              <button type="button" data-o6-open="creators">${moduleIcon('creators')}<div><b>Alert anlegen</b><small>Creator verbinden</small></div></button>
              <button type="button" data-o6-open="diagnostics">${moduleIcon('diagnostics')}<div><b>Bot testen</b><small>Discord prüfen</small></div></button>
            </div>
          </section>
        </div>
      </div>`;

    root.querySelectorAll('[data-o6-open]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.o6Open)));
    wireOrbitFocus(root);
  }

  const previousWorkspaceRenderer = renderGuildWorkspace;
  renderGuildWorkspace = function renderGuildWorkspaceOrbit(tab) {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.className = 'deck-workspace o6-canvas';
    root.dataset.page = tab;

    if (tab === 'overview') {
      renderOverview();
      return;
    }

    previousWorkspaceRenderer(tab);
    root.classList.add('o6-module-canvas');
    requestAnimationFrame(() => {
      const head = root.querySelector('.workspace-head,.role-studio-toolbar,.ticket-head,.creator-head,.voice-head,.analytics-head,.flow-studio-toolbar');
      if (head) head.classList.add('o6-native-toolbar');
    });
  };

  function userName() {
    return document.querySelector('#userArea .user-chip b')?.textContent?.trim() || 'Account';
  }

  renderGuildShell = function renderGuildShellOrbit() {
    document.body.classList.add('o6-dashboard-mode');
    const { guild } = activeGuildData;
    const openDiscord = `https://discord.com/channels/${guild.id}`;
    const [title, description] = META[activeTab] || META.overview;

    document.querySelector('#guildDashboardContent').innerHTML = `
      <div class="o6-stage">
        <div class="o6-aurora o6-aurora-a" aria-hidden="true"></div>
        <div class="o6-aurora o6-aurora-b" aria-hidden="true"></div>

        <header class="o6-floating-head">
          <a class="o6-server-capsule" href="/" title="Server wechseln">
            ${guildIcon(guild, 'o6-server-icon')}
            <div><small>Server</small><b>${escapeHtml(guild.name)}</b></div>
            <span>⌄</span>
          </a>

          <div class="o6-page-capsule">
            <b id="o6PageTitle">${escapeHtml(title)}</b>
            <span id="o6PageDescription">${escapeHtml(description)}</span>
          </div>

          <div class="o6-action-capsule">
            <span class="o6-online"><i></i>Online</span>
            <a href="${openDiscord}" target="_blank" rel="noopener" title="Discord öffnen">${icon('external')}</a>
            <button type="button" data-jump="diagnostics" title="Diagnose">${moduleIcon('diagnostics')}</button>
            <button id="saveSettings" class="o6-save" type="button" disabled>${icon('save')}<span>Gespeichert</span></button>
            <button type="button" class="o6-account" data-o6-logout title="Abmelden">${escapeHtml(userName().slice(0,1).toUpperCase())}</button>
            <span id="unsavedFlag" class="unsaved-flag">Ungespeichert</span>
          </div>
        </header>

        <nav class="deck-nav o6-dock o6-command-rail" aria-label="Module">
          ${dockMarkup()}
        </nav>

        <main id="guildWorkspace" class="deck-workspace o6-canvas"></main>
      </div>`;

    document.querySelector('.o6-command-rail').addEventListener('click', event => {
      const button = event.target.closest('[data-tab]');
      if (!button) return;
      switchTab(button.dataset.tab);
    });
    document.querySelector('[data-jump="diagnostics"]').addEventListener('click', () => switchTab('diagnostics'));
    document.querySelector('#saveSettings').addEventListener('click', saveSettings);
    document.querySelector('[data-o6-logout]').addEventListener('click', logout);
    renderGuildWorkspace(activeTab);
  };

  const originalSwitchTab = switchTab;
  switchTab = function switchTabOrbit(tab) {
    originalSwitchTab(tab);
    const [title, description] = META[tab] || META.overview;
    const titleNode = document.querySelector('#o6PageTitle');
    const descriptionNode = document.querySelector('#o6PageDescription');
    if (titleNode) titleNode.textContent = title;
    if (descriptionNode) descriptionNode.textContent = description;
  };

  if (typeof activeGuildData !== 'undefined' && activeGuildData && !document.querySelector('#guildDashboard')?.classList.contains('hidden')) {
    renderGuildShell();
  }
})();