(() => {
  const MODULES = [
    ['overview', 'Übersicht', 'grid'],
    ['welcome', 'Willkommen', 'message'],
    ['autorole', 'Auto-Roles', 'shield'],
    ['roles', 'Rollen', 'shield'],
    ['tickets', 'Tickets', 'message'],
    ['voice', 'Voice', 'pulse'],
    ['commands', 'Commands', 'terminal'],
    ['creators', 'Creator Alerts', 'wave'],
    ['logging', 'Logs', 'wave'],
    ['analytics', 'Analytics', 'grid'],
    ['diagnostics', 'Diagnose', 'pulse']
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
      <span class="o6-dock-icon">${icon(iconName)}</span>
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

  function constellationNode(tab, label, iconName, position) {
    const state = moduleState(tab);
    return `<button type="button" class="o6-node o6-node-${position}${state ? ' on' : ''}" data-o6-open="${tab}">
      <span>${icon(iconName)}</span>
      <div><b>${escapeHtml(label)}</b><small>${escapeHtml(moduleMeta(tab) || (state ? 'Aktiv' : 'Bereit'))}</small></div>
    </button>`;
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
            <p>Direkt zu den Dingen, die gerade wichtig sind.</p>
          </div>
          <div class="o6-metric-row">
            <span><b>${activeCount}</b><small>aktiv</small></span>
            <span><b>${guild.memberCount ? Number(guild.memberCount).toLocaleString('de-DE') : '—'}</b><small>Mitglieder</small></span>
            <span><b>${activeGuildData?.channels?.length || 0}</b><small>Kanäle</small></span>
          </div>
        </header>

        <div class="o6-overview-layout">
          <section class="o6-island o6-constellation">
            <div class="o6-island-head"><div><span>Module</span><b>Dein Setup</b></div><small>Klicke einen Bereich an</small></div>
            <div class="o6-orbit-map">
              <i class="o6-orbit-ring ring-a"></i>
              <i class="o6-orbit-ring ring-b"></i>
              <div class="o6-core">
                ${guildIcon(guild, 'o6-core-icon')}
                <span></span>
                <b>${escapeHtml(guild.name || 'Server')}</b>
                <small>${activeCount} Module aktiv</small>
              </div>
              ${constellationNode('welcome', 'Willkommen', 'message', 'a')}
              ${constellationNode('roles', 'Rollen', 'shield', 'b')}
              ${constellationNode('tickets', 'Tickets', 'message', 'c')}
              ${constellationNode('commands', 'Commands', 'terminal', 'd')}
              ${constellationNode('creators', 'Creator', 'wave', 'e')}
              ${constellationNode('voice', 'Voice', 'pulse', 'f')}
            </div>
          </section>

          <section class="o6-island o6-activity">
            <div class="o6-island-head"><div><span>Live</span><b>Aktivität</b></div><i class="o6-live-dot"></i></div>
            <div class="o6-event-list">${activityMarkup()}</div>
          </section>

          <section class="o6-island o6-health">
            <div class="o6-island-head"><div><span>Check</span><b>Aufmerksamkeit</b></div><small>${issues().length ? `${issues().length} offen` : 'Alles okay'}</small></div>
            <div class="o6-health-list">${issuesMarkup()}</div>
          </section>

          <section class="o6-island o6-launchpad">
            <div class="o6-island-head"><div><span>Schnellzugriff</span><b>Loslegen</b></div></div>
            <div class="o6-launch-grid">
              <button type="button" data-o6-open="tickets"><span>${icon('message')}</span><div><b>Ticket bauen</b><small>Workflow öffnen</small></div></button>
              <button type="button" data-o6-open="roles"><span>${icon('shield')}</span><div><b>Rollen ändern</b><small>Panels bearbeiten</small></div></button>
              <button type="button" data-o6-open="creators"><span>${icon('wave')}</span><div><b>Alert anlegen</b><small>Creator verbinden</small></div></button>
              <button type="button" data-o6-open="diagnostics"><span>${icon('pulse')}</span><div><b>Bot testen</b><small>Discord prüfen</small></div></button>
            </div>
          </section>
        </div>
      </div>`;

    root.querySelectorAll('[data-o6-open]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.o6Open)));
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
            <button type="button" data-jump="diagnostics" title="Diagnose">${icon('pulse')}</button>
            <button id="saveSettings" class="o6-save" type="button" disabled>${icon('save')}<span>Gespeichert</span></button>
            <button type="button" class="o6-account" data-o6-logout title="Abmelden">${escapeHtml(userName().slice(0,1).toUpperCase())}</button>
            <span id="unsavedFlag" class="unsaved-flag">Ungespeichert</span>
          </div>
        </header>

        <main id="guildWorkspace" class="deck-workspace o6-canvas"></main>

        <nav class="deck-nav o6-dock" aria-label="Bereiche">
          ${dockMarkup()}
        </nav>
      </div>`;

    document.querySelector('.o6-dock').addEventListener('click', event => {
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