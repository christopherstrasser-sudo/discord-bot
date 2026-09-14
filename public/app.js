const $ = selector => document.querySelector(selector);

let pageDirty = false;
let currentGuilds = [];
let currentFilter = 'all';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function guildIcon(guild, large = false) {
  const sizeClass = large ? ' guild-avatar-large' : '';
  const url = guild.iconUrl || (guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
    : null);

  if (url) {
    return `<img class="guild-avatar${sizeClass}" src="${escapeHtml(url)}" alt="">`;
  }

  return `<div class="guild-avatar guild-avatar-fallback${sizeClass}">${escapeHtml(guild.name.slice(0, 2).toUpperCase())}</div>`;
}

function userAvatar(user) {
  if (!user.avatar) {
    return `<div class="user-avatar user-avatar-fallback">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</div>`;
  }
  return `<img class="user-avatar" src="${escapeHtml(user.avatar)}" alt="">`;
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
    error.payload = payload;
    throw error;
  }

  return payload;
}

function toast(message, type = 'ok') {
  const host = $('#toastHost');
  if (!host) return;

  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `
    <div class="toast-icon">${type === 'error' ? '!' : '✓'}</div>
    <div><strong>${type === 'error' ? 'Fehler' : 'Erledigt'}</strong><span>${escapeHtml(message)}</span></div>`;
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('visible'));
  setTimeout(() => {
    node.classList.remove('visible');
    setTimeout(() => node.remove(), 220);
  }, 3200);
}

async function refreshGlobalStatus() {
  const status = $('#globalStatus');
  if (!status) return;

  try {
    const health = await api('/health');
    const online = Boolean(health.botReady);
    status.classList.toggle('online', online);
    status.classList.toggle('warning', !online);
    status.innerHTML = `<i class="status-light"></i><span>${online ? `Bot online · ${health.guilds} Server` : 'Dashboard online · Bot getrennt'}</span>`;
  } catch {
    status.classList.add('warning');
    status.innerHTML = '<i class="status-light"></i><span>Status nicht verfügbar</span>';
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.href = '/';
}

function renderUser(user) {
  $('#userArea').innerHTML = `
    <div class="user-menu">
      ${userAvatar(user)}
      <div class="user-copy">
        <strong>${escapeHtml(user.username)}</strong>
        <span>@${escapeHtml(user.discordUsername)}</span>
      </div>
      <button id="logoutButton" class="icon-button text-button" type="button">Abmelden</button>
    </div>`;
  $('#logoutButton').addEventListener('click', logout);
}

function serverCard(guild) {
  const accessLabel = guild.owner ? 'Owner' : 'Verwalter';
  const installedClass = guild.botInstalled ? 'installed' : 'missing';

  return `
    <article class="guild-card ${installedClass}" data-name="${escapeHtml(guild.name.toLowerCase())}" data-installed="${guild.botInstalled}">
      <div class="guild-card-accent"></div>
      <div class="guild-card-head">
        ${guildIcon(guild)}
        <div class="guild-card-title">
          <span class="server-access">${accessLabel}</span>
          <h3>${escapeHtml(guild.name)}</h3>
        </div>
        <span class="connection-badge ${installedClass}"><i></i>${guild.botInstalled ? 'Verbunden' : 'Nicht installiert'}</span>
      </div>

      <div class="guild-card-body">
        <div class="mini-stat">
          <span>Bot</span>
          <strong>${guild.botInstalled ? 'Online' : 'Fehlt'}</strong>
        </div>
        <div class="mini-stat">
          <span>Zugriff</span>
          <strong>${accessLabel}</strong>
        </div>
      </div>

      <div class="guild-card-footer">
        <span>${guild.botInstalled ? 'Module konfigurieren und Status prüfen' : 'Bot zuerst auf diesem Server installieren'}</span>
        ${guild.botInstalled
          ? `<a class="button primary compact" href="${guild.manageUrl}">Öffnen <b>→</b></a>`
          : `<a class="button secondary compact" href="${escapeHtml(guild.inviteUrl)}">Bot hinzufügen</a>`}
      </div>
    </article>`;
}

function updateServerStats(guilds) {
  const installed = guilds.filter(guild => guild.botInstalled).length;
  const owned = guilds.filter(guild => guild.owner).length;
  $('#serverStats').innerHTML = `
    <div><span>Server</span><strong>${guilds.length}</strong></div>
    <div><span>Bot aktiv</span><strong class="positive">${installed}</strong></div>
    <div><span>Eigene Server</span><strong>${owned}</strong></div>`;
}

function applyGuildFilter() {
  const search = ($('#guildSearch')?.value || '').trim().toLowerCase();
  let visible = 0;

  document.querySelectorAll('.guild-card').forEach(card => {
    const matchesSearch = !search || card.dataset.name.includes(search);
    const installed = card.dataset.installed === 'true';
    const matchesFilter = currentFilter === 'all' ||
      (currentFilter === 'installed' && installed) ||
      (currentFilter === 'missing' && !installed);

    const show = matchesSearch && matchesFilter;
    card.classList.toggle('hidden', !show);
    if (show) visible += 1;
  });

  $('#emptyState')?.classList.toggle('hidden', visible > 0);
}

function wireServerFilters() {
  $('#guildSearch')?.addEventListener('input', applyGuildFilter);

  $('#guildFilters')?.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    currentFilter = button.dataset.filter;
    document.querySelectorAll('.filter-button').forEach(item => item.classList.toggle('active', item === button));
    applyGuildFilter();
  });
}

