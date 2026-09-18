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
    overview: ['Übersicht', 'Serverstatus, Module und offene Punkte.'],
    welcome: ['Willkommen', 'Begrüßungen für neue Mitglieder.'],
    autorole: ['Auto-Roles', 'Automatische Rollen beim Beitritt.'],
    roles: ['Rollen', 'Self-Service-Rollen und Panels.'],
    tickets: ['Tickets', 'Support, Formulare und Workflows.'],
    voice: ['Voice', 'Temporäre Räume und Lobby-Automation.'],
    commands: ['Commands', 'Eigene Befehle und Antworten.'],
    creators: ['Creator Alerts', 'Content-Signale aus deinen Plattformen.'],
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
    diagnostics: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M5.5 12h3l1.8-4.2 3.2 8.4 2-4.2h3"/></svg>',
    profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="13" rx="4"/><path d="M9 6V4.5M15 6V4.5M8.5 12h.01M15.5 12h.01M9 16h6"/></svg>'
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
    if (tab === 'creators') return `${(creatorConfig()?.rules || []).filter(rule => rule.enabled).length} Regeln aktiv`;
    if (tab === 'voice') return moduleState(tab) ? 'Aktiv' : 'Bereit';
    if (tab === 'welcome' || tab === 'autorole' || tab === 'logging') return moduleState(tab) ? 'Aktiv' : 'Aus';
    if (tab === 'analytics' || tab === 'diagnostics') return 'Bereit';
    return '';
  }

  function railItem(tab, label, iconName) {
    const state = moduleState(tab);
    return `<button class="deck-nav-item o6-dock-item o7-rail-item${activeTab === tab ? ' active' : ''}" data-tab="${tab}" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      ${moduleIcon(iconName)}
      <span class="o6-dock-label">${escapeHtml(label)}</span>
      ${state === null ? '' : `<i class="o6-dock-state ${state ? 'on' : ''}" aria-hidden="true"></i>`}
    </button>`;
  }

  function railMarkup() {
    const groups = [
      ['Server', MODULES.slice(0, 1)],
      ['Community', MODULES.slice(1, 6)],
      ['Automation', MODULES.slice(6, 8)],
      ['System', MODULES.slice(8)]
    ];
    return groups.map(([label, group]) => `
      <span class="o7-rail-section-label">${escapeHtml(label)}</span>
      ${group.map(item => railItem(...item)).join('')}
    `).join('');
  }

  function activityMarkup() {
    const history = window.RakuCreatorHub?.s?.history || [];
    if (!history.length) {
      return `<div class="o7-empty-row"><b>Keine neuen Ereignisse</b><span>Creator- und Automationsereignisse erscheinen hier.</span></div>`;
    }
    return history.slice(0, 6).map(item => {
      const time = item.at ? new Date(item.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
      return `<button class="o7-activity-row" type="button" data-o7-open="creators">
        <time>${escapeHtml(time)}</time>
        <span class="o7-activity-dot"></span>
        <div><b>${escapeHtml(item.ruleName || 'Creator Alert')}</b><small>${escapeHtml(item.message || String(item.status || 'Ereignis'))}</small></div>
        <em>›</em>
      </button>`;
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
      return `<div class="o7-health-ok"><span>✓</span><div><b>Keine offenen Punkte</b><small>Die geprüften Einstellungen sehen sauber aus.</small></div></div>`;
    }
    return rows.slice(0, 5).map(([tab, title, copy]) => `<button type="button" class="o7-health-row" data-o7-open="${tab}">
      <span>!</span><div><b>${escapeHtml(title)}</b><small>${escapeHtml(copy)}</small></div><em>›</em>
    </button>`).join('');
  }

  function moduleRow(tab, label, iconName) {
    const state = moduleState(tab);
    const meta = moduleMeta(tab);
    const [title, description] = META[tab] || [label, ''];
    const stateText = state === null ? 'Bereit' : state ? 'Aktiv' : 'Aus';
    return `<button type="button" class="o7-module-row" data-o7-open="${tab}">
      <span class="o7-module-icon">${moduleIcon(iconName)}</span>
      <span class="o7-module-copy"><b>${escapeHtml(title)}</b><small>${escapeHtml(description)}</small></span>
      <span class="o7-module-meta">${escapeHtml(meta || '—')}</span>
      <span class="o7-module-status ${state ? 'on' : ''}">${escapeHtml(stateText)}</span>
      <span class="o7-module-arrow">›</span>
    </button>`;
  }

  function activeCount() {
    return ['welcome','autorole','roles','tickets','voice','commands','creators','logging'].filter(moduleState).length;
  }

  function renderOverview() {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    const guild = activeGuildData?.guild || {};
    const count = activeCount();
    const issueCount = issues().length;
    const channels = activeGuildData?.channels?.length || 0;
    const roles = activeGuildData?.roles?.length || 0;

    root.innerHTML = `
      <div class="o7-overview">
        <header class="o7-page-head o7-dashboard-head">
          <div class="o7-dashboard-title">
            <div class="o7-dashboard-server-mark">
              ${guildIcon(guild, 'o7-overview-server-icon')}
              <span class="o7-dashboard-live-dot" aria-hidden="true"></span>
            </div>
            <div>
              <span class="o7-section-label">Dashboard</span>
              <h1>${escapeHtml(guild.name || 'Discord')}</h1>
              <p>Serverstatus, Module und aktuelle Aufgaben.</p>
            </div>
          </div>
          <div class="o7-page-actions">
            <button type="button" class="o7-text-action" data-o7-open="diagnostics">${moduleIcon('diagnostics')} Diagnose öffnen</button>
          </div>
        </header>

        <div class="o7-stat-strip" aria-label="Serverstatus">
          <div><span>Mitglieder</span><b>${guild.memberCount ? Number(guild.memberCount).toLocaleString('de-DE') : '—'}</b></div>
          <div><span>Aktive Module</span><b>${count}<small>/ 8</small></b></div>
          <div><span>Kanäle</span><b>${channels}</b></div>
          <div><span>Verwaltbare Rollen</span><b>${roles}</b></div>
          <div class="${issueCount ? 'attention' : ''}"><span>Offene Punkte</span><b>${issueCount}</b></div>
        </div>

        <div class="o7-overview-grid">
          <section class="o7-panel o7-modules-panel">
            <header class="o7-panel-head"><div><b>Module</b><span>Konfiguration und Status</span></div><small>${count} aktiv</small></header>
            <div class="o7-module-table">
              ${MODULES.filter(([tab]) => !['overview','analytics','diagnostics'].includes(tab)).map(item => moduleRow(...item)).join('')}
              ${moduleRow('analytics', 'Analytics', 'analytics')}
              ${moduleRow('diagnostics', 'Diagnose', 'diagnostics')}
              <button type="button" class="o7-module-row" data-o7-open="profile">
                <span class="o7-module-icon">${moduleIcon('profile')}</span>
                <span class="o7-module-copy"><b>Bot-Profil</b><small>Name, Avatar und Serverprofil.</small></span>
                <span class="o7-module-meta">Serverbezogen</span>
                <span class="o7-module-status">Bereit</span>
                <span class="o7-module-arrow">›</span>
              </button>
            </div>
          </section>

          <aside class="o7-overview-side">
            <section class="o7-panel">
              <header class="o7-panel-head"><div><b>Aufmerksamkeit</b><span>Konfiguration prüfen</span></div><small>${issueCount ? `${issueCount} offen` : 'OK'}</small></header>
              <div class="o7-health-list">${issuesMarkup()}</div>
            </section>

            <section class="o7-panel">
              <header class="o7-panel-head"><div><b>Letzte Aktivität</b><span>Echte Ereignisse aus ORBIT</span></div></header>
              <div class="o7-activity-list">${activityMarkup()}</div>
            </section>

            <section class="o7-panel o7-quick-panel">
              <header class="o7-panel-head"><div><b>Schnellzugriff</b><span>Direkt zum Werkzeug</span></div></header>
              <div class="o7-quick-list">
                <button type="button" data-o7-open="tickets">${moduleIcon('tickets')}<span>Tickets</span><em>›</em></button>
                <button type="button" data-o7-open="roles">${moduleIcon('roles')}<span>Rollen</span><em>›</em></button>
                <button type="button" data-o7-open="creators">${moduleIcon('creators')}<span>Creator Alerts</span><em>›</em></button>
                <button type="button" data-o7-open="diagnostics">${moduleIcon('diagnostics')}<span>Diagnose</span><em>›</em></button>
              </div>
            </section>
          </aside>
        </div>
      </div>`;

    root.querySelectorAll('[data-o7-open]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.o7Open)));
  }

  const previousWorkspaceRenderer = renderGuildWorkspace;
  renderGuildWorkspace = function renderGuildWorkspaceOrbit(tab) {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.className = 'deck-workspace o6-canvas o7-canvas';
    root.dataset.page = tab;

    if (tab === 'overview') {
      renderOverview();
      return;
    }

    previousWorkspaceRenderer(tab);
    root.classList.add('o6-module-canvas', 'o7-module-canvas');
    requestAnimationFrame(() => {
      const head = root.querySelector('.workspace-head,.role-studio-toolbar,.ticket-head,.creator-head,.voice-head,.analytics-head,.flow-studio-toolbar');
      if (head) head.classList.add('o6-native-toolbar', 'o7-native-toolbar');
    });
  };

  function userName() {
    return document.querySelector('#userArea .user-chip b')?.textContent?.trim() || 'Account';
  }

  renderGuildShell = function renderGuildShellOrbit() {
    document.body.classList.add('o6-dashboard-mode', 'o7-desktop-mode');
    const { guild } = activeGuildData;
    const openDiscord = `https://discord.com/channels/${guild.id}`;
    const [title, description] = META[activeTab] || META.overview;

    document.querySelector('#guildDashboardContent').innerHTML = `
      <div class="o6-stage o7-app">
        <header class="o7-topbar">
          <div class="o7-topbar-left">
            <a class="o7-brand" href="/" title="Server wechseln" aria-label="Zur Serverauswahl">
              <img src="/orbit-wordmark.svg?v=0290" alt="ORBIT">
            </a>
            <span class="o7-top-divider"></span>
            <a class="o7-server-context" href="/" title="Server wechseln">
              ${guildIcon(guild, 'o7-server-icon')}
              <span><small>Server</small><b>${escapeHtml(guild.name)}</b></span>
              <em>⌄</em>
            </a>
            <span class="o7-breadcrumb">/</span>
            <div class="o7-page-context">
              <b id="o6PageTitle">${escapeHtml(title)}</b>
              <span id="o6PageDescription">${escapeHtml(description)}</span>
            </div>
          </div>

          <div class="o7-topbar-actions">
            <span class="o7-connection"><i></i><span>Online</span></span>
            <a class="o7-icon-button" href="${openDiscord}" target="_blank" rel="noopener" title="Discord öffnen">${icon('external')}</a>
            <button class="o7-icon-button" type="button" data-jump="diagnostics" title="Diagnose">${moduleIcon('diagnostics')}</button>
            <button id="saveSettings" class="o7-save-button" type="button" disabled>${icon('save')}<span>Gespeichert</span></button>
            <button type="button" class="o7-account" data-o6-logout title="Abmelden">${escapeHtml(userName().slice(0,1).toUpperCase())}</button>
            <span id="unsavedFlag" class="unsaved-flag">Ungespeichert</span>
          </div>
        </header>

        <div class="o7-shell">
          <nav class="deck-nav o6-dock o6-command-rail o7-rail" aria-label="Module">
            ${railMarkup()}
          </nav>
          <main id="guildWorkspace" class="deck-workspace o6-canvas o7-canvas"></main>
        </div>
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
    const [title, description] = META[tab] || (tab === 'profile'
      ? ['Bot-Profil', 'Name, Avatar und Serverprofil deines Bots.']
      : META.overview);
    const titleNode = document.querySelector('#o6PageTitle');
    const descriptionNode = document.querySelector('#o6PageDescription');
    if (titleNode) titleNode.textContent = title;
    if (descriptionNode) descriptionNode.textContent = description;
    document.querySelectorAll('.o6-command-rail [data-tab]').forEach(item => item.classList.toggle('active', item.dataset.tab === tab));
  };

  if (typeof activeGuildData !== 'undefined' && activeGuildData && !document.querySelector('#guildDashboard')?.classList.contains('hidden')) {
    renderGuildShell();
  }
})();