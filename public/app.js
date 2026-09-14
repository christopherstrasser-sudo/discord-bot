const $ = selector => document.querySelector(selector);

function guildIcon(guild) {
  if (!guild.icon) return `<div class="guild-fallback">${guild.name.slice(0, 2).toUpperCase()}</div>`;
  return `<img class="guild-icon" src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128" alt="">`;
}

function userAvatar(user) {
  if (!user.avatar) return `<div class="user-fallback">${user.username.slice(0, 1).toUpperCase()}</div>`;
  return `<img class="user-avatar" src="${user.avatar}" alt="">`;
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  if (response.status === 204) return null;
  return response.json();
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.href = '/';
}

async function renderDashboard() {
  const session = await api('/api/session');

  if (!session.authenticated) {
    $('#loggedOut').classList.remove('hidden');
    return;
  }

  const user = session.user;
  $('#dashboard').classList.remove('hidden');
  $('#userArea').innerHTML = `
    <div class="user-menu">
      ${userAvatar(user)}
      <div><strong>${user.username}</strong><span>@${user.discordUsername}</span></div>
      <button id="logoutButton" class="ghost-button">Abmelden</button>
    </div>`;
  $('#logoutButton').addEventListener('click', logout);

  const { guilds } = await api('/api/guilds');
  const grid = $('#guildGrid');

  if (!guilds.length) {
    $('#emptyState').classList.remove('hidden');
    return;
  }

  grid.innerHTML = guilds.map(guild => `
    <article class="guild-card">
      <div class="guild-card-main">
        ${guildIcon(guild)}
        <div class="guild-info">
          <h3>${guild.name}</h3>
          <span class="status ${guild.botInstalled ? 'installed' : ''}">
            ${guild.botInstalled ? '● Bot installiert' : '○ Bot nicht installiert'}
          </span>
        </div>
      </div>
      ${guild.botInstalled
        ? `<button class="button secondary" disabled>Dashboard folgt</button>`
        : `<a class="button primary small" href="${guild.inviteUrl}">Bot hinzufügen</a>`}
    </article>`).join('');
}

renderDashboard().catch(error => {
  console.error(error);
  document.body.insertAdjacentHTML('beforeend', '<div class="toast">Dashboard konnte nicht geladen werden.</div>');
});
