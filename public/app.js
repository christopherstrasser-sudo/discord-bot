const $ = selector => document.querySelector(selector);

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function guildIcon(guild, large = false) {
  const className = large ? 'guild-icon guild-icon-large' : 'guild-icon';
  if (guild.iconUrl) return `<img class="${className}" src="${escapeHtml(guild.iconUrl)}" alt="">`;
  if (guild.icon) return `<img class="${className}" src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128" alt="">`;
  return `<div class="guild-fallback ${large ? 'guild-icon-large' : ''}">${escapeHtml(guild.name.slice(0, 2).toUpperCase())}</div>`;
}

function userAvatar(user) {
  if (!user.avatar) return `<div class="user-fallback">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</div>`;
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
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  $('#toastHost').appendChild(node);
  requestAnimationFrame(() => node.classList.add('visible'));
  setTimeout(() => {
    node.classList.remove('visible');
    setTimeout(() => node.remove(), 220);
  }, 3000);
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.href = '/';
}

function renderUser(user) {
  $('#userArea').innerHTML = `
    <div class="user-menu">
      ${userAvatar(user)}
      <div><strong>${escapeHtml(user.username)}</strong><span>@${escapeHtml(user.discordUsername)}</span></div>
      <button id="logoutButton" class="ghost-button">Abmelden</button>
    </div>`;
  $('#logoutButton').addEventListener('click', logout);
}

function serverCard(guild) {
  return `
    <article class="guild-card">
      <div class="guild-card-main">
        ${guildIcon(guild)}
        <div class="guild-info">
          <h3>${escapeHtml(guild.name)}</h3>
          <span class="status ${guild.botInstalled ? 'installed' : ''}">
            ${guild.botInstalled ? '● Bot installiert' : '○ Bot nicht installiert'}
          </span>
        </div>
      </div>
      ${guild.botInstalled
        ? `<a class="button secondary" href="${guild.manageUrl}">Konfigurieren</a>`
        : `<a class="button primary small" href="${escapeHtml(guild.inviteUrl)}">Bot hinzufügen</a>`}
    </article>`;
}