async function renderServerList() {
  $('#serverList').classList.remove('hidden');
  const { guilds } = await api('/api/guilds');
  currentGuilds = [...guilds].sort((a, b) => {
    if (a.botInstalled !== b.botInstalled) return a.botInstalled ? -1 : 1;
    return a.name.localeCompare(b.name, 'de');
  });

  updateServerStats(currentGuilds);
  $('#guildGrid').innerHTML = currentGuilds.map(serverCard).join('');
  wireServerFilters();
  applyGuildFilter();
}

function channelOptions(channels, selectedId) {
  const empty = '<option value="">Kanal auswählen …</option>';
  return empty + channels.map(channel => {
    const label = channel.parent ? `${channel.parent} / #${channel.name}` : `#${channel.name}`;
    return `<option value="${channel.id}" ${channel.id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function roleOptions(roles, selectedId) {
  const empty = '<option value="">Rolle auswählen …</option>';
  return empty + roles.map(role =>
    `<option value="${role.id}" ${role.id === selectedId ? 'selected' : ''}>@${escapeHtml(role.name)}</option>`
  ).join('');
}

function moduleCard({ id, glyph, title, description, enabled, body, eyebrow = 'MODUL', note = '' }) {
  return `
    <article class="module-card ${enabled ? 'is-enabled' : 'is-disabled'}" id="module-${id}">
      <div class="module-head">
        <div class="module-title-wrap">
          <div class="module-glyph">${escapeHtml(glyph)}</div>
          <div>
            <div class="module-eyebrow">${escapeHtml(eyebrow)}</div>
            <div class="module-heading-line">
              <h3>${escapeHtml(title)}</h3>
              <span class="module-state ${enabled ? 'enabled' : ''}" data-state-for="${id}">${enabled ? 'Aktiv' : 'Aus'}</span>
            </div>
            <p>${escapeHtml(description)}</p>
            ${note ? `<small class="module-note">${escapeHtml(note)}</small>` : ''}
          </div>
        </div>
        <label class="switch" aria-label="${escapeHtml(title)} aktivieren">
          <input type="checkbox" data-module-toggle="${id}" ${enabled ? 'checked' : ''}>
          <span></span>
        </label>
      </div>
      ${body ? `<div class="module-body">${body}</div>` : ''}
    </article>`;
}

function renderPreviewMessage(template, guildName, memberCount) {
  let text = escapeHtml(template || '');
  text = text
    .replaceAll('{user}', '<span class="mention">@NeuesMitglied</span>')
    .replaceAll('{username}', 'neuesmitglied')
    .replaceAll('{displayName}', 'Neues Mitglied')
    .replaceAll('{server}', escapeHtml(guildName))
    .replaceAll('{memberCount}', escapeHtml(String(memberCount || '128')))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll('\n', '<br>');
  return text || '<span class="preview-muted">Deine Nachricht erscheint hier …</span>';
}

function enabledModuleCount(settings) {
  return ['welcome', 'autorole', 'logging', 'customCommands']
    .filter(name => settings[name]?.enabled).length;
}

function renderGuildDashboardContent(data) {
  const { guild, settings, channels, roles, capabilities = {} } = data;
  const activeModules = enabledModuleCount(settings);
  const welcomeOptions = channelOptions(channels, settings.welcome.channelId);
  const logOptions = channelOptions(channels, settings.logging.channelId);
  const autoRoleOptions = roleOptions(roles, settings.autorole.roleId);

  const welcome = moduleCard({
    id: 'welcome',
    glyph: 'W',
    title: 'Willkommen',
    description: 'Begrüße neue Mitglieder automatisch und persönlich.',
    enabled: settings.welcome.enabled,
    body: `
      <div class="config-split preview-split">
        <div class="config-column">
          <label class="field">
            <span class="field-label">Zielkanal</span>
            <select id="welcomeChannel">${welcomeOptions}</select>
            <small>${channels.length ? 'Nur Kanäle mit Schreibrechten werden angeboten.' : 'Aktuell ist kein beschreibbarer Textkanal verfügbar.'}</small>
          </label>

          <label class="field">
            <span class="field-label">Nachricht</span>
            <textarea id="welcomeMessage" rows="5" maxlength="1800">${escapeHtml(settings.welcome.message)}</textarea>
          </label>

          <div class="variable-section">
            <span class="field-label">Variablen einfügen</span>
            <div class="variable-list">
              ${['{user}', '{username}', '{displayName}', '{server}', '{memberCount}'].map(variable => `<button type="button" class="variable-chip" data-variable="${variable}">${variable}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="preview-panel">
          <div class="preview-panel-head">
            <span>LIVE-VORSCHAU</span>
            <small>#${escapeHtml(channels.find(channel => channel.id === settings.welcome.channelId)?.name || 'willkommen')}</small>
          </div>
          <div class="discord-preview">
            <div class="preview-avatar">R</div>
            <div class="preview-message-wrap">
              <div class="preview-author"><strong>RAKU Bot</strong><b>APP</b><span>Heute um 15:42</span></div>
              <div id="welcomePreview" class="preview-message">${renderPreviewMessage(settings.welcome.message, guild.name, guild.memberCount)}</div>
            </div>
          </div>
        </div>
      </div>`
  });

  const autorole = moduleCard({
    id: 'autorole',
    glyph: 'R',
    title: 'Auto-Role',
    description: 'Vergibt neuen Mitgliedern beim Join automatisch eine Rolle.',
    enabled: settings.autorole.enabled,
    note: capabilities.canManageRoles === false ? 'Rollen verwalten fehlt beim Bot.' : '',
    body: `
      <div class="config-split compact-split">
        <label class="field">
          <span class="field-label">Rolle für neue Mitglieder</span>
          <select id="autoroleRole">${autoRoleOptions}</select>
          <small>${capabilities.canManageRoles === false
            ? 'Gib der Bot-Rolle zuerst „Rollen verwalten“. '
            : 'Nur Rollen unterhalb der höchsten Bot-Rolle werden angezeigt.'}</small>
        </label>
        <div class="info-panel ${capabilities.canManageRoles === false ? 'warning' : 'success'}">
          <span class="info-panel-icon">${capabilities.canManageRoles === false ? '!' : '✓'}</span>
          <div>
            <strong>${capabilities.canManageRoles === false ? 'Berechtigung fehlt' : 'Rollen-Hierarchie geprüft'}</strong>
            <span>${capabilities.canManageRoles === false ? 'Auto-Role kann erst danach ausgeführt werden.' : `${roles.length} Rolle${roles.length === 1 ? '' : 'n'} können vom Bot vergeben werden.`}</span>
          </div>
        </div>
      </div>`
  });

  const logging = moduleCard({
    id: 'logging',
    glyph: 'L',
    title: 'Server-Logs',
    description: 'Ein zentraler Kanal für Server- und Moderationsereignisse.',
    enabled: settings.logging.enabled,
    eyebrow: 'LOGGING',
    note: 'Die Event-Engine wird als nächstes angeschlossen.',
    body: `
      <div class="config-split compact-split">
        <label class="field">
          <span class="field-label">Log-Kanal</span>
          <select id="loggingChannel">${logOptions}</select>
          <small>Der Bot braucht Lese- und Schreibrechte in diesem Kanal.</small>
        </label>
        <div class="event-tags">
          <span>Join / Leave</span><span>Nachrichten</span><span>Rollen</span><span>Kanäle</span>
        </div>
      </div>`
  });

  const commands = moduleCard({
    id: 'customCommands',
    glyph: '/',
    title: 'Custom Commands',
    description: 'Eigene Befehle und Antworten für deine Community.',
    enabled: settings.customCommands.enabled,
    eyebrow: 'COMMANDS',
    note: 'Der Editor folgt direkt nach den Server-Logs.',
    body: `
      <div class="coming-panel">
        <div class="coming-glyph">/</div>
        <div><strong>Command-Engine vorbereitet</strong><span>Trigger, Antworten, Cooldowns und Rollenrechte werden hier verwaltet.</span></div>
        <span class="roadmap-badge">NÄCHSTER SCHRITT</span>
      </div>`
  });

  $('#guildDashboardContent').innerHTML = `
    <div class="guild-controlbar">
      <a class="back-link" href="/"><span>←</span> Server</a>
      <div class="save-area">
        <div class="save-copy">
          <i id="saveDot"></i>
          <span id="saveState">Alles gespeichert</span>
        </div>
        <button id="saveSettings" class="button primary compact" type="button">Änderungen speichern</button>
      </div>
    </div>

    <section id="overview" class="guild-overview">
      <div class="guild-overview-main">
        ${guildIcon(guild, true)}
        <div class="guild-overview-copy">
          <span class="section-kicker">SERVER CONTROL</span>
          <h1>${escapeHtml(guild.name)}</h1>
          <div class="guild-meta">
            <span class="positive-dot"><i></i> Bot verbunden</span>
            <span>${guild.owner ? 'Du bist Owner' : 'Du verwaltest diesen Server'}</span>
          </div>
        </div>
      </div>

      <div class="overview-stats">
        <div><span>Mitglieder</span><strong>${Number(guild.memberCount || 0).toLocaleString('de-DE')}</strong></div>
        <div><span>Aktive Module</span><strong id="activeModuleCount">${activeModules}<small>/4</small></strong></div>
        <div><span>Schreibbare Kanäle</span><strong>${channels.length}</strong></div>
        <div><span>Auto-Role</span><strong class="${capabilities.canManageRoles === false ? 'warning-text' : 'positive-text'}">${capabilities.canManageRoles === false ? 'Prüfen' : 'Bereit'}</strong></div>
      </div>
    </section>

    <div class="dashboard-layout">
      <aside class="module-sidebar">
        <div class="sidebar-server">
          ${guildIcon(guild)}
          <div><span>Konfiguration</span><strong>${escapeHtml(guild.name)}</strong></div>
        </div>
        <div class="sidebar-label">ÜBERSICHT</div>
        <a href="#overview" class="active"><span class="nav-glyph">⌂</span><span>Übersicht</span></a>
        <div class="sidebar-label">MODULE</div>
        <a href="#module-welcome"><span class="nav-glyph">W</span><span>Willkommen</span><i class="nav-state ${settings.welcome.enabled ? 'on' : ''}" data-nav-state="welcome"></i></a>
        <a href="#module-autorole"><span class="nav-glyph">R</span><span>Auto-Role</span><i class="nav-state ${settings.autorole.enabled ? 'on' : ''}" data-nav-state="autorole"></i></a>
        <a href="#module-logging"><span class="nav-glyph">L</span><span>Server-Logs</span><i class="nav-state ${settings.logging.enabled ? 'on' : ''}" data-nav-state="logging"></i></a>
        <a href="#module-customCommands"><span class="nav-glyph">/</span><span>Commands</span><i class="nav-state ${settings.customCommands.enabled ? 'on' : ''}" data-nav-state="customCommands"></i></a>
        <div class="sidebar-foot"><span>RAKU Discord Control</span><strong>v0.3</strong></div>
      </aside>

      <main class="module-content">
        <div class="module-section-head">
          <div><span class="section-kicker">MODULE</span><h2>Server konfigurieren</h2></div>
          <p>Änderungen werden erst aktiv, wenn du sie oben speicherst.</p>
        </div>
        <div class="module-stack">
          ${welcome}
          ${autorole}
          ${logging}
          ${commands}
        </div>
      </main>
    </div>`;

  const markDirty = () => {
    pageDirty = true;
    $('#saveState').textContent = 'Ungespeicherte Änderungen';
    $('#saveDot').classList.add('dirty');
  };

  function syncModuleVisual(moduleName, checked) {
    const card = $(`#module-${moduleName}`);
    card?.classList.toggle('is-enabled', checked);
    card?.classList.toggle('is-disabled', !checked);

    const state = document.querySelector(`[data-state-for="${moduleName}"]`);
    if (state) {
      state.textContent = checked ? 'Aktiv' : 'Aus';
      state.classList.toggle('enabled', checked);
    }

    document.querySelector(`[data-nav-state="${moduleName}"]`)?.classList.toggle('on', checked);
    const count = ['welcome', 'autorole', 'logging', 'customCommands']
      .filter(name => document.querySelector(`[data-module-toggle="${name}"]`)?.checked).length;
    $('#activeModuleCount').innerHTML = `${count}<small>/4</small>`;
  }

  $('#guildDashboardContent').querySelectorAll('[data-module-toggle]').forEach(toggle => {
    toggle.addEventListener('change', () => {
      syncModuleVisual(toggle.dataset.moduleToggle, toggle.checked);
      markDirty();
    });
  });

  $('#guildDashboardContent').querySelectorAll('select, textarea').forEach(element => {
    element.addEventListener('change', markDirty);
    if (element.tagName === 'TEXTAREA') element.addEventListener('input', markDirty);
  });

  const welcomeMessage = $('#welcomeMessage');
  const welcomePreview = $('#welcomePreview');
  const updatePreview = () => {
    if (welcomePreview) welcomePreview.innerHTML = renderPreviewMessage(welcomeMessage?.value, guild.name, guild.memberCount);
  };
  welcomeMessage?.addEventListener('input', updatePreview);

  document.querySelectorAll('[data-variable]').forEach(button => {
    button.addEventListener('click', () => {
      if (!welcomeMessage) return;
      const variable = button.dataset.variable;
      const start = welcomeMessage.selectionStart ?? welcomeMessage.value.length;
      const end = welcomeMessage.selectionEnd ?? welcomeMessage.value.length;
      welcomeMessage.setRangeText(variable, start, end, 'end');
      welcomeMessage.focus();
      welcomeMessage.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  document.querySelectorAll('.module-sidebar a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.module-sidebar a').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
    });
  });

  $('#saveSettings').addEventListener('click', async () => {
    const button = $('#saveSettings');
    button.disabled = true;
    button.textContent = 'Speichert …';

    try {
      const payload = {
        welcome: {
          enabled: $('[data-module-toggle="welcome"]').checked,
          channelId: $('#welcomeChannel').value,
          message: $('#welcomeMessage').value
        },
        autorole: {
          enabled: $('[data-module-toggle="autorole"]').checked,
          roleId: $('#autoroleRole').value
        },
        logging: {
          enabled: $('[data-module-toggle="logging"]').checked,
          channelId: $('#loggingChannel').value
        },
        customCommands: {
          enabled: $('[data-module-toggle="customCommands"]').checked
        }
      };

      await api(`/api/guilds/${guild.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      pageDirty = false;
      $('#saveState').textContent = 'Alles gespeichert';
      $('#saveDot').classList.remove('dirty');
      toast('Server-Einstellungen gespeichert.');
    } catch (error) {
      toast(error.message || 'Speichern fehlgeschlagen.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Änderungen speichern';
    }
  });
}

async function renderGuildDashboard(guildId) {
  $('#guildDashboard').classList.remove('hidden');
  const data = await api(`/api/guilds/${guildId}/dashboard`);

  if (!data.guild.botInstalled) {
    $('#guildDashboardContent').innerHTML = `
      <div class="guild-controlbar"><a class="back-link" href="/"><span>←</span> Server</a></div>
      <div class="empty large-empty"><strong>Bot nicht installiert</strong><span>Installiere den Bot zuerst auf diesem Server.</span></div>`;
    return;
  }

  renderGuildDashboardContent(data);
}

async function boot() {
  await refreshGlobalStatus();
  const session = await api('/api/session');

  if (!session.authenticated) {
    $('#loggedOut').classList.remove('hidden');
    return;
  }

  renderUser(session.user);

  const guildMatch = location.pathname.match(/^\/guild\/(\d+)\/?$/);
  if (guildMatch) {
    await renderGuildDashboard(guildMatch[1]);
  } else {
    await renderServerList();
  }
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
