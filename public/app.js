const $ = selector => document.querySelector(selector);

let currentGuilds = [];
let currentGuildData = null;
let currentPanel = 'overview';
let currentFilter = 'all';
let pageDirty = false;

const ICONS = {
  servers: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="5" rx="1.5"/><rect x="4" y="14" width="16" height="5" rx="1.5"/><path d="M8 8h.01M8 17h.01"/></svg>',
  overview: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
  welcome: '<svg viewBox="0 0 24 24"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M8.5 13.5s1.2 2 3.5 2 3.5-2 3.5-2M9 10h.01M15 10h.01"/></svg>',
  role: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M4 19v-1a5 5 0 0 1 5-5h1M16 5l1.4 2.1 2.6.7-1.7 2 .2 2.7-2.5-1-2.5 1 .2-2.7-1.7-2 2.6-.7L16 5Z"/></svg>',
  logs: '<svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  commands: '<svg viewBox="0 0 24 24"><path d="m8 7-4 5 4 5M16 7l4 5-4 5M14 4l-4 16"/></svg>',
  test: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v5l-5 9a2.5 2.5 0 0 0 2.2 4h9.6A2.5 2.5 0 0 0 19 17l-5-9V3"/><path d="M8 15h8"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  warning: '<svg viewBox="0 0 24 24"><path d="M12 4 3 20h18L12 4Z"/><path d="M12 9v5M12 17h.01"/></svg>',
  external: '<svg viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></svg>'
};

function icon(name) {
  return `<span class="icon">${ICONS[name] || ''}</span>`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function guildAvatar(guild, size = '') {
  const url = guild.iconUrl || (guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null);
  if (url) return `<img class="guild-avatar ${size}" src="${escapeHtml(url)}" alt="">`;
  return `<div class="guild-avatar guild-avatar-fallback ${size}">${escapeHtml(guild.name.slice(0, 2).toUpperCase())}</div>`;
}

function userAvatar(user) {
  if (user.avatar) return `<img class="user-avatar" src="${escapeHtml(user.avatar)}" alt="">`;
  return `<span class="user-avatar user-avatar-fallback">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</span>`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  const json = (response.headers.get('content-type') || '').includes('application/json');
  const payload = json ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function toast(message, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `${icon(type === 'error' ? 'warning' : 'check')}<div><strong>${type === 'error' ? 'Aktion fehlgeschlagen' : 'Erledigt'}</strong><span>${escapeHtml(message)}</span></div>`;
  $('#toastHost').appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 180);
  }, 3200);
}

function setBreadcrumb(parts) {
  $('#breadcrumb').innerHTML = parts.map((part, index) => `<span class="${index === parts.length - 1 ? 'current' : ''}">${escapeHtml(part)}</span>`).join('<b>/</b>');
}

async function refreshGlobalStatus() {
  const status = $('#globalStatus');
  try {
    const health = await api('/health');
    status.classList.toggle('online', Boolean(health.botReady));
    status.classList.toggle('offline', !health.botReady);
    status.querySelector('strong').textContent = health.botReady ? 'Bot online' : 'Bot getrennt';
    status.querySelector('small').textContent = health.botReady ? `${health.guilds} Server verbunden` : 'Dashboard erreichbar';
  } catch {
    status.classList.add('offline');
    status.querySelector('strong').textContent = 'Status unbekannt';
    status.querySelector('small').textContent = 'Keine Health-Antwort';
  }
}

function renderUser(user) {
  $('#userArea').innerHTML = `
    <div class="user-menu">
      ${userAvatar(user)}
      <div class="user-meta"><strong>${escapeHtml(user.username)}</strong><span>@${escapeHtml(user.discordUsername)}</span></div>
      <button id="logoutButton" class="quiet-button" type="button">Abmelden</button>
    </div>`;
  $('#logoutButton').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    location.href = '/';
  });
}

function renderGuestSidebar() {
  $('#sidebarContext').innerHTML = '';
  $('#sidebarNav').innerHTML = `
    <div class="nav-label">Produkt</div>
    <div class="nav-item active muted">${icon('servers')}<span>Control Center</span></div>`;
}

function renderLogin() {
  renderGuestSidebar();
  setBreadcrumb(['RAKU', 'Anmelden']);
  $('#loggedOut').classList.remove('hidden');
  $('#loggedOut').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-copy">
        <span class="overline">DISCORD MANAGEMENT</span>
        <h1>Server verwalten.<br>Ohne Umwege.</h1>
        <p>Ein zentrales Control Center für Module, Automationen und Moderation. Weniger Klicks, klare Zustände, keine IDs zum Kopieren.</p>
        <a class="button primary" href="/auth/discord">Mit Discord anmelden</a>
        <span class="auth-note">OAuth · Zugriff nur auf Server, die du verwalten darfst</span>
      </div>
      <div class="auth-spec">
        <div class="spec-row"><span>Authentifizierung</span><strong>Discord OAuth2</strong></div>
        <div class="spec-row"><span>Konfiguration</span><strong>Pro Server getrennt</strong></div>
        <div class="spec-row"><span>Bot-Verbindung</span><strong class="status-text">Live</strong></div>
        <div class="spec-row"><span>Version</span><strong>0.4</strong></div>
      </div>
    </div>`;
}

function renderServerSidebar() {
  $('#sidebarContext').innerHTML = '';
  $('#sidebarNav').innerHTML = `
    <div class="nav-label">Workspace</div>
    <a class="nav-item active" href="/">${icon('servers')}<span>Server</span></a>
    <div class="nav-item muted">${icon('logs')}<span>Aktivität</span><small>später</small></div>`;
}

function serverRow(guild) {
  const access = guild.owner ? 'Owner' : 'Verwalter';
  const connected = Boolean(guild.botInstalled);
  return `
    <article class="server-row" data-name="${escapeHtml(guild.name.toLowerCase())}" data-installed="${connected}">
      <div class="server-main">
        ${guildAvatar(guild)}
        <div class="server-name"><strong>${escapeHtml(guild.name)}</strong><span>${access}</span></div>
      </div>
      <div class="server-cell status-cell">
        <span class="status-pill ${connected ? 'online' : ''}"><i></i>${connected ? 'Verbunden' : 'Nicht installiert'}</span>
      </div>
      <div class="server-cell secondary-cell"><span>${connected ? 'Bereit zur Konfiguration' : 'Installation erforderlich'}</span></div>
      <div class="server-action">
        ${connected
          ? `<a class="row-action" href="${guild.manageUrl}">Verwalten ${icon('chevron')}</a>`
          : `<a class="row-action primary-link" href="${escapeHtml(guild.inviteUrl)}">Bot hinzufügen ${icon('external')}</a>`}
      </div>
    </article>`;
}

function filterServers() {
  const query = ($('#serverSearch')?.value || '').trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll('.server-row').forEach(row => {
    const installed = row.dataset.installed === 'true';
    const matchesFilter = currentFilter === 'all' || (currentFilter === 'installed' && installed) || (currentFilter === 'missing' && !installed);
    const show = matchesFilter && (!query || row.dataset.name.includes(query));
    row.classList.toggle('hidden', !show);
    if (show) visible += 1;
  });
  $('#serverEmpty')?.classList.toggle('hidden', visible > 0);
}

async function renderServerList() {
  renderServerSidebar();
  setBreadcrumb(['Control Center', 'Server']);
  $('#serverList').classList.remove('hidden');

  const { guilds } = await api('/api/guilds');
  currentGuilds = [...guilds].sort((a, b) => Number(b.botInstalled) - Number(a.botInstalled) || a.name.localeCompare(b.name, 'de'));
  const installed = currentGuilds.filter(g => g.botInstalled).length;

  $('#serverList').innerHTML = `
    <div class="page-head">
      <div><span class="overline">WORKSPACE</span><h1>Server</h1><p>Wähle einen Server und verwalte seine Bot-Konfiguration.</p></div>
      <div class="head-stats"><div><span>Server</span><strong>${currentGuilds.length}</strong></div><div><span>Verbunden</span><strong>${installed}</strong></div></div>
    </div>

    <div class="toolbar">
      <label class="search-field">${icon('search')}<input id="serverSearch" type="search" placeholder="Server suchen" autocomplete="off"></label>
      <div class="segmented" id="serverFilters">
        <button class="active" data-filter="all">Alle</button>
        <button data-filter="installed">Verbunden</button>
        <button data-filter="missing">Ohne Bot</button>
      </div>
    </div>

    <div class="server-table">
      <div class="server-table-head"><span>Server</span><span>Status</span><span>Hinweis</span><span></span></div>
      <div id="serverRows">${currentGuilds.map(serverRow).join('')}</div>
    </div>
    <div id="serverEmpty" class="empty-state hidden"><strong>Nichts gefunden</strong><span>Ändere Suche oder Filter.</span></div>`;

  $('#serverSearch').addEventListener('input', filterServers);
  $('#serverFilters').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    currentFilter = button.dataset.filter;
    $('#serverFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    filterServers();
  });
}

function channelOptions(channels, selectedId) {
  return '<option value="">Kanal auswählen</option>' + channels.map(channel => {
    const label = channel.parent ? `${channel.parent} / #${channel.name}` : `#${channel.name}`;
    return `<option value="${channel.id}" ${channel.id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function roleOptions(roles, selectedId) {
  return '<option value="">Rolle auswählen</option>' + roles.map(role => `<option value="${role.id}" ${role.id === selectedId ? 'selected' : ''}>@${escapeHtml(role.name)}</option>`).join('');
}

function moduleEnabled(settings, name) {
  return Boolean(settings[name]?.enabled);
}

function moduleStatus(settings, name) {
  return `<span class="module-badge ${moduleEnabled(settings, name) ? 'on' : ''}">${moduleEnabled(settings, name) ? 'Aktiv' : 'Aus'}</span>`;
}

function renderGuildSidebar() {
  const { guild, settings } = currentGuildData;
  $('#sidebarContext').innerHTML = `
    <a class="server-context" href="/">
      ${guildAvatar(guild, 'small')}
      <div><strong>${escapeHtml(guild.name)}</strong><span>${guild.memberCount ? `${guild.memberCount.toLocaleString('de-DE')} Mitglieder` : 'Discord Server'}</span></div>
    </a>`;

  const items = [
    ['overview', 'overview', 'Übersicht'],
    ['welcome', 'welcome', 'Willkommen'],
    ['autorole', 'role', 'Auto-Role'],
    ['logging', 'logs', 'Server-Logs'],
    ['commands', 'commands', 'Custom Commands'],
    ['diagnostics', 'test', 'Diagnostics']
  ];

  $('#sidebarNav').innerHTML = `
    <div class="nav-label">Konfiguration</div>
    ${items.map(([panel, iconName, label]) => `
      <button class="nav-item ${currentPanel === panel ? 'active' : ''}" data-panel="${panel}" type="button">
        ${icon(iconName)}<span>${label}</span>
        ${['welcome','autorole','logging'].includes(panel) ? moduleStatus(settings, panel) : ''}
      </button>`).join('')}`;

  $('#sidebarNav').addEventListener('click', event => {
    const button = event.target.closest('[data-panel]');
    if (!button) return;
    currentPanel = button.dataset.panel;
    renderGuildSidebar();
    renderGuildPanel();
  });
}

function panelHeader(title, description, moduleName = null) {
  const settings = currentGuildData.settings;
  return `
    <div class="panel-head">
      <div><span class="overline">${moduleName ? 'MODUL' : 'SERVER'}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
      ${moduleName ? `<label class="toggle"><input type="checkbox" data-toggle="${moduleName}" ${settings[moduleName].enabled ? 'checked' : ''}><span></span><b>${settings[moduleName].enabled ? 'Aktiv' : 'Aus'}</b></label>` : ''}
    </div>`;
}

function overviewPanel() {
  const { guild, settings, channels, roles, capabilities = {} } = currentGuildData;
  const modules = [
    ['welcome', 'welcome', 'Willkommen', 'Begrüßungsnachrichten für neue Mitglieder'],
    ['autorole', 'role', 'Auto-Role', 'Rollen automatisch beim Join vergeben'],
    ['logging', 'logs', 'Server-Logs', 'Ereignisse zentral protokollieren'],
    ['commands', 'commands', 'Custom Commands', 'Eigene Chat-Befehle verwalten']
  ];

  return `
    ${panelHeader(guild.name, 'Serverstatus und Modulübersicht')}
    <div class="overview-strip">
      <div><span>Mitglieder</span><strong>${guild.memberCount?.toLocaleString('de-DE') || '–'}</strong></div>
      <div><span>Schreibbare Kanäle</span><strong>${channels.length}</strong></div>
      <div><span>Verfügbare Rollen</span><strong>${roles.length}</strong></div>
      <div><span>Rollenrecht</span><strong class="${capabilities.canManageRoles === false ? 'danger-text' : 'good-text'}">${capabilities.canManageRoles === false ? 'Fehlt' : 'OK'}</strong></div>
    </div>

    <section class="section-block">
      <div class="section-title"><div><h2>Module</h2><p>Status und Konfiguration auf einen Blick.</p></div></div>
      <div class="module-list">
        ${modules.map(([panel, iconName, title, text]) => `
          <button class="module-row" data-open-panel="${panel}" type="button">
            <span class="module-row-icon">${icon(iconName)}</span>
            <span class="module-row-copy"><strong>${title}</strong><small>${text}</small></span>
            ${panel === 'commands' ? '<span class="module-badge">Grundmodul</span>' : moduleStatus(settings, panel)}
            ${icon('chevron')}
          </button>`).join('')}
      </div>
    </section>

    <section class="section-block slim">
      <div class="section-title"><div><h2>Verbindung testen</h2><p>Sende eine Testnachricht, ohne Einstellungen zu verändern.</p></div><button class="button secondary" data-open-panel="diagnostics" type="button">Diagnostics öffnen</button></div>
    </section>`;
}

function field(label, control, help = '') {
  return `<label class="field"><span>${label}</span>${control}${help ? `<small>${help}</small>` : ''}</label>`;
}

function welcomePreview(message) {
  const { guild } = currentGuildData;
  let text = escapeHtml(message || '');
  text = text
    .replaceAll('{user}', '<span class="mention">@NeuesMitglied</span>')
    .replaceAll('{username}', 'neuesmitglied')
    .replaceAll('{displayName}', 'Neues Mitglied')
    .replaceAll('{server}', escapeHtml(guild.name))
    .replaceAll('{memberCount}', escapeHtml(String(guild.memberCount || 128)))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll('\n', '<br>');
  return text || '<span class="muted-text">Vorschau der Nachricht</span>';
}

function welcomePanel() {
  const { settings, channels } = currentGuildData;
  return `
    ${panelHeader('Willkommen', 'Neue Mitglieder automatisch begrüßen.', 'welcome')}
    <div class="editor-grid">
      <div class="editor-main">
        ${field('Zielkanal', `<select id="welcomeChannel">${channelOptions(channels, settings.welcome.channelId)}</select>`, 'Es werden nur Kanäle angezeigt, in denen der Bot schreiben kann.')}
        ${field('Nachricht', `<textarea id="welcomeMessage" rows="7" maxlength="1800">${escapeHtml(settings.welcome.message)}</textarea>`)}
        <div class="field"><span>Variablen</span><div class="variable-row">${['{user}','{username}','{displayName}','{server}','{memberCount}'].map(v => `<button type="button" class="token" data-token="${v}">${v}</button>`).join('')}</div></div>
      </div>
      <aside class="preview-card">
        <div class="preview-label">Vorschau</div>
        <div class="discord-message">
          <div class="bot-avatar">R</div>
          <div><div class="message-meta"><strong>RAKU Bot</strong><span class="app-tag">APP</span><time>Heute um 12:42</time></div><div id="welcomePreview" class="message-content">${welcomePreview(settings.welcome.message)}</div></div>
        </div>
      </aside>
    </div>`;
}

function autorolePanel() {
  const { settings, roles, capabilities = {} } = currentGuildData;
  const ok = capabilities.canManageRoles !== false;
  return `
    ${panelHeader('Auto-Role', 'Rolle direkt beim Join vergeben.', 'autorole')}
    <div class="settings-column">
      ${field('Rolle für neue Mitglieder', `<select id="autoroleRole">${roleOptions(roles, settings.autorole.roleId)}</select>`, 'Nur Rollen unterhalb der höchsten Bot-Rolle werden angeboten.')}
      <div class="notice ${ok ? 'success' : 'danger'}">${icon(ok ? 'check' : 'warning')}<div><strong>${ok ? 'Berechtigung vorhanden' : 'Berechtigung fehlt'}</strong><span>${ok ? `${roles.length} Rolle${roles.length === 1 ? '' : 'n'} kann der Bot aktuell vergeben.` : 'Die Bot-Rolle benötigt „Rollen verwalten“.'}</span></div></div>
    </div>`;
}

function loggingPanel() {
  const { settings, channels } = currentGuildData;
  return `
    ${panelHeader('Server-Logs', 'Ereignisse in einem zentralen Kanal sammeln.', 'logging')}
    <div class="settings-column">
      ${field('Log-Kanal', `<select id="loggingChannel">${channelOptions(channels, settings.logging.channelId)}</select>`, 'Der ausgewählte Kanal muss für den Bot sichtbar und beschreibbar sein.')}
      <div class="event-grid"><div><strong>Join / Leave</strong><span>Mitgliederbewegungen</span></div><div><strong>Nachrichten</strong><span>Editieren und Löschen</span></div><div><strong>Rollen</strong><span>Änderungen an Rollen</span></div><div><strong>Kanäle</strong><span>Erstellen und Löschen</span></div></div>
      <div class="notice neutral">${icon('logs')}<div><strong>Konfiguration bereit</strong><span>Die eigentliche Log-Event-Engine schließen wir als nächstes an.</span></div></div>
    </div>`;
}

function commandsPanel() {
  return `
    ${panelHeader('Custom Commands', 'Eigene Antworten und Befehle verwalten.')}
    <div class="empty-feature"><span class="feature-icon">${icon('commands')}</span><strong>Command-Editor folgt</strong><p>Der technische Unterbau ist vorbereitet. Hier entstehen als nächstes Command, Antwort, Cooldown und Rollenrechte.</p></div>`;
}

function diagnosticsPanel() {
  const { channels } = currentGuildData;
  return `
    ${panelHeader('Diagnostics', 'Bot-Verbindung und Kanalrechte sofort prüfen.')}
    <div class="settings-column">
      ${field('Testkanal', `<select id="testChannel">${channelOptions(channels, '')}</select>`, 'Die Testnachricht verändert keine gespeicherten Einstellungen.')}
      <div class="action-line"><button id="sendTest" class="button primary" type="button" ${channels.length ? '' : 'disabled'}>Testnachricht senden</button><span id="testResult" class="action-result">Noch kein Test ausgeführt.</span></div>
    </div>`;
}

function renderGuildPanel() {
  const panel = $('#guildPanel');
  if (!panel) return;
  const renderers = { overview: overviewPanel, welcome: welcomePanel, autorole: autorolePanel, logging: loggingPanel, commands: commandsPanel, diagnostics: diagnosticsPanel };
  panel.innerHTML = (renderers[currentPanel] || overviewPanel)();

  panel.querySelectorAll('[data-open-panel]').forEach(button => button.addEventListener('click', () => {
    currentPanel = button.dataset.openPanel;
    renderGuildSidebar();
    renderGuildPanel();
  }));

  panel.querySelectorAll('[data-toggle]').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const name = toggle.dataset.toggle;
      currentGuildData.settings[name].enabled = toggle.checked;
      markDirty();
      renderGuildSidebar();
      renderGuildPanel();
    });
  });

  if (currentPanel === 'welcome') wireWelcomePanel();
  if (currentPanel === 'autorole') wireAutorolePanel();
  if (currentPanel === 'logging') wireLoggingPanel();
  if (currentPanel === 'diagnostics') wireDiagnosticsPanel();
}

function wireWelcomePanel() {
  const channel = $('#welcomeChannel');
  const message = $('#welcomeMessage');
  channel?.addEventListener('change', () => {
    currentGuildData.settings.welcome.channelId = channel.value;
    markDirty();
  });
  message?.addEventListener('input', () => {
    currentGuildData.settings.welcome.message = message.value;
    $('#welcomePreview').innerHTML = welcomePreview(message.value);
    markDirty();
  });
  document.querySelectorAll('[data-token]').forEach(button => button.addEventListener('click', () => {
    const start = message.selectionStart ?? message.value.length;
    const end = message.selectionEnd ?? start;
    message.value = message.value.slice(0, start) + button.dataset.token + message.value.slice(end);
    message.focus();
    message.setSelectionRange(start + button.dataset.token.length, start + button.dataset.token.length);
    currentGuildData.settings.welcome.message = message.value;
    $('#welcomePreview').innerHTML = welcomePreview(message.value);
    markDirty();
  }));
}

function wireAutorolePanel() {
  $('#autoroleRole')?.addEventListener('change', event => {
    currentGuildData.settings.autorole.roleId = event.target.value;
    markDirty();
  });
}

function wireLoggingPanel() {
  $('#loggingChannel')?.addEventListener('change', event => {
    currentGuildData.settings.logging.channelId = event.target.value;
    markDirty();
  });
}

function wireDiagnosticsPanel() {
  $('#sendTest')?.addEventListener('click', async () => {
    const button = $('#sendTest');
    const result = $('#testResult');
    const channelId = $('#testChannel').value;
    if (!channelId) {
      toast('Bitte zuerst einen Kanal auswählen.', 'error');
      return;
    }
    button.disabled = true;
    button.textContent = 'Sende …';
    result.textContent = 'Bot prüft den Kanal …';
    try {
      const response = await api(`/api/guilds/${currentGuildData.guild.id}/test-message`, { method: 'POST', body: JSON.stringify({ channelId }) });
      result.textContent = `Erfolgreich in #${response.channelName} gesendet.`;
      result.classList.add('success');
      toast(`Testnachricht in #${response.channelName} gesendet.`);
    } catch (error) {
      result.textContent = error.message;
      result.classList.remove('success');
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Testnachricht senden';
    }
  });
}