async function renderServerList() {
  $('#serverList').classList.remove('hidden');
  const { guilds } = await api('/api/guilds');
  const grid = $('#guildGrid');

  if (!guilds.length) {
    $('#emptyState').classList.remove('hidden');
    return;
  }

  grid.innerHTML = guilds.map(serverCard).join('');
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

function moduleCard({ id, icon, title, description, enabled, body, state = 'Bereit' }) {
  return `
    <article class="module-card" id="module-${id}">
      <div class="module-head">
        <div class="module-title-wrap">
          <div class="module-icon">${icon}</div>
          <div>
            <div class="module-kicker">${escapeHtml(state)}</div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(description)}</p>
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

function renderGuildDashboardContent(data) {
  const { guild, settings, channels, roles, capabilities = {} } = data;
  const welcomeOptions = channelOptions(channels, settings.welcome.channelId);
  const logOptions = channelOptions(channels, settings.logging.channelId);
  const autoRoleOptions = roleOptions(roles, settings.autorole.roleId);

  const welcome = moduleCard({
    id: 'welcome',
    icon: '👋',
    title: 'Willkommen',
    description: 'Begrüße neue Mitglieder automatisch in einem gewünschten Kanal.',
    enabled: settings.welcome.enabled,
    body: `
      <div class="form-grid two">
        <label class="field">
          <span>Kanal</span>
          <select id="welcomeChannel">${welcomeOptions}</select>
          <small>${channels.length ? 'Es werden nur Kanäle angezeigt, in denen der Bot schreiben kann.' : 'Der Bot hat aktuell keinen beschreibbaren Textkanal.'}</small>
        </label>
        <div class="field hint-field">
          <span>Variablen</span>
          <div class="variable-list"><code>{user}</code><code>{username}</code><code>{displayName}</code><code>{server}</code><code>{memberCount}</code></div>
        </div>
      </div>
      <label class="field">
        <span>Nachricht</span>
        <textarea id="welcomeMessage" rows="4" maxlength="1800">${escapeHtml(settings.welcome.message)}</textarea>
      </label>`
  });

  const autorole = moduleCard({
    id: 'autorole',
    icon: '🎭',
    title: 'Auto-Role',
    description: 'Vergibt neuen Mitgliedern automatisch eine Rolle.',
    enabled: settings.autorole.enabled,
    body: `
      <label class="field">
        <span>Rolle für neue Mitglieder</span>
        <select id="autoroleRole">${autoRoleOptions}</select>
        <small>${capabilities.canManageRoles === false
          ? 'Dem Bot fehlt aktuell die Berechtigung „Rollen verwalten“. '
          : 'Es werden nur Rollen angezeigt, die unter der Bot-Rolle liegen und vom Bot vergeben werden können.'}</small>
      </label>`
  });

  const logging = moduleCard({
    id: 'logging',
    icon: '📜',
    title: 'Server-Logs',
    description: 'Zentraler Kanal für Moderations- und Serverereignisse.',
    enabled: settings.logging.enabled,
    body: `
      <label class="field">
        <span>Log-Kanal</span>
        <select id="loggingChannel">${logOptions}</select>
      </label>`
  });

  const commands = moduleCard({
    id: 'customCommands',
    icon: '⚡',
    title: 'Custom Commands',
    description: 'Eigene Befehle und Antworten für deine Community.',
    enabled: settings.customCommands.enabled,
    state: 'Grundmodul',
    body: `
      <div class="module-placeholder">
        <strong>Command-Editor kommt als Nächstes.</strong>
        <span>Der Modulstatus wird bereits serverbezogen gespeichert.</span>
      </div>`
  });

  $('#guildDashboardContent').innerHTML = `
    <a class="back-link" href="/">← Alle Server</a>

    <div class="guild-hero-panel">
      <div class="guild-hero-main">
        ${guildIcon(guild, true)}
        <div>
          <span class="badge">Server Dashboard</span>
          <h2>${escapeHtml(guild.name)}</h2>
          <div class="guild-meta">
            <span><i class="online-dot"></i> Bot verbunden</span>
            ${guild.memberCount ? `<span>${guild.memberCount.toLocaleString('de-DE')} Mitglieder</span>` : ''}
          </div>
        </div>
      </div>
      <div class="save-area">
        <span id="saveState">Keine offenen Änderungen</span>
        <button id="saveSettings" class="button primary">Änderungen speichern</button>
      </div>
    </div>

    <div class="dashboard-layout">
      <aside class="module-sidebar">
        <div class="sidebar-label">Module</div>
        <a href="#module-welcome"><span>👋</span> Willkommen</a>
        <a href="#module-autorole"><span>🎭</span> Auto-Role</a>
        <a href="#module-logging"><span>📜</span> Server-Logs</a>
        <a href="#module-customCommands"><span>⚡</span> Custom Commands</a>
      </aside>

      <div class="module-stack">
        ${welcome}
        ${autorole}
        ${logging}
        ${commands}
      </div>
    </div>`;

  let dirty = false;
  const markDirty = () => {
    dirty = true;
    $('#saveState').textContent = 'Ungespeicherte Änderungen';
    $('#saveState').classList.add('dirty');
  };

  $('#guildDashboardContent').querySelectorAll('input, select, textarea').forEach(element => {
    element.addEventListener('change', markDirty);
    if (element.tagName === 'TEXTAREA') element.addEventListener('input', markDirty);
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

      dirty = false;
      $('#saveState').textContent = 'Gespeichert';
      $('#saveState').classList.remove('dirty');
      toast('Server-Einstellungen gespeichert.');
    } catch (error) {
      toast(error.message || 'Speichern fehlgeschlagen.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Änderungen speichern';
    }
  });

  window.addEventListener('beforeunload', event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  }, { once: true });
}

async function renderGuildDashboard(guildId) {
  $('#guildDashboard').classList.remove('hidden');
  const data = await api(`/api/guilds/${guildId}/dashboard`);

  if (!data.guild.botInstalled) {
    $('#guildDashboardContent').innerHTML = `
      <a class="back-link" href="/">← Alle Server</a>
      <div class="empty">Der Bot ist auf diesem Server nicht installiert.</div>`;
    return;
  }

  renderGuildDashboardContent(data);
}

async function boot() {
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

boot().catch(error => {
  console.error(error);
  if (error.status === 401) {
    location.href = '/';
    return;
  }
  toast('Dashboard konnte nicht geladen werden.', 'error');
});
