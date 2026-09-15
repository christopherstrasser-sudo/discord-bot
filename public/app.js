const $ = selector => document.querySelector(selector);

let currentFilter = 'all';
let currentGuilds = [];
let activeGuildData = null;
let workingSettings = null;
let savedSettings = null;
let activeTab = 'overview';
let dirty = false;

const ICONS = {
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
  wave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-5 4 10 2-5h5"/></svg>',
  userPlus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21v-2a6 6 0 0 1 6-6c1.6 0 3 .6 4.1 1.5M18 8v6m-3-3h6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10 4.2-1.6 7-5.6 7-10V6z"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 4 4-4 4m6 0h8"/></svg>',
  pulse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9M18 13v6H5V6h6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  message: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5zM8 4v5h8V4M8 16h8"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>'
};

function icon(name) {
  return `<span class="icon">${ICONS[name] || ICONS.grid}</span>`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function guildIcon(guild, className = 'server-icon') {
  const url = guild.iconUrl || (guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : null);
  if (url) return `<img class="${className}" src="${escapeHtml(url)}" alt="">`;
  return `<div class="${className} server-icon-fallback">${escapeHtml(guild.name.slice(0, 2).toUpperCase())}</div>`;
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
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function toast(message, type = 'ok') {
  const host = $('#toastHost');
  if (!host) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<span>${type === 'error' ? '!' : '✓'}</span><div><strong>${type === 'error' ? 'Fehler' : 'Erledigt'}</strong><small>${escapeHtml(message)}</small></div>`;
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 180);
  }, 3000);
}

async function refreshGlobalStatus() {
  try {
    const health = await api('/health');
    const online = Boolean(health.botReady);
    $('#globalStatus').className = `global-status ${online ? 'online' : 'warning'}`;
    $('#globalStatus').innerHTML = `<span class="status-pulse"></span><span>${online ? `Bot online · ${health.guilds} Server` : 'Dashboard online · Bot offline'}</span>`;
  } catch {
    $('#globalStatus').className = 'global-status warning';
    $('#globalStatus').innerHTML = '<span class="status-pulse"></span><span>Status unbekannt</span>';
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.href = '/';
}

function renderUser(user) {
  $('#userArea').innerHTML = `
    <div class="user-chip">
      ${userAvatar(user)}
      <span><b>${escapeHtml(user.username)}</b><small>@${escapeHtml(user.discordUsername)}</small></span>
      <button id="logoutButton" class="topbar-button" type="button">Abmelden</button>
    </div>`;
  $('#logoutButton').addEventListener('click', logout);
}

function updateServerStats(guilds) {
  const connected = guilds.filter(g => g.botInstalled).length;
  const owned = guilds.filter(g => g.owner).length;
  $('#serverStats').innerHTML = `
    <div><b>${guilds.length}</b><span>Server</span></div>
    <div><b>${connected}</b><span>verbunden</span></div>
    <div><b>${owned}</b><span>Owner</span></div>`;
}

function serverCard(guild) {
  const connected = guild.botInstalled;
  const access = guild.owner ? 'OWNER' : 'MANAGER';
  const openDiscord = `https://discord.com/channels/${guild.id}`;

  return `
    <article class="server-card ${connected ? 'connected' : 'disconnected'}" data-name="${escapeHtml(guild.name.toLowerCase())}" data-installed="${connected}">
      <div class="server-card-topline"><span>${access}</span><b>${connected ? 'CONNECTED' : 'NOT CONNECTED'}</b></div>
      <div class="server-card-main">
        <div class="server-icon-wrap">
          ${guildIcon(guild)}
          <span class="server-live-dot"></span>
        </div>
        <div class="server-card-copy">
          <h3>${escapeHtml(guild.name)}</h3>
          <p>${connected ? 'Bot verbunden · Module bereit' : 'Bot noch nicht installiert'}</p>
        </div>
      </div>

      <div class="server-card-meter">
        <span>CONTROL LINK</span>
        <div><i style="width:${connected ? '100' : '14'}%"></i></div>
        <b>${connected ? '100%' : 'OFFLINE'}</b>
      </div>

      <div class="server-card-actions">
        ${connected ? `
          <a class="card-action primary" href="${guild.manageUrl}">${icon('grid')}<span>Dashboard</span></a>
          <a class="card-action" href="${guild.manageUrl}?tab=welcome">${icon('message')}<span>Module</span></a>
          <a class="card-action" href="${guild.manageUrl}?tab=diagnostics">${icon('pulse')}<span>Test</span></a>
        ` : `
          <a class="card-action primary wide" href="${escapeHtml(guild.inviteUrl)}">${icon('userPlus')}<span>Bot hinzufügen</span></a>
        `}
        <a class="card-action icon-only" href="${openDiscord}" target="_blank" rel="noopener" title="Discord öffnen">${icon('external')}</a>
      </div>
    </article>`;
}

function applyGuildFilter() {
  const term = ($('#guildSearch')?.value || '').trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll('.server-card').forEach(card => {
    const installed = card.dataset.installed === 'true';
    const matchesTerm = !term || card.dataset.name.includes(term);
    const matchesFilter = currentFilter === 'all' ||
      (currentFilter === 'installed' && installed) ||
      (currentFilter === 'missing' && !installed);
    const show = matchesTerm && matchesFilter;
    card.classList.toggle('hidden', !show);
    if (show) visible += 1;
  });
  $('#emptyState')?.classList.toggle('hidden', visible > 0);
}

async function renderServerList() {
  $('#serverList').classList.remove('hidden');
  const { guilds } = await api('/api/guilds');
  currentGuilds = [...guilds].sort((a, b) => Number(b.botInstalled) - Number(a.botInstalled) || a.name.localeCompare(b.name, 'de'));
  updateServerStats(currentGuilds);
  $('#guildGrid').innerHTML = currentGuilds.map(serverCard).join('');
  $('#guildSearch').addEventListener('input', applyGuildFilter);
  $('#guildFilters').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    currentFilter = button.dataset.filter;
    $('#guildFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    applyGuildFilter();
  });
}

function activeModuleCount(settings) {
  return ['welcome', 'autorole', 'logging', 'customCommands'].filter(key => settings[key]?.enabled).length;
}

function getInitialTab() {
  const requested = new URLSearchParams(location.search).get('tab');
  return ['overview', 'welcome', 'autorole', 'logging', 'commands', 'diagnostics'].includes(requested) ? requested : 'overview';
}

function channelOptions(channels, selectedId = '') {
  return '<option value="">Kanal auswählen</option>' + channels.map(channel => {
    const label = channel.parent ? `${channel.parent} / #${channel.name}` : `#${channel.name}`;
    return `<option value="${channel.id}" ${channel.id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function roleOptions(roles, selectedId = '') {
  return '<option value="">Rolle auswählen</option>' + roles.map(role =>
    `<option value="${role.id}" ${role.id === selectedId ? 'selected' : ''}>@${escapeHtml(role.name)}</option>`
  ).join('');
}

function moduleState(key) {
  return workingSettings?.[key]?.enabled ? '<span class="state-dot on"></span><span>Aktiv</span>' : '<span class="state-dot"></span><span>Aus</span>';
}

function markDirty() {
  dirty = JSON.stringify(workingSettings) !== JSON.stringify(savedSettings);
  const save = $('#saveSettings');
  if (save) {
    save.disabled = !dirty;
    save.classList.toggle('dirty', dirty);
    save.querySelector('span').textContent = dirty ? 'Änderungen speichern' : 'Gespeichert';
  }
  $('#unsavedFlag')?.classList.toggle('visible', dirty);
}

function renderNavItem(tab, label, iconName, stateKey = null) {
  const active = activeTab === tab ? ' active' : '';
  const state = stateKey ? `<small>${moduleState(stateKey)}</small>` : '';
  return `<button class="deck-nav-item${active}" data-tab="${tab}" type="button">${icon(iconName)}<span>${label}</span>${state}</button>`;
}

function renderGuildShell() {
  const { guild, channels, roles, capabilities = {} } = activeGuildData;
  const openDiscord = `https://discord.com/channels/${guild.id}`;
  const activeModules = activeModuleCount(workingSettings);

  $('#guildDashboardContent').innerHTML = `
    <div class="guild-commandbar">
      <a class="icon-square" href="/" title="Zur Serverübersicht">${icon('back')}</a>
      ${guildIcon(guild, 'command-server-icon')}
      <div class="command-title">
        <span>SERVER CONTROL</span>
        <h1>${escapeHtml(guild.name)}</h1>
      </div>
      <div class="command-status"><span class="live-dot"></span><b>BOT ONLINE</b></div>
      <div class="command-meta"><span>${guild.memberCount?.toLocaleString('de-DE') || '—'} Mitglieder</span><span>${activeModules}/4 Module aktiv</span></div>
      <div class="command-actions">
        <a class="button button-ghost" href="${openDiscord}" target="_blank" rel="noopener">${icon('external')}<span>Discord</span></a>
        <button class="button button-ghost" data-jump="diagnostics" type="button">${icon('pulse')}<span>Test</span></button>
        <button id="saveSettings" class="button button-primary" type="button" disabled>${icon('save')}<span>Gespeichert</span></button>
      </div>
      <span id="unsavedFlag" class="unsaved-flag">UNSAVED</span>
    </div>

    <div class="guild-deck">
      <aside class="deck-nav">
        <div class="deck-nav-label">SERVER</div>
        ${renderNavItem('overview', 'Übersicht', 'grid')}
        <div class="deck-nav-label">AUTOMATION</div>
        ${renderNavItem('welcome', 'Willkommen', 'message', 'welcome')}
        ${renderNavItem('autorole', 'Auto-Role', 'shield', 'autorole')}
        ${renderNavItem('logging', 'Server-Logs', 'wave', 'logging')}
        ${renderNavItem('commands', 'Commands', 'terminal', 'customCommands')}
        <div class="deck-nav-label">TOOLS</div>
        ${renderNavItem('diagnostics', 'Diagnose', 'pulse')}
        <div class="deck-telemetry">
          <span>WRITE CHANNELS <b>${channels.length}</b></span>
          <span>MANAGEABLE ROLES <b>${roles.length}</b></span>
          <span>ROLE PERMISSION <b>${capabilities.canManageRoles === false ? 'NO' : 'YES'}</b></span>
        </div>
      </aside>
      <section id="guildWorkspace" class="deck-workspace"></section>
    </div>`;

  $('.deck-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    switchTab(button.dataset.tab);
  });
  $('[data-jump="diagnostics"]').addEventListener('click', () => switchTab('diagnostics'));
  $('#saveSettings').addEventListener('click', saveSettings);
  renderGuildWorkspace(activeTab);
}

function switchTab(tab) {
  activeTab = tab;
  const url = new URL(location.href);
  if (tab === 'overview') url.searchParams.delete('tab');
  else url.searchParams.set('tab', tab);
  history.replaceState({}, '', url);
  document.querySelectorAll('.deck-nav-item').forEach(item => item.classList.toggle('active', item.dataset.tab === tab));
  renderGuildWorkspace(tab);
}

function workspaceHeader(kicker, title, text, action = '') {
  return `<div class="workspace-head"><div><span>${kicker}</span><h2>${title}</h2><p>${text}</p></div>${action}</div>`;
}

function overviewWorkspace() {
  const settings = workingSettings;
  const modules = [
    ['welcome', 'Willkommen', 'Automatische Begrüßung neuer Mitglieder', 'message'],
    ['autorole', 'Auto-Role', 'Rolle direkt beim Serverbeitritt vergeben', 'shield'],
    ['logging', 'Server-Logs', 'Serverereignisse zentral protokollieren', 'wave'],
    ['customCommands', 'Custom Commands', 'Eigene Befehle und Antworten', 'terminal']
  ];

  return `
    ${workspaceHeader('OVERVIEW', 'Server bereit.', 'Hier siehst du sofort, was aktiv ist und wo Handlungsbedarf besteht.')}
    <div class="overview-grid">
      <div class="overview-main">
        <div class="module-list">
          ${modules.map(([key, label, description, iconName]) => `
            <div class="module-row">
              <div class="module-row-icon">${icon(iconName)}</div>
              <div><b>${label}</b><span>${description}</span></div>
              <div class="module-row-state ${settings[key].enabled ? 'on' : ''}">${settings[key].enabled ? 'AKTIV' : 'AUS'}</div>
              <button class="mini-button" data-open-tab="${key === 'customCommands' ? 'commands' : key}" type="button">Konfigurieren ${icon('arrow')}</button>
            </div>`).join('')}
        </div>
      </div>
      <aside class="overview-side">
        <div class="telemetry-card"><span>AKTIVE MODULE</span><b>${activeModuleCount(settings)}</b><small>von 4 konfigurierbar</small></div>
        <div class="telemetry-card"><span>WRITE CHANNELS</span><b>${activeGuildData.channels.length}</b><small>vom Bot beschreibbar</small></div>
        <div class="telemetry-card"><span>ROLES</span><b>${activeGuildData.roles.length}</b><small>vom Bot verwaltbar</small></div>
        <button class="diagnostic-cta" data-open-tab="diagnostics" type="button">${icon('pulse')}<span><b>Verbindung testen</b><small>Nachricht an Discord senden</small></span>${icon('arrow')}</button>
      </aside>
    </div>`;
}

function welcomePreview(text) {
  let html = escapeHtml(text || '');
  html = html
    .replaceAll('{user}', '<mark>@NeuesMitglied</mark>')
    .replaceAll('{username}', 'neuesmitglied')
    .replaceAll('{displayName}', 'Neues Mitglied')
    .replaceAll('{server}', escapeHtml(activeGuildData.guild.name))
    .replaceAll('{memberCount}', escapeHtml(String(activeGuildData.guild.memberCount || 128)))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll('\n', '<br>');
  return html || '<span class="muted">Deine Nachricht erscheint hier.</span>';
}

function moduleToggle(key) {
  const enabled = workingSettings[key].enabled;
  return `<label class="power-toggle"><input type="checkbox" data-module-switch="${key}" ${enabled ? 'checked' : ''}><span></span><b>${enabled ? 'Aktiv' : 'Aus'}</b></label>`;
}

function welcomeWorkspace() {
  const s = workingSettings.welcome;
  return `
    ${workspaceHeader('AUTOMATION / WELCOME', 'Willkommen', 'Begrüße neue Mitglieder sofort nach dem Join.', moduleToggle('welcome'))}
    <div class="workspace-split">
      <div class="control-panel">
        <label class="field"><span>Zielkanal</span><select id="welcomeChannel">${channelOptions(activeGuildData.channels, s.channelId)}</select><small>Nur Kanäle mit Schreibrechten werden angezeigt.</small></label>
        <label class="field"><span>Nachricht</span><textarea id="welcomeMessage" rows="7" maxlength="1800">${escapeHtml(s.message)}</textarea></label>
        <div class="variable-bar"><span>Variablen</span>${['{user}','{username}','{displayName}','{server}','{memberCount}'].map(v => `<button type="button" data-variable="${v}">${v}</button>`).join('')}</div>
      </div>
      <div class="preview-console">
        <div class="preview-console-top"><span>LIVE MESSAGE PREVIEW</span><b>#${escapeHtml(activeGuildData.channels.find(c => c.id === s.channelId)?.name || 'willkommen')}</b></div>
        <div class="discord-message"><div class="bot-avatar">R</div><div><div class="message-author"><b>RAKU Bot</b><span>APP</span><small>Heute um 08:12</small></div><p id="welcomePreview">${welcomePreview(s.message)}</p></div></div>
        <div class="preview-console-foot">Preview only · wird nicht gesendet</div>
      </div>
    </div>`;
}

function autoroleWorkspace() {
  const s = workingSettings.autorole;
  const permitted = activeGuildData.capabilities?.canManageRoles !== false;
  return `
    ${workspaceHeader('AUTOMATION / ROLES', 'Auto-Role', 'Vergibt beim Join automatisch eine definierte Rolle.', moduleToggle('autorole'))}
    <div class="control-panel narrow">
      <label class="field"><span>Zielrolle</span><select id="autoroleRole">${roleOptions(activeGuildData.roles, s.roleId)}</select><small>Nur Rollen unterhalb der Bot-Rolle werden angeboten.</small></label>
      <div class="permission-readout ${permitted ? 'good' : 'bad'}"><span>${permitted ? '✓' : '!'}</span><div><b>${permitted ? 'Rollenverwaltung bereit' : 'Berechtigung fehlt'}</b><small>${permitted ? `${activeGuildData.roles.length} Rollen können vergeben werden.` : 'Aktiviere „Rollen verwalten“ für die Bot-Rolle.'}</small></div></div>
    </div>`;
}

function loggingWorkspace() {
  const s = workingSettings.logging;
  return `
    ${workspaceHeader('OBSERVABILITY / LOGS', 'Server-Logs', 'Lege fest, wohin Server- und Moderationsereignisse geschrieben werden.', moduleToggle('logging'))}
    <div class="workspace-split">
      <div class="control-panel"><label class="field"><span>Log-Kanal</span><select id="loggingChannel">${channelOptions(activeGuildData.channels, s.channelId)}</select><small>Der Bot benötigt Schreibrechte im gewählten Kanal.</small></label></div>
      <div class="event-matrix"><span>JOIN / LEAVE</span><span>MESSAGE EDIT</span><span>MESSAGE DELETE</span><span>ROLE CHANGES</span><span>CHANNEL CHANGES</span><span>MODERATION</span></div>
    </div>`;
}

function commandsWorkspace() {
  return `
    ${workspaceHeader('AUTOMATION / COMMANDS', 'Custom Commands', 'Eigene Chat-Befehle mit frei definierbaren Antworten.', moduleToggle('customCommands'))}
    <div class="coming-panel"><div class="coming-icon">/</div><div><b>Command Editor</b><span>Der Modulstatus wird bereits serverbezogen gespeichert. Der eigentliche Editor kommt als nächstes.</span></div><button class="button button-ghost" type="button" disabled>Editor folgt</button></div>`;
}

function diagnosticsWorkspace() {
  return `
    ${workspaceHeader('TOOLS / DIAGNOSTICS', 'Bot-Diagnose', 'Teste die komplette Kette Dashboard → API → Bot → Discord.')}
    <div class="diagnostics-grid">
      <div class="control-panel">
        <label class="field"><span>Testkanal</span><select id="testMessageChannel">${channelOptions(activeGuildData.channels)}</select><small>Nur beschreibbare Kanäle stehen zur Auswahl.</small></label>
        <button id="sendTestMessage" class="button button-primary" type="button">${icon('message')}<span>Testnachricht senden</span></button>
      </div>
      <div id="diagnosticReadout" class="diagnostic-readout"><span class="diagnostic-orb"></span><div><b>Bereit</b><small>Wähle einen Kanal und starte den Test.</small></div></div>
    </div>`;
}

function renderGuildWorkspace(tab) {
  const workspace = $('#guildWorkspace');
  if (!workspace) return;
  const renderers = {
    overview: overviewWorkspace,
    welcome: welcomeWorkspace,
    autorole: autoroleWorkspace,
    logging: loggingWorkspace,
    commands: commandsWorkspace,
    diagnostics: diagnosticsWorkspace
  };
  workspace.innerHTML = (renderers[tab] || overviewWorkspace)();
  wireWorkspace(tab);
}

function wireWorkspace(tab) {
  document.querySelectorAll('[data-open-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.openTab)));
  document.querySelectorAll('[data-module-switch]').forEach(input => {
    input.addEventListener('change', () => {
      workingSettings[input.dataset.moduleSwitch].enabled = input.checked;
      markDirty();
      renderGuildShell();
    });
  });

  if (tab === 'welcome') {
    $('#welcomeChannel').addEventListener('change', event => { workingSettings.welcome.channelId = event.target.value; markDirty(); renderGuildWorkspace('welcome'); });
    $('#welcomeMessage').addEventListener('input', event => { workingSettings.welcome.message = event.target.value; $('#welcomePreview').innerHTML = welcomePreview(event.target.value); markDirty(); });
    document.querySelectorAll('[data-variable]').forEach(button => button.addEventListener('click', () => {
      const field = $('#welcomeMessage');
      const token = button.dataset.variable;
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? field.value.length;
      field.value = field.value.slice(0, start) + token + field.value.slice(end);
      workingSettings.welcome.message = field.value;
      field.focus();
      field.setSelectionRange(start + token.length, start + token.length);
      $('#welcomePreview').innerHTML = welcomePreview(field.value);
      markDirty();
    }));
  }

  if (tab === 'autorole') $('#autoroleRole').addEventListener('change', e => { workingSettings.autorole.roleId = e.target.value; markDirty(); });
  if (tab === 'logging') $('#loggingChannel').addEventListener('change', e => { workingSettings.logging.channelId = e.target.value; markDirty(); });
  if (tab === 'diagnostics') $('#sendTestMessage').addEventListener('click', sendTestMessage);
}

async function saveSettings() {
  const button = $('#saveSettings');
  button.disabled = true;
  button.querySelector('span').textContent = 'Speichert …';
  try {
    const result = await api(`/api/guilds/${activeGuildData.guild.id}/settings`, { method: 'PATCH', body: JSON.stringify(workingSettings) });
    workingSettings = clone(result.settings);
    savedSettings = clone(result.settings);
    dirty = false;
    toast('Server-Einstellungen gespeichert.');
    renderGuildShell();
  } catch (error) {
    toast(error.message, 'error');
    markDirty();
  }
}

async function sendTestMessage() {
  const channelId = $('#testMessageChannel').value;
  if (!channelId) return toast('Bitte zuerst einen Kanal auswählen.', 'error');
  const button = $('#sendTestMessage');
  const readout = $('#diagnosticReadout');
  button.disabled = true;
  button.querySelector('span').textContent = 'Wird gesendet …';
  readout.className = 'diagnostic-readout running';
  readout.innerHTML = '<span class="diagnostic-orb"></span><div><b>Signal läuft</b><small>Dashboard → Bot → Discord</small></div>';
  try {
    const result = await api(`/api/guilds/${activeGuildData.guild.id}/test-message`, { method: 'POST', body: JSON.stringify({ channelId }) });
    readout.className = 'diagnostic-readout success';
    readout.innerHTML = `<span class="diagnostic-orb"></span><div><b>Test erfolgreich</b><small>Nachricht wurde in #${escapeHtml(result.channelName)} gesendet.</small></div>`;
    toast(`Testnachricht in #${result.channelName} gesendet.`);
  } catch (error) {
    readout.className = 'diagnostic-readout error';
    readout.innerHTML = `<span class="diagnostic-orb"></span><div><b>Test fehlgeschlagen</b><small>${escapeHtml(error.message)}</small></div>`;
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Testnachricht senden';
  }
}

async function renderGuildDashboard(guildId) {
  $('#guildDashboard').classList.remove('hidden');
  activeGuildData = await api(`/api/guilds/${guildId}/dashboard`);
  if (!activeGuildData.guild.botInstalled) {
    $('#guildDashboardContent').innerHTML = '<div class="empty-state"><strong>Bot nicht installiert.</strong><span>Zur Serverübersicht zurückkehren und den Bot hinzufügen.</span></div>';
    return;
  }
  workingSettings = clone(activeGuildData.settings);
  savedSettings = clone(activeGuildData.settings);
  activeTab = getInitialTab();
  dirty = false;
  renderGuildShell();
}

async function boot() {
  refreshGlobalStatus();
  setInterval(refreshGlobalStatus, 30000);
  const session = await api('/api/session');
  if (!session.authenticated) {
    $('#loggedOut').classList.remove('hidden');
    return;
  }
  renderUser(session.user);
  const match = location.pathname.match(/^\/guild\/(\d+)\/?$/);
  if (match) await renderGuildDashboard(match[1]);
  else await renderServerList();
}

window.addEventListener('beforeunload', event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

boot().catch(error => {
  console.error(error);
  if (error.status === 401) location.href = '/';
  else toast('Dashboard konnte nicht geladen werden.', 'error');
});
