(() => {
  const S = {
    guildId: '',
    loading: false,
    loaded: false,
    saving: false,
    profile: null,
    nickname: '',
    bio: '',
    avatarData: '',
    resetAvatar: false,
    dirty: false,
    error: ''
  };

  const PROFILE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="13" rx="4"/><path d="M9 6V4.5M15 6V4.5M8.5 12h.01M15.5 12h.01M9 16h6"/></svg>';

  function safe(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(String(value ?? ''));
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  }

  function guildId() {
    return activeGuildData?.guild?.id || '';
  }

  function resetStateForGuild() {
    const id = guildId();
    if (S.guildId === id) return;
    S.guildId = id;
    S.loading = false;
    S.loaded = false;
    S.saving = false;
    S.profile = null;
    S.nickname = '';
    S.bio = '';
    S.avatarData = '';
    S.resetAvatar = false;
    S.dirty = false;
    S.error = '';
  }

  function syncFromProfile(profile) {
    S.profile = profile;
    S.nickname = profile?.nickname || '';
    S.bio = profile?.bio || '';
    S.avatarData = '';
    S.resetAvatar = false;
    S.dirty = false;
    S.error = '';
  }

  function displayAvatar() {
    if (S.avatarData) return S.avatarData;
    if (S.resetAvatar) return S.profile?.globalAvatarUrl || '';
    return S.profile?.avatarUrl || S.profile?.globalAvatarUrl || '';
  }

  function displayName() {
    return S.nickname.trim() || S.profile?.effectiveName || 'RAKU Bot';
  }

  function updateDirty() {
    const baselineNick = S.profile?.nickname || '';
    const baselineBio = S.profile?.bio || '';
    S.dirty = S.nickname !== baselineNick || S.bio !== baselineBio || Boolean(S.avatarData) || S.resetAvatar;
    const button = document.querySelector('[data-bp-save]');
    if (button) button.disabled = !S.dirty || S.saving;
    const badge = document.querySelector('[data-bp-dirty]');
    if (badge) badge.classList.toggle('visible', S.dirty);
  }

  async function loadProfile(force = false) {
    resetStateForGuild();
    if (!S.guildId || S.loading || (S.loaded && !force)) return;
    S.loading = true;
    S.error = '';
    if (activeTab === 'profile') renderProfile();
    try {
      const result = await api(`/api/guilds/${S.guildId}/bot-profile`);
      syncFromProfile(result.profile || {});
      S.loaded = true;
    } catch (error) {
      S.error = error.message;
    } finally {
      S.loading = false;
      if (activeTab === 'profile') renderProfile();
    }
  }

  function profileHero() {
    const name = displayName();
    return `<section class="o6-module-hero o6-island bp-hero">
      <div class="o6-module-hero-copy">
        <span class="o6-module-hero-icon bp-hero-icon">${PROFILE_ICON}</span>
        <div>
          <span class="o6-eyebrow">SERVER IDENTITÄT</span>
          <h1>Der Bot sieht aus, als würde er zu deinem Server gehören.</h1>
          <p>Gib <b>${safe(name)}</b> auf diesem Discord einen eigenen Namen, Avatar und eine eigene Bio. Die Änderungen gelten nur für diesen Server.</p>
        </div>
      </div>
      <aside class="o6-module-hero-side">
        <div class="o6-module-hero-status on"><i aria-hidden="true"></i><span>Serverbezogen</span><b>Name · Avatar · Bio</b></div>
        <p class="o6-module-hero-purpose">Kein Webhook und kein zweiter Bot: Discord speichert dieses Profil direkt für die Bot-Mitgliedschaft auf deinem Server.</p>
      </aside>
      <div class="o6-module-hero-flow"><strong>So funktioniert's</strong><span class="o6-module-hero-step"><i>1</i>Name wählen</span><span class="o6-module-hero-step"><i>2</i>Avatar setzen</span><span class="o6-module-hero-step"><i>3</i>Profil speichern</span></div>
    </section>`;
  }

  function loadingMarkup() {
    return `<div class="bp-loading o6-island"><span></span><div><b>Bot-Profil wird geladen</b><small>Discord-Profil für diesen Server wird abgefragt …</small></div></div>`;
  }

  function errorMarkup() {
    return `<div class="bp-error o6-island"><span>!</span><div><b>Bot-Profil konnte nicht geladen werden</b><small>${safe(S.error)}</small></div><button type="button" data-bp-retry>Erneut versuchen</button></div>`;
  }

  function previewMarkup() {
    const avatar = displayAvatar();
    const name = displayName();
    const bio = S.bio.trim();
    return `<aside class="bp-preview-wrap">
      <div class="bp-preview-label"><span>LIVE VORSCHAU</span><small>So wirkt der Bot auf diesem Server</small></div>
      <div class="bp-discord-card">
        <div class="bp-discord-banner"></div>
        <div class="bp-preview-avatar-wrap">
          ${avatar ? `<img class="bp-preview-avatar" src="${safe(avatar)}" alt="">` : `<span class="bp-preview-avatar bp-avatar-fallback">R</span>`}
          <i></i>
        </div>
        <div class="bp-discord-profile-copy">
          <div class="bp-name-row"><h3>${safe(name)}</h3><span>APP</span></div>
          <p>${bio ? safe(bio) : '<em>Noch keine Server-Bio gesetzt.</em>'}</p>
          <div class="bp-profile-divider"></div>
          <strong>MITGLIED SEIT</strong>
          <small>Heute · Bot auf diesem Server</small>
        </div>
      </div>
      <div class="bp-preview-note"><span></span><p>Avatar, Name und Bio werden direkt auf die Discord-Mitgliedschaft des Bots angewendet.</p></div>
    </aside>`;
  }

  function editorMarkup() {
    const p = S.profile || {};
    const avatar = displayAvatar();
    return `<div class="bp-editor o6-island">
      <header class="bp-section-head"><div><span>BOT PROFIL</span><h2>Server-Identität</h2></div><span class="bp-unsaved" data-bp-dirty>UNGESPEICHERT</span></header>

      <div class="bp-avatar-row">
        <div class="bp-avatar-stage">
          ${avatar ? `<img src="${safe(avatar)}" alt="Aktueller Bot-Avatar">` : '<span>R</span>'}
        </div>
        <div class="bp-avatar-copy">
          <b>Server-Avatar</b>
          <p>Wird auf 256 × 256 px zugeschnitten und nur für diesen Discord-Server gesetzt.</p>
          <div class="bp-avatar-actions">
            <label class="bp-upload-button"><input data-bp-avatar type="file" accept="image/png,image/jpeg,image/webp"><span>Avatar wählen</span></label>
            <button type="button" class="bp-secondary" data-bp-avatar-reset ${!p.hasServerAvatar && !S.avatarData ? 'disabled' : ''}>Server-Avatar entfernen</button>
          </div>
          <small>PNG, JPG oder WebP · Quelle maximal 8 MB</small>
        </div>
      </div>

      <div class="bp-fields">
        <label class="bp-field ${p.canChangeNickname === false ? 'locked' : ''}">
          <span><b>Bot-Name auf diesem Server</b><em><span data-bp-name-count>${S.nickname.length}</span>/32</em></span>
          <input data-bp-name type="text" maxlength="32" value="${safe(S.nickname)}" placeholder="${safe(p.effectiveName || 'RAKU Bot')}" ${p.canChangeNickname === false ? 'disabled' : ''}>
          <small>${p.canChangeNickname === false ? 'Der Bot-Rolle fehlt aktuell „Nickname ändern“. Avatar und Bio kannst du trotzdem bearbeiten.' : 'Leer lassen, um den globalen Bot-Namen zu verwenden.'}</small>
        </label>

        <label class="bp-field">
          <span><b>Server-Bio</b><em><span data-bp-bio-count>${S.bio.length}</span>/190</em></span>
          <textarea data-bp-bio maxlength="190" rows="4" placeholder="Was macht der Bot auf diesem Server?">${safe(S.bio)}</textarea>
          <small>Kurze Beschreibung, die im serverbezogenen Bot-Profil erscheint.</small>
        </label>
      </div>

      <footer class="bp-savebar">
        <div><span class="bp-save-status"></span><p><b>Nur dieser Server</b><small>Andere Discord-Server mit dem Bot bleiben unverändert.</small></p></div>
        <button type="button" class="button button-primary" data-bp-save ${!S.dirty || S.saving ? 'disabled' : ''}>${S.saving ? 'Wird gespeichert …' : 'Bot-Profil speichern'}</button>
      </footer>
    </div>`;
  }

  function renderProfile() {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.className = 'deck-workspace o6-canvas o6-module-canvas bp-canvas';
    root.dataset.page = 'profile';
    root.dataset.module = 'profile';
    root.innerHTML = `${profileHero()}${S.loading && !S.loaded ? loadingMarkup() : S.error && !S.loaded ? errorMarkup() : S.loaded ? `<div class="bp-grid">${editorMarkup()}${previewMarkup()}</div>` : loadingMarkup()}`;
    wireProfile();
    if (!S.loaded && !S.loading && !S.error) loadProfile();
  }

  function wireProfile() {
    document.querySelector('[data-bp-retry]')?.addEventListener('click', () => { S.error = ''; loadProfile(true); });
    const name = document.querySelector('[data-bp-name]');
    const bio = document.querySelector('[data-bp-bio]');
    name?.addEventListener('input', event => {
      S.nickname = event.target.value;
      const counter = document.querySelector('[data-bp-name-count]');
      if (counter) counter.textContent = String(S.nickname.length);
      updateDirty();
      refreshPreview();
    });
    bio?.addEventListener('input', event => {
      S.bio = event.target.value;
      const counter = document.querySelector('[data-bp-bio-count]');
      if (counter) counter.textContent = String(S.bio.length);
      updateDirty();
      refreshPreview();
    });
    document.querySelector('[data-bp-avatar]')?.addEventListener('change', handleAvatarFile);
    document.querySelector('[data-bp-avatar-reset]')?.addEventListener('click', () => {
      S.avatarData = '';
      S.resetAvatar = true;
      updateDirty();
      renderProfile();
    });
    document.querySelector('[data-bp-save]')?.addEventListener('click', saveProfile);
  }

  function refreshPreview() {
    const wrap = document.querySelector('.bp-preview-wrap');
    if (!wrap) return;
    const replacement = document.createElement('div');
    replacement.innerHTML = previewMarkup();
    wrap.replaceWith(replacement.firstElementChild);
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Dieses Bildformat konnte nicht verarbeitet werden.'));
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function prepareAvatar(file) {
    if (!file) return '';
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error('Bitte PNG, JPG oder WebP verwenden.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Das Bild darf maximal 8 MB groß sein.');
    const image = await fileToImage(file);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = Math.max(0, (image.naturalWidth - side) / 2);
    const sy = Math.max(0, (image.naturalHeight - side) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, sx, sy, side, side, 0, 0, 256, 256);
    let data = canvas.toDataURL('image/webp', 0.9);
    if (data.length > 180000) data = canvas.toDataURL('image/jpeg', 0.82);
    if (data.length > 220000) throw new Error('Das Avatar-Bild konnte nicht klein genug verarbeitet werden.');
    return data;
  }

  async function handleAvatarFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      S.avatarData = await prepareAvatar(file);
      S.resetAvatar = false;
      updateDirty();
      renderProfile();
    } catch (error) {
      toast(error.message, 'error');
      event.target.value = '';
    }
  }

  async function saveProfile() {
    if (!S.dirty || S.saving) return;
    S.saving = true;
    renderProfile();
    try {
      const payload = {
        nickname: S.nickname,
        bio: S.bio,
        ...(S.avatarData ? { avatarData: S.avatarData } : {}),
        ...(S.resetAvatar ? { resetAvatar: true } : {})
      };
      const result = await api(`/api/guilds/${S.guildId}/bot-profile`, { method: 'PATCH', body: JSON.stringify(payload) });
      syncFromProfile(result.profile || {});
      S.loaded = true;
      toast('Bot-Profil auf diesem Server aktualisiert.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      S.saving = false;
      if (activeTab === 'profile') renderProfile();
    }
  }

  function injectRailItem() {
    const rail = document.querySelector('.o6-command-rail');
    if (!rail || rail.querySelector('[data-tab="profile"]')) return;
    const overview = rail.querySelector('[data-tab="overview"]');
    if (!overview) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `deck-nav-item o6-dock-item${activeTab === 'profile' ? ' active' : ''}`;
    button.dataset.tab = 'profile';
    button.setAttribute('aria-label', 'Bot-Profil');
    button.title = 'Bot-Profil';
    button.innerHTML = `<span class="o6-module-symbol">${PROFILE_ICON}</span><span class="o6-dock-label">Bot-Profil</span>`;
    overview.insertAdjacentElement('afterend', button);
  }

  function updatePageCapsule() {
    if (activeTab !== 'profile') return;
    const title = document.querySelector('#o6PageTitle');
    const description = document.querySelector('#o6PageDescription');
    if (title) title.textContent = 'Bot-Profil';
    if (description) description.textContent = 'Name, Avatar und Serverprofil deines Bots.';
  }

  if (typeof getInitialTab === 'function') {
    const previousInitialTab = getInitialTab;
    getInitialTab = function getInitialTabWithBotProfile() {
      if (new URLSearchParams(location.search).get('tab') === 'profile') return 'profile';
      return previousInitialTab();
    };
  }

  if (typeof renderGuildWorkspace === 'function') {
    const previousWorkspace = renderGuildWorkspace;
    renderGuildWorkspace = function renderGuildWorkspaceWithBotProfile(tab) {
      if (tab === 'profile') {
        resetStateForGuild();
        renderProfile();
        return;
      }
      previousWorkspace(tab);
    };
  }

  if (typeof renderGuildShell === 'function') {
    const previousShell = renderGuildShell;
    renderGuildShell = function renderGuildShellWithBotProfile() {
      previousShell();
      injectRailItem();
      updatePageCapsule();
    };
  }

  if (typeof switchTab === 'function') {
    const previousSwitch = switchTab;
    switchTab = function switchTabWithBotProfile(tab) {
      previousSwitch(tab);
      injectRailItem();
      document.querySelectorAll('.o6-command-rail [data-tab]').forEach(item => item.classList.toggle('active', item.dataset.tab === tab));
      updatePageCapsule();
    };
  }
})();