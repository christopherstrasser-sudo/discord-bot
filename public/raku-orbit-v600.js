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
    diagnostics: ['Diagnose', 'Dashboard, Bot und Discord testen.'],
    profile: ['Bot-Profil', 'Name, Avatar und Serverprofil deines Bots.']
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
    if (tab === 'tickets') return ticketConfig() ? Boolean(ticketConfig().enabled) : null;
    if (tab === 'voice') return window.RakuVoiceStudio?.s?.cfg ? Boolean(window.RakuVoiceStudio.s.cfg.enabled) : null;
    if (tab === 'commands') return Boolean(workingSettings?.customCommands?.enabled);
    if (tab === 'creators') return creatorConfig() ? Boolean(creatorConfig().enabled) : null;
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
    if (tab === 'welcome' || tab === 'autorole' || tab === 'logging') return 'Konfigurieren';
    if (tab === 'analytics' || tab === 'diagnostics') return 'Bereit';
    return '';
  }

  function railItem(tab, label, iconName) {
    const state = moduleState(tab);
    return `<button class="deck-nav-item o6-dock-item o7-rail-item${activeTab === tab ? ' active' : ''}" data-tab="${tab}" type="button" ${activeTab === tab ? 'aria-current="page"' : ''} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
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
      ['System', [...MODULES.slice(8), ['profile', 'Bot-Profil', 'profile']]]
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
    const meta = state === null ? '' : moduleMeta(tab);
    const [title, description] = META[tab] || [label, ''];
    const stateText = state === null ? 'Status offen' : state ? 'Aktiv' : 'Inaktiv';
    return `<button type="button" class="o7-module-row" data-o7-open="${tab}" data-orbit-module="${tab}">
      <span class="o7-module-icon">${moduleIcon(iconName)}</span>
      <span class="o7-module-copy"><b>${escapeHtml(title)}</b><small>${escapeHtml(description)}</small></span>
      <span class="o7-module-meta">${escapeHtml(meta || '—')}</span>
      <span class="o7-module-status ${state ? 'on' : ''}">${escapeHtml(stateText)}</span>
      <span class="o7-module-arrow">↗</span>
    </button>`;
  }

  function activeCount() {
    return ['welcome','autorole','roles','tickets','voice','commands','creators','logging'].filter(moduleState).length;
  }

  let overviewLoad = null;
  let overviewLoadedGuild = '';
  function loadOverviewState() {
    const guildId = activeGuildData?.guild?.id;
    if (!guildId || overviewLoad || overviewLoadedGuild === guildId) return;
    overviewLoad = Promise.allSettled([
      window.RakuTicketStudio?.load?.(),
      window.RakuCreatorHub?.load?.(),
      api(`/api/guilds/${guildId}/voice-studio`).then(result => {
        if (activeGuildData?.guild?.id !== guildId || !window.RakuVoiceStudio?.s) return;
        if (!window.RakuVoiceStudio.s.dirty) window.RakuVoiceStudio.s.cfg = result.config;
        window.RakuVoiceStudio.s.meta = result.meta;
      })
    ]).then(() => {
      overviewLoadedGuild = guildId;
      if (activeGuildData?.guild?.id !== guildId) return;
      if (activeTab === 'overview') renderOverview();
      document.querySelectorAll('.o7-rail [data-tab]').forEach(item => {
        const dot = item.querySelector('.o6-dock-state');
        if (dot) dot.classList.toggle('on', Boolean(moduleState(item.dataset.tab)));
      });
    }).finally(() => { overviewLoad = null; });
  }

  function orbitMap(guild) {
    const modules = MODULES.slice(1, 9);
    return `<div class="orbit-map" aria-label="Dein Server und seine Module">
      <div class="orbit-map-ring orbit-map-outer" aria-hidden="true"></div><div class="orbit-map-ring orbit-map-inner" aria-hidden="true"></div>
      <div class="orbit-map-axis axis-x" aria-hidden="true"></div><div class="orbit-map-axis axis-y" aria-hidden="true"></div>
      <div class="orbit-map-core">${guildIcon(guild, 'orbit-core-icon')}<b>${escapeHtml(guild.name)}</b><small>DEINE COMMUNITY</small></div>
      ${modules.map(([tab, label, iconName], index) => {
        const angle = index * Math.PI / 4 - Math.PI / 2;
        return `<button type="button" class="orbit-map-node ${moduleState(tab) ? 'on' : ''}" style="--x:${(50 + Math.cos(angle) * 40).toFixed(2)}%;--y:${(50 + Math.sin(angle) * 40).toFixed(2)}%" data-o7-open="${tab}" aria-label="${escapeHtml(label)} öffnen" title="${escapeHtml(label)}">${moduleIcon(iconName)}<span>${escapeHtml(label)}</span></button>`;
      }).join('')}
      <span class="orbit-map-caption">EIN SERVER. ALLES VERBUNDEN.</span>
    </div>`;
  }

  function renderOverview() {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    const guild = activeGuildData?.guild || {};
    const count = activeCount();
    const issueCount = issues().length;
    const modules = MODULES.slice(1, 9);
    const unknown = modules.some(([tab]) => moduleState(tab) === null);
    const members = Number.isFinite(Number(guild.memberCount)) ? Number(guild.memberCount).toLocaleString('de-DE') : '—';
    root.innerHTML = `<div class="o7-overview">
      <div class="orbit-page-heading"><div><span class="orbit-eyebrow">DEIN CONTROL CENTER</span><h2>Übersicht</h2></div><span class="orbit-page-note">${escapeHtml(guild.name)} <i></i> Serververwaltung</span></div>
      <section class="orbit-overview-hero">
        <div class="orbit-hero-copy"><span class="orbit-eyebrow"><i></i> COMMUNITY, UNTER DEINER KONTROLLE</span><h1>Alles in<br><em>deinem Orbit.</em></h1><p>Ein guter Server braucht mehr als einen Bot.<br>Hier bringst du deine Community zusammen.</p>
          <div class="orbit-hero-actions"><button type="button" class="button button-primary" data-o7-open="creators">Creator Alerts ${icon('arrow')}</button><button type="button" class="button button-ghost" data-o7-open="analytics">Analytics ansehen ${icon('external')}</button></div>
          <div class="orbit-hero-caption"><span></span> Deine Community. Deine Regeln.</div>
        </div>${orbitMap(guild)}
      </section>
      <div class="orbit-metrics" aria-label="Serverübersicht">
        <div>${moduleIcon('autorole')}<span><small>Mitglieder</small><b>${members}</b></span><em>Community</em></div>
        <div>${moduleIcon('welcome')}<span><small>Beschreibbare Kanäle</small><b>${activeGuildData?.channels?.length || 0}</b></span><em>Kommunikation</em></div>
        <div>${moduleIcon('roles')}<span><small>Verwaltbare Rollen</small><b>${activeGuildData?.roles?.length || 0}</b></span><em>Organisation</em></div>
        <div>${moduleIcon('overview')}<span><small>Aktive Module</small><b>${count}<small> / 8</small></b></span><em>${unknown ? 'Status teils offen' : 'Dein Setup'}</em></div>
      </div>
      <div class="o7-overview-grid">
        <section class="o7-modules-panel"><header class="orbit-section-head"><div><span class="orbit-eyebrow">DEIN TOOLKIT</span><h2>Raum für deine Ideen.</h2></div><span>08 Module</span></header><div class="o7-module-table">${modules.map(item => moduleRow(...item)).join('')}</div></section>
        <aside class="o7-overview-side">
          <section class="o7-panel"><header class="o7-panel-head"><div><span class="orbit-eyebrow">SYSTEMCHECK</span><b>Alles auf Kurs?</b></div><span class="orbit-status-pill ${issueCount ? 'warning' : ''}">${issueCount ? `${issueCount} offen` : 'Geprüft'}</span></header><div class="o7-health-list">${issuesMarkup()}</div><button class="orbit-panel-link" data-o7-open="diagnostics" type="button">Diagnose öffnen ${icon('arrow')}</button></section>
          <section class="o7-panel"><header class="o7-panel-head"><div><span class="orbit-eyebrow">AUS DEINEM ORBIT</span><b>Letzte Signale</b></div>${moduleIcon('logging')}</header><div class="o7-activity-list">${activityMarkup()}</div><button class="orbit-panel-link" data-o7-open="creators" type="button">Creator Alerts öffnen ${icon('arrow')}</button></section>
          <button class="orbit-profile-promo" type="button" data-o7-open="profile"><span class="orbit-profile-mark">${moduleIcon('profile')}</span><span><b>Dein Bot. Deine Identität.</b><small>Gib ORBIT deinen eigenen Look.</small></span>${icon('arrow')}</button>
        </aside>
      </div>
      <footer class="orbit-workspace-footer"><span>ORBIT</span><span>Deine Community. Im Mittelpunkt.</span><button type="button" data-o7-open="diagnostics">Verbindung testen ↗</button></footer>
    </div>`;
    root.querySelectorAll('[data-o7-open]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.o7Open)));
    loadOverviewState();
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
          <a class="o7-brand" href="/" aria-label="ORBIT – Zur Serverauswahl"><img src="/orbit-wordmark.svg?v=0290" alt="ORBIT"><span>CONTROL CENTER</span></a>
          <button type="button" class="orbit-menu-button" aria-label="Navigation öffnen" aria-expanded="false" aria-controls="orbit-navigation"><span></span><span></span><span></span></button>
          <div class="o7-topbar-left"><span class="orbit-topbar-server">${escapeHtml(guild.name)}</span><span class="o7-breadcrumb">/</span><div class="o7-page-context"><b id="o6PageTitle">${escapeHtml(title)}</b><span id="o6PageDescription">${escapeHtml(description)}</span></div></div>
          <div class="o7-topbar-actions">
            <button type="button" class="orbit-search-button" data-orbit-search aria-label="Modul suchen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><span>Modul suchen</span><kbd>⌘ K</kbd></button>
            <a class="o7-icon-button" href="${openDiscord}" target="_blank" rel="noopener" title="Discord öffnen" aria-label="Discord öffnen">${icon('external')}</a>
            <button id="saveSettings" class="o7-save-button" type="button" disabled>${icon('check')}<span>Gespeichert</span></button>
            <button type="button" class="o7-account" data-o6-logout title="Abmelden" aria-label="Abmelden">${escapeHtml(userName().slice(0,1).toUpperCase())}</button>
            <span id="unsavedFlag" class="unsaved-flag">Ungespeichert</span>
          </div>
        </header>
        <div class="o7-shell">
          <nav id="orbit-navigation" class="deck-nav o6-dock o6-command-rail o7-rail" aria-label="Module">
            <a class="orbit-rail-server" href="/" title="Server wechseln">${guildIcon(guild, 'o7-server-icon')}<span><small>DEIN WORKSPACE</small><b>${escapeHtml(guild.name)}</b></span><em>⌄</em></a>
            ${railMarkup()}
            <div class="orbit-rail-footer"><span class="orbit-rail-symbol" aria-hidden="true">◎</span><span>Deine Community.<br><b>Im Mittelpunkt.</b></span><a href="/" aria-label="Server wechseln" title="Server wechseln">↗</a></div>
          </nav>
          <button type="button" class="orbit-menu-backdrop" aria-label="Navigation schließen" tabindex="-1"></button>
          <main id="guildWorkspace" class="deck-workspace o6-canvas o7-canvas" tabindex="-1"></main>
        </div>
        <dialog class="orbit-command-dialog" aria-label="Modul suchen"><form method="dialog"><label for="orbit-module-search">Wohin möchtest du?</label><button value="close" aria-label="Suche schließen">Esc</button></form><input id="orbit-module-search" type="search" placeholder="Modul suchen …" autocomplete="off"><div class="orbit-command-results"></div><footer>↑ ↓ Auswählen <span>↵ Öffnen</span></footer></dialog>
      </div>`;

    const menu = document.querySelector('.orbit-menu-button');
    const closeMenu = () => { document.body.classList.remove('orbit-nav-open'); menu.setAttribute('aria-expanded', 'false'); };
    menu.addEventListener('click', () => {
      const open = document.body.classList.toggle('orbit-nav-open');
      menu.setAttribute('aria-expanded', String(open));
      if (open) document.querySelector('.o7-rail [aria-current="page"]')?.focus();
    });
    document.querySelector('.orbit-menu-backdrop').addEventListener('click', closeMenu);
    document.querySelector('.o6-command-rail').addEventListener('keydown', event => {
      if (event.key === 'Escape') { closeMenu(); menu.focus(); }
    });
    document.querySelector('.o6-command-rail').addEventListener('click', event => { if (event.target.closest('[data-tab]')) closeMenu(); });
    const dialog = document.querySelector('.orbit-command-dialog');
    const search = dialog.querySelector('input');
    const renderResults = () => {
      const term = search.value.trim().toLocaleLowerCase('de');
      const items = [...MODULES, ['profile', 'Bot-Profil', 'profile']].filter(([tab, label]) => `${label} ${META[tab]?.[1] || ''}`.toLocaleLowerCase('de').includes(term));
      dialog.querySelector('.orbit-command-results').innerHTML = items.length ? items.map(([tab,label,ico]) => `<button type="button" data-orbit-go="${tab}">${moduleIcon(ico)}<span><b>${escapeHtml(label)}</b><small>${escapeHtml(META[tab]?.[1] || '')}</small></span><em>↗</em></button>`).join('') : '<p role="status">Kein Modul gefunden.</p>';
    };
    document.querySelector('[data-orbit-search]').addEventListener('click', () => { search.value = ''; renderResults(); dialog.showModal(); search.focus(); });
    search.addEventListener('input', renderResults);
    dialog.addEventListener('click', event => { const button = event.target.closest('[data-orbit-go]'); if (button) { dialog.close(); switchTab(button.dataset.orbitGo); } });
    dialog.addEventListener('keydown', event => {
      const items = [...dialog.querySelectorAll('[data-orbit-go]')];
      const index = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = index === -1 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next]?.focus(); }
      if (event.key === 'Enter' && document.activeElement === search) { event.preventDefault(); items[0]?.click(); }
    });
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelector('.orbit-search-button kbd').textContent = 'Ctrl K';
    document.querySelector('.o6-command-rail').addEventListener('click', event => {
      const button = event.target.closest('[data-tab]');
      if (!button) return;
      switchTab(button.dataset.tab);
    });
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
    document.querySelectorAll('.o6-command-rail [data-tab]').forEach(item => { item.classList.toggle('active', item.dataset.tab === tab); if (item.dataset.tab === tab) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
    document.body.classList.remove('orbit-nav-open');
    document.querySelector('.orbit-menu-button')?.setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      const button = document.querySelector('[data-orbit-search]');
      if (button) { event.preventDefault(); if (!document.querySelector('.orbit-command-dialog')?.open) button.click(); }
    }
  });

  if (typeof activeGuildData !== 'undefined' && activeGuildData && !document.querySelector('#guildDashboard')?.classList.contains('hidden')) {
    renderGuildShell();
  }
})();