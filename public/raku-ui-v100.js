(() => {
  const GROUPS = [
    ['ÜBERSICHT', ['overview']],
    ['COMMUNITY', ['welcome', 'autorole', 'roles', 'tickets']],
    ['AUTOMATION', ['commands', 'creators']],
    ['MODERATION', ['logging']],
    ['SYSTEM', ['diagnostics']]
  ];

  const META = {
    overview: ['Übersicht', 'Server Pulse'],
    welcome: ['Willkommen', 'Neue Mitglieder'],
    autorole: ['Auto-Roles', 'Join Rollen'],
    roles: ['Role Studio', 'Self-Service'],
    tickets: ['Ticket Studio', 'Support'],
    commands: ['Commands', 'Automationen'],
    creators: ['Creator Hub', 'Social Alerts'],
    logging: ['Server-Logs', 'Moderation'],
    diagnostics: ['Diagnose', 'System']
  };

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeSettings() {
    return typeof workingSettings !== 'undefined' && workingSettings ? workingSettings : {};
  }

  function ticketState() {
    return window.RakuTicketStudio?.s || null;
  }

  function creatorState() {
    return window.RakuCreatorHub?.s || null;
  }

  function rolePanels() {
    return safeSettings().rolePanels?.panels || [];
  }

  function stateFor(tab) {
    const settings = safeSettings();
    if (tab === 'welcome') return settings.welcome?.enabled ? ['on', 'Aktiv'] : ['', 'Aus'];
    if (tab === 'autorole') return settings.autorole?.enabled ? ['on', 'Aktiv'] : ['', 'Aus'];
    if (tab === 'logging') return settings.logging?.enabled ? ['on', 'Aktiv'] : ['', 'Aus'];
    if (tab === 'commands') {
      const enabled = Boolean(settings.customCommands?.enabled);
      const count = Array.isArray(settings.customCommands?.commands) ? settings.customCommands.commands.length : null;
      return [enabled ? 'on' : '', count !== null ? `${count} Befehle` : (enabled ? 'Aktiv' : 'Aus')];
    }
    if (tab === 'roles') {
      const enabled = Boolean(settings.rolePanels?.enabled);
      return [enabled ? 'on' : '', `${rolePanels().length} Panels`];
    }
    if (tab === 'tickets') {
      const cfg = ticketState()?.cfg;
      if (!cfg) return ['', 'Support'];
      return [cfg.enabled ? 'on' : '', `${cfg.panels?.length || 0} Panels`];
    }
    if (tab === 'creators') {
      const cfg = creatorState()?.cfg;
      if (!cfg) return ['', 'Social'];
      const count = (cfg.rules || []).filter(rule => rule.enabled).length;
      return [cfg.enabled ? 'on' : '', `${count} aktiv`];
    }
    if (tab === 'diagnostics') return ['on', 'System'];
    return ['', ''];
  }

  function updateNavItem(button, tab) {
    const [label, hint] = META[tab] || [button.textContent.trim(), ''];
    const labelNode = button.querySelector(':scope > span:not(.icon)');
    if (labelNode) labelNode.textContent = label;
    else button.insertAdjacentHTML('beforeend', `<span>${esc(label)}</span>`);

    if (tab === 'overview') {
      button.querySelector('small')?.remove();
      return;
    }

    const [cls, status] = stateFor(tab);
    let small = button.querySelector('small');
    if (!small) {
      small = document.createElement('small');
      button.appendChild(small);
    }
    small.innerHTML = `<span class="raku-nav-node ${cls}"></span><span>${esc(status || hint)}</span>`;
  }

  function rebuildNavigation() {
    const nav = document.querySelector('.deck-nav');
    if (!nav) return;
    const buttons = new Map([...nav.querySelectorAll('.deck-nav-item[data-tab]')].map(button => [button.dataset.tab, button]));
    const telemetry = nav.querySelector('.deck-telemetry');

    nav.querySelectorAll('.deck-nav-label,.raku-nav-group,.raku-nav-core').forEach(node => node.remove());

    for (const [groupName, tabs] of GROUPS) {
      const available = tabs.filter(tab => buttons.has(tab));
      if (!available.length) continue;
      const group = document.createElement('section');
      group.className = 'raku-nav-group';
      group.innerHTML = `<div class="deck-nav-label">${groupName}</div>`;
      for (const tab of available) {
        const button = buttons.get(tab);
        updateNavItem(button, tab);
        group.appendChild(button);
      }
      nav.insertBefore(group, telemetry || null);
    }

    if (telemetry) nav.appendChild(telemetry);
    const core = document.createElement('div');
    core.className = 'raku-nav-core';
    core.innerHTML = `<span class="raku-core-node"><i></i></span><div><b>RAKU CONTROL NODE</b><small>Interface synchronisiert</small></div>`;
    nav.appendChild(core);
  }

  function simplifyCommandbar() {
    const bar = document.querySelector('.guild-commandbar');
    if (!bar) return;
    bar.classList.add('raku-commandbar-v1');
    const title = bar.querySelector('.command-title > span');
    if (title) title.textContent = 'CONTROL NODE';
    bar.querySelector('[data-jump="diagnostics"]')?.classList.add('raku-hide-command-action');
  }

  function moduleRows() {
    const settings = safeSettings();
    const ticket = ticketState()?.cfg;
    const creators = creatorState()?.cfg;
    return [
      { tab: 'welcome', group: 'COMMUNITY', title: 'Willkommen', copy: 'Begrüßung und erster Kontakt für neue Mitglieder.', on: Boolean(settings.welcome?.enabled), stat: settings.welcome?.channelId ? 'Kanal gesetzt' : 'Nicht konfiguriert' },
      { tab: 'autorole', group: 'COMMUNITY', title: 'Auto-Roles', copy: 'Automatische Rollen direkt beim Serverbeitritt.', on: Boolean(settings.autorole?.enabled), stat: settings.autorole?.roleId ? 'Rolle gesetzt' : 'Nicht konfiguriert' },
      { tab: 'roles', group: 'COMMUNITY', title: 'Role Studio', copy: 'Self-Service Rollen als Buttons, Dropdowns oder Reactions.', on: Boolean(settings.rolePanels?.enabled), stat: `${rolePanels().length} Panels` },
      { tab: 'tickets', group: 'COMMUNITY', title: 'Ticket Studio', copy: 'Support, Formulare, Claims und Transcripts als Workflow.', on: Boolean(ticket?.enabled), stat: ticket ? `${ticket.panels?.length || 0} Panels` : 'Bereit' },
      { tab: 'commands', group: 'AUTOMATION', title: 'Commands', copy: 'Eigene Chat-Befehle und automatisierte Antworten.', on: Boolean(settings.customCommands?.enabled), stat: 'Flow Builder' },
      { tab: 'creators', group: 'AUTOMATION', title: 'Creator Hub', copy: 'Twitch, YouTube und TikTok überwachen und verteilen.', on: Boolean(creators?.enabled), stat: creators ? `${(creators.rules || []).filter(r => r.enabled).length} aktiv` : 'Bereit' },
      { tab: 'logging', group: 'MODERATION', title: 'Server-Logs', copy: 'Relevante Server- und Moderationsereignisse nachvollziehen.', on: Boolean(settings.logging?.enabled), stat: settings.logging?.channelId ? 'Kanal gesetzt' : 'Nicht konfiguriert' }
    ];
  }

  function attentionItems() {
    const settings = safeSettings();
    const items = [];
    if (activeGuildData?.capabilities?.canManageRoles === false) items.push(['Rollenverwaltung fehlt', 'Der Bot kann aktuell keine Rollen sicher verwalten.', 'roles']);
    if (settings.welcome?.enabled && !settings.welcome?.channelId) items.push(['Willkommen ohne Zielkanal', 'Das Modul ist aktiv, kann aber nichts senden.', 'welcome']);
    if (settings.autorole?.enabled && !settings.autorole?.roleId) items.push(['Auto-Role ohne Rolle', 'Wähle eine Rolle oder deaktiviere das Modul.', 'autorole']);
    if (settings.logging?.enabled && !settings.logging?.channelId) items.push(['Logs ohne Zielkanal', 'Server-Logs benötigen einen beschreibbaren Kanal.', 'logging']);

    const creators = creatorState()?.cfg;
    if (creators?.enabled) {
      const broken = (creators.rules || []).filter(rule => rule.enabled && (!rule.source || !rule.channelId)).length;
      if (broken) items.push([`${broken} Creator-Regel${broken === 1 ? '' : 'n'} unvollständig`, 'Mindestens Quelle oder Zielkanal fehlt.', 'creators']);
    }
    return items.slice(0, 4);
  }

  function activityItems() {
    const history = creatorState()?.history || [];
    return history.slice(0, 4).map(item => ({
      title: item.ruleName || 'Creator Hub',
      text: item.message || String(item.status || 'Event'),
      time: item.at ? new Date(item.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—',
      status: item.status || 'event'
    }));
  }

  function pulseMarkup() {
    const settings = safeSettings();
    const modules = moduleRows();
    const active = typeof activeModuleCount === 'function' ? activeModuleCount(settings) : modules.filter(x => x.on).length;
    const members = activeGuildData?.guild?.memberCount;
    const attentions = attentionItems();
    const activity = activityItems();

    return `
      <div class="raku-overview-v1">
        <section class="raku-pulse-hero">
          <div class="raku-hero-copy">
            <span class="raku-kicker">SERVER PULSE / LIVE CONTROL</span>
            <h2>${esc(activeGuildData?.guild?.name || 'Server')} ist bereit.</h2>
            <p>Ein Blick auf Zustand, Automationen und Stellen, die deine Aufmerksamkeit brauchen.</p>
            <div class="raku-signal-line"><i></i><i></i><i></i><span>CONTROL NODE ONLINE</span></div>
          </div>
          <div class="raku-pulse-stats">
            <article><span>AKTIVE MODULE</span><b>${active}</b><small>Systeme eingeschaltet</small></article>
            <article><span>MITGLIEDER</span><b>${members ? Number(members).toLocaleString('de-DE') : '—'}</b><small>Discord Server</small></article>
            <article><span>WRITE CHANNELS</span><b>${activeGuildData?.channels?.length || 0}</b><small>vom Bot erreichbar</small></article>
            <article><span>MANAGEABLE ROLES</span><b>${activeGuildData?.roles?.length || 0}</b><small>unter Bot-Hierarchie</small></article>
          </div>
        </section>

        <div class="raku-pulse-grid">
          <section class="raku-live-card">
            <header><div><span>LIVE ACTIVITY</span><b>Was gerade passiert</b></div><i class="raku-live-beacon"></i></header>
            <div class="raku-activity-list">
              ${activity.length ? activity.map(item => `<div class="raku-activity-row"><span class="raku-activity-dot ${esc(item.status)}"></span><div><b>${esc(item.title)}</b><small>${esc(item.text)}</small></div><time>${esc(item.time)}</time></div>`).join('') : `<div class="raku-pulse-empty"><b>Noch keine Live-Aktivität im Speicher.</b><span>Creator Events und weitere Runtime-Signale erscheinen hier, sobald sie eintreffen.</span></div>`}
            </div>
          </section>

          <section class="raku-attention-card ${attentions.length ? 'warn' : 'clear'}">
            <header><div><span>NEEDS ATTENTION</span><b>${attentions.length ? `${attentions.length} Punkt${attentions.length === 1 ? '' : 'e'} prüfen` : 'Alles sauber'}</b></div><i></i></header>
            <div>
              ${attentions.length ? attentions.map(([title, text, tab]) => `<button type="button" data-raku-open="${tab}"><span>!</span><div><b>${esc(title)}</b><small>${esc(text)}</small></div><em>Öffnen →</em></button>`).join('') : `<div class="raku-attention-clear"><span>✓</span><div><b>Keine offensichtlichen Konfigurationsprobleme.</b><small>Aktive Basismodule haben ihre benötigten Ziele gesetzt.</small></div></div>`}
            </div>
          </section>
        </div>

        <section class="raku-module-deck">
          <header><div><span>CONTROL MODULES</span><b>Dein Server-System</b></div><small>Konfiguration nach Aufgabe statt nach Technik.</small></header>
          <div class="raku-module-grid">
            ${modules.map(module => `<button type="button" class="raku-module-card ${module.on ? 'on' : ''}" data-raku-open="${module.tab}"><div class="raku-card-top"><span>${module.group}</span><i class="raku-control-node"><u></u></i></div><b>${module.title}</b><p>${module.copy}</p><footer><span>${module.on ? 'AKTIV' : 'BEREIT'}</span><em>${esc(module.stat)}</em><strong>→</strong></footer></button>`).join('')}
          </div>
        </section>
      </div>`;
  }

  function renderPulseOverview() {
    const root = document.querySelector('#guildWorkspace');
    if (!root || typeof activeTab === 'undefined' || activeTab !== 'overview') return;
    root.innerHTML = pulseMarkup();
    root.querySelectorAll('[data-raku-open]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.rakuOpen)));
  }

  function collapseCreatorAdvanced() {
    document.querySelectorAll('.creator-block').forEach(block => {
      const label = block.querySelector('header span')?.textContent?.trim();
      if (!['SMART FILTERS', 'QUIET HOURS'].includes(label)) return;
      const header = block.querySelector('header');
      if (!header || header.querySelector('[data-raku-collapse]')) return;
      block.classList.add('raku-collapsible', 'collapsed');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.dataset.rakuCollapse = '1';
      toggle.className = 'raku-collapse-toggle';
      toggle.textContent = 'Erweitert anzeigen';
      header.appendChild(toggle);
      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const collapsed = block.classList.toggle('collapsed');
        toggle.textContent = collapsed ? 'Erweitert anzeigen' : 'Weniger anzeigen';
      });
    });
  }

  function decorateWorkspace(tab) {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.dataset.rakuTab = tab || '';
    root.classList.add('raku-workspace-v1');
    if (tab === 'overview') {
      renderPulseOverview();
      return;
    }
    requestAnimationFrame(() => {
      root.querySelector('.workspace-head,.role-studio-toolbar,.ticket-head,.creator-head')?.classList.add('raku-module-hero');
      if (tab === 'creators') collapseCreatorAdvanced();
    });
  }

  function installHooks() {
    if (typeof renderGuildShell === 'function') {
      const previous = renderGuildShell;
      renderGuildShell = function renderGuildShellRakuV1() {
        previous();
        rebuildNavigation();
        simplifyCommandbar();
        decorateWorkspace(typeof activeTab !== 'undefined' ? activeTab : 'overview');
      };
    }

    if (typeof renderGuildWorkspace === 'function') {
      const previous = renderGuildWorkspace;
      renderGuildWorkspace = function renderGuildWorkspaceRakuV1(tab) {
        previous(tab);
        decorateWorkspace(tab);
      };
    }
  }

  installHooks();
})();
