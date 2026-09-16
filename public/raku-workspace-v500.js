(() => {
  const NAV = [
    ['Server', [
      ['overview', 'Übersicht', 'grid'],
    ]],
    ['Community', [
      ['welcome', 'Willkommen', 'message'],
      ['autorole', 'Auto-Roles', 'shield'],
      ['roles', 'Rollen', 'shield'],
      ['tickets', 'Tickets', 'message'],
      ['voice', 'Voice', 'pulse'],
    ]],
    ['Automation', [
      ['commands', 'Commands', 'terminal'],
      ['creators', 'Creator Alerts', 'wave'],
    ]],
    ['Server', [
      ['logging', 'Logs', 'wave'],
      ['analytics', 'Analytics', 'grid'],
      ['diagnostics', 'Diagnose', 'pulse'],
    ]],
  ];

  const TITLES = {
    overview: ['Übersicht', 'Status, Aktivität und deine wichtigsten Server-Funktionen.'],
    welcome: ['Willkommen', 'Begrüßungen und erste Schritte für neue Mitglieder.'],
    autorole: ['Auto-Roles', 'Automatische Rollen beim Beitritt.'],
    roles: ['Rollen', 'Self-Service-Rollen für deine Community.'],
    tickets: ['Tickets', 'Support-Workflows, Formulare und Transcripts.'],
    voice: ['Voice', 'Temporäre Sprachräume und Lobby-Automation.'],
    commands: ['Commands', 'Eigene Befehle und Antworten.'],
    creators: ['Creator Alerts', 'Twitch-, YouTube- und TikTok-Benachrichtigungen.'],
    logging: ['Logs', 'Server- und Moderationsereignisse.'],
    analytics: ['Analytics', 'Nutzung, Aktivität und Entwicklung.'],
    diagnostics: ['Diagnose', 'Verbindung zwischen Dashboard, Bot und Discord testen.'],
  };

  function getTicketConfig() {
    return window.RakuTicketStudio?.s?.cfg || null;
  }

  function getCreatorConfig() {
    return window.RakuCreatorHub?.s?.cfg || null;
  }

  function navState(tab) {
    if (tab === 'welcome') return Boolean(workingSettings?.welcome?.enabled);
    if (tab === 'autorole') return Boolean(workingSettings?.autorole?.enabled);
    if (tab === 'roles') return Boolean(workingSettings?.rolePanels?.enabled);
    if (tab === 'tickets') return Boolean(getTicketConfig()?.enabled);
    if (tab === 'commands') return Boolean(workingSettings?.customCommands?.enabled);
    if (tab === 'creators') return Boolean(getCreatorConfig()?.enabled);
    if (tab === 'logging') return Boolean(workingSettings?.logging?.enabled);
    if (tab === 'voice') return Boolean(workingSettings?.voiceStudio?.enabled || workingSettings?.voice?.enabled);
    if (tab === 'analytics') return true;
    if (tab === 'diagnostics') return true;
    return null;
  }

  function navItem(tab, label, iconName) {
    const state = navState(tab);
    return `<button class="deck-nav-item r5-nav-item${activeTab === tab ? ' active' : ''}" data-tab="${tab}" type="button">
      ${icon(iconName)}
      <span>${escapeHtml(label)}</span>
      ${state === null ? '' : `<i class="r5-nav-state ${state ? 'on' : ''}" aria-hidden="true"></i>`}
    </button>`;
  }

  function activeModuleTotal() {
    const states = ['welcome','autorole','roles','tickets','commands','creators','logging','voice'].map(navState);
    return states.filter(Boolean).length;
  }

  function activityRows() {
    const history = window.RakuCreatorHub?.s?.history || [];
    if (!history.length) {
      return `<div class="r5-empty-row"><span>Noch keine aktuellen Ereignisse.</span><small>Neue Creator- und Serveraktivität erscheint hier automatisch.</small></div>`;
    }
    return history.slice(0, 6).map(item => {
      const time = item.at ? new Date(item.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
      return `<div class="r5-activity-row">
        <span class="r5-activity-mark"></span>
        <div><b>${escapeHtml(item.ruleName || 'Creator Alert')}</b><small>${escapeHtml(item.message || String(item.status || 'Ereignis'))}</small></div>
        <time>${escapeHtml(time)}</time>
      </div>`;
    }).join('');
  }

  function issueRows() {
    const issues = [];
    if (activeGuildData?.capabilities?.canManageRoles === false) issues.push(['Rollen-Berechtigung fehlt', 'Der Bot kann aktuell keine Rollen verwalten.', 'roles']);
    if (workingSettings?.welcome?.enabled && !workingSettings?.welcome?.channelId) issues.push(['Willkommen ohne Kanal', 'Wähle einen Zielkanal für Begrüßungen.', 'welcome']);
    if (workingSettings?.autorole?.enabled && !workingSettings?.autorole?.roleId) issues.push(['Auto-Role ohne Rolle', 'Wähle eine Rolle für neue Mitglieder.', 'autorole']);
    if (workingSettings?.logging?.enabled && !workingSettings?.logging?.channelId) issues.push(['Logs ohne Kanal', 'Wähle einen Zielkanal für Server-Logs.', 'logging']);
    if (!issues.length) return `<div class="r5-ok-state"><span>✓</span><div><b>Keine offenen Basisprobleme</b><small>Die aktiven Kernmodule sind vollständig konfiguriert.</small></div></div>`;
    return issues.slice(0, 4).map(([title, text, tab]) => `<button class="r5-issue-row" type="button" data-open-r5="${tab}"><span>!</span><div><b>${escapeHtml(title)}</b><small>${escapeHtml(text)}</small></div><em>Öffnen</em></button>`).join('');
  }

  function moduleCards() {
    const cards = [
      ['welcome', 'Willkommen', 'Begrüßungen'],
      ['roles', 'Rollen', `${workingSettings?.rolePanels?.panels?.length || 0} Panels`],
      ['tickets', 'Tickets', `${getTicketConfig()?.panels?.length || 0} Panels`],
      ['commands', 'Commands', `${workingSettings?.customCommands?.commands?.length || 0} Befehle`],
      ['creators', 'Creator Alerts', `${(getCreatorConfig()?.rules || []).filter(r => r.enabled).length} aktiv`],
      ['voice', 'Voice', 'Räume & Lobbys'],
    ];
    return cards.map(([tab, title, meta]) => `<button class="r5-module-card" type="button" data-open-r5="${tab}">
      <span class="r5-module-dot ${navState(tab) ? 'on' : ''}"></span>
      <div><b>${escapeHtml(title)}</b><small>${escapeHtml(meta)}</small></div>
      <strong>›</strong>
    </button>`).join('');
  }

  function renderOverviewV5() {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    const guild = activeGuildData?.guild || {};
    root.innerHTML = `
      <div class="r5-page r5-overview">
        <header class="r5-page-head">
          <div>
            <h1>${escapeHtml(guild.name || 'Server')}</h1>
            <p>Übersicht über Module, Aktivität und offene Punkte.</p>
          </div>
          <div class="r5-summary">
            <span><b>${activeModuleTotal()}</b><small>Module aktiv</small></span>
            <span><b>${guild.memberCount ? Number(guild.memberCount).toLocaleString('de-DE') : '—'}</b><small>Mitglieder</small></span>
            <span><b>${activeGuildData?.channels?.length || 0}</b><small>Kanäle</small></span>
          </div>
        </header>

        <section class="r5-module-strip">${moduleCards()}</section>

        <div class="r5-overview-grid">
          <section class="r5-panel r5-activity-panel">
            <header><div><h2>Aktivität</h2><p>Letzte Ereignisse aus deinen Automationen.</p></div><span class="r5-live-pill">Live</span></header>
            <div class="r5-activity-list">${activityRows()}</div>
          </section>

          <section class="r5-panel r5-issues-panel">
            <header><div><h2>Aufmerksamkeit</h2><p>Konfigurationen, die du prüfen solltest.</p></div></header>
            <div class="r5-issue-list">${issueRows()}</div>
          </section>
        </div>

        <section class="r5-panel r5-quick-panel">
          <header><div><h2>Schnellzugriff</h2><p>Häufige Aufgaben ohne Umwege.</p></div></header>
          <div class="r5-quick-grid">
            <button type="button" data-open-r5="tickets"><b>Ticket anpassen</b><small>Panels, Kategorien und Workflows</small></button>
            <button type="button" data-open-r5="roles"><b>Rollen bearbeiten</b><small>Self-Service und Rollen-Panels</small></button>
            <button type="button" data-open-r5="creators"><b>Creator Alert</b><small>Quellen und Benachrichtigungen</small></button>
            <button type="button" data-open-r5="diagnostics"><b>Bot testen</b><small>Nachricht an Discord senden</small></button>
          </div>
        </section>
      </div>`;
    root.querySelectorAll('[data-open-r5]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.openR5)));
  }

  const previousWorkspaceRenderer = renderGuildWorkspace;
  renderGuildWorkspace = function renderGuildWorkspaceV5(tab) {
    if (tab === 'overview') {
      renderOverviewV5();
      return;
    }
    previousWorkspaceRenderer(tab);
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.dataset.page = tab;
    root.classList.add('r5-module-workspace');
    requestAnimationFrame(() => {
      const head = root.querySelector('.workspace-head,.role-studio-toolbar,.ticket-head,.creator-head,.voice-head,.analytics-head,.flow-studio-toolbar');
      if (head) head.classList.add('r5-native-head');
    });
  };

  renderGuildShell = function renderGuildShellV5() {
    const { guild } = activeGuildData;
    const openDiscord = `https://discord.com/channels/${guild.id}`;
    const [currentTitle] = TITLES[activeTab] || TITLES.overview;

    document.querySelector('#guildDashboardContent').innerHTML = `
      <div class="r5-shell">
        <aside class="deck-nav r5-sidebar">
          <div class="r5-sidebar-brand">
            <a href="/" class="r5-back" title="Zur Serverauswahl">‹</a>
            <span class="r5-raku-mark">R</span>
            <div><b>RAKU</b><small>Discord Control</small></div>
          </div>

          <div class="r5-server-card">
            ${guildIcon(guild, 'r5-server-icon')}
            <div><b>${escapeHtml(guild.name)}</b><small>${guild.memberCount ? `${Number(guild.memberCount).toLocaleString('de-DE')} Mitglieder` : 'Discord Server'}</small></div>
          </div>

          <nav class="r5-nav-scroll">
            ${NAV.map(([group, items]) => `<section class="r5-nav-group"><span>${escapeHtml(group)}</span>${items.map(item => navItem(...item)).join('')}</section>`).join('')}
          </nav>

          <div class="r5-sidebar-foot">
            <span class="r5-bot-dot"></span>
            <div><b>Bot verbunden</b><small>${activeGuildData?.channels?.length || 0} Kanäle erreichbar</small></div>
          </div>
        </aside>

        <main class="r5-main">
          <header class="guild-commandbar r5-contextbar">
            <div class="r5-context-copy"><span>${escapeHtml(guild.name)}</span><b>${escapeHtml(currentTitle)}</b></div>
            <div class="r5-context-actions">
              <span class="r5-status"><i></i> Online</span>
              <a class="r5-icon-action" href="${openDiscord}" target="_blank" rel="noopener" title="Discord öffnen">${icon('external')}</a>
              <button class="r5-icon-action" data-jump="diagnostics" type="button" title="Diagnose">${icon('pulse')}</button>
              <button id="saveSettings" class="button button-primary r5-save" type="button" disabled>${icon('save')}<span>Gespeichert</span></button>
              <span id="unsavedFlag" class="unsaved-flag">Ungespeichert</span>
            </div>
          </header>
          <section id="guildWorkspace" class="deck-workspace r5-workspace"></section>
        </main>
      </div>`;

    document.querySelector('.deck-nav').addEventListener('click', event => {
      const button = event.target.closest('[data-tab]');
      if (!button) return;
      switchTab(button.dataset.tab);
    });
    document.querySelector('[data-jump="diagnostics"]').addEventListener('click', () => switchTab('diagnostics'));
    document.querySelector('#saveSettings').addEventListener('click', saveSettings);
    renderGuildWorkspace(activeTab);
  };

  const originalSwitchTab = switchTab;
  switchTab = function switchTabV5(tab) {
    originalSwitchTab(tab);
    const [title] = TITLES[tab] || TITLES.overview;
    const current = document.querySelector('.r5-context-copy b');
    if (current) current.textContent = title;
  };

  // Replace any shell that may already have rendered while scripts were loading.
  if (typeof activeGuildData !== 'undefined' && activeGuildData && !document.querySelector('#guildDashboard')?.classList.contains('hidden')) {
    renderGuildShell();
  }
})();