function markDirty() {
  pageDirty = true;
  renderSaveDock();
}

function renderSaveDock() {
  const dock = $('#saveDock');
  dock.classList.toggle('hidden', !pageDirty);
  if (!pageDirty) return;
  dock.innerHTML = `<div><strong>Ungespeicherte Änderungen</strong><span>Änderungen gelten erst nach dem Speichern.</span></div><button id="discardChanges" class="button ghost" type="button">Verwerfen</button><button id="saveChanges" class="button primary" type="button">Speichern</button>`;
  $('#discardChanges').addEventListener('click', async () => {
    currentGuildData = await api(`/api/guilds/${currentGuildData.guild.id}/dashboard`);
    pageDirty = false;
    renderSaveDock();
    renderGuildSidebar();
    renderGuildPanel();
  });
  $('#saveChanges').addEventListener('click', saveGuildSettings);
}

async function saveGuildSettings() {
  const button = $('#saveChanges');
  button.disabled = true;
  button.textContent = 'Speichert …';
  try {
    const settings = currentGuildData.settings;
    const response = await api(`/api/guilds/${currentGuildData.guild.id}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        welcome: settings.welcome,
        autorole: settings.autorole,
        logging: settings.logging,
        customCommands: settings.customCommands
      })
    });
    currentGuildData.settings = response.settings;
    pageDirty = false;
    renderSaveDock();
    renderGuildSidebar();
    renderGuildPanel();
    toast('Server-Einstellungen gespeichert.');
  } catch (error) {
    toast(error.message || 'Speichern fehlgeschlagen.', 'error');
    button.disabled = false;
    button.textContent = 'Speichern';
  }
}

async function renderGuildDashboard(guildId) {
  currentGuildData = await api(`/api/guilds/${guildId}/dashboard`);
  if (!currentGuildData.guild.botInstalled) {
    location.href = '/';
    return;
  }
  currentPanel = 'overview';
  pageDirty = false;
  renderSaveDock();
  setBreadcrumb(['Server', currentGuildData.guild.name]);
  renderGuildSidebar();
  $('#guildDashboard').classList.remove('hidden');
  $('#guildDashboard').innerHTML = `<div id="guildPanel" class="guild-panel"></div>`;
  renderGuildPanel();
}

async function boot() {
  refreshGlobalStatus();
  setInterval(refreshGlobalStatus, 30000);

  const session = await api('/api/session');
  if (!session.authenticated) {
    renderLogin();
    return;
  }

  renderUser(session.user);
  const match = location.pathname.match(/^\/guild\/(\d+)\/?$/);
  if (match) await renderGuildDashboard(match[1]);
  else await renderServerList();
}

window.addEventListener('beforeunload', event => {
  if (!pageDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

boot().catch(error => {
  console.error(error);
  if (error.status === 401) {
    location.href = '/';
    return;
  }
  toast('Dashboard konnte nicht geladen werden.', 'error');
});
