(() => {
  const S = {
    cfg: null,
    meta: null,
    dirty: false,
    loading: null,
    refreshTimer: null
  };

  window.RakuVoiceStudio = { s: S };

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function activeGuildId() {
    return typeof activeGuildData !== 'undefined' ? activeGuildData?.guild?.id : null;
  }

  function previewName() {
    const template = String(S.cfg?.roomNameTemplate || '🎧 {displayName}');
    return template
      .replaceAll('{displayName}', 'Rakulein')
      .replaceAll('{username}', 'rakulein')
      .replaceAll('{counter}', '12')
      .slice(0, 100);
  }

  async function load({ preserveDirty = false } = {}) {
    const guildId = activeGuildId();
    if (!guildId) return null;
    const payload = await api(`/api/guilds/${guildId}/voice-studio`);
    if (!preserveDirty || !S.dirty || !S.cfg) S.cfg = payload.config;
    S.meta = payload.meta;
    return payload;
  }

  async function ensureLoaded() {
    if (S.cfg && S.meta) return;
    if (!S.loading) {
      S.loading = load().finally(() => { S.loading = null; });
    }
    await S.loading;
  }

  function channelOptions(selected = '') {
    const channels = S.meta?.voiceChannels || [];
    return `<option value="">Voice-Kanal auswählen</option>${channels.map(channel => {
      const label = channel.parent ? `${channel.parent} / ${channel.name}` : channel.name;
      return `<option value="${channel.id}" ${channel.id === selected ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('')}`;
  }

  function categoryOptions(selected = '') {
    const categories = S.meta?.categories || [];
    return `<option value="">Kategorie des Creator-Kanals verwenden</option>${categories.map(category =>
      `<option value="${category.id}" ${category.id === selected ? 'selected' : ''}>${esc(category.name)}</option>`
    ).join('')}`;
  }

  function capabilityRows() {
    const c = S.meta?.capabilities || {};
    const rows = [
      [c.canManageChannels, 'Kanäle verwalten', 'Räume erstellen & löschen'],
      [c.canMoveMembers, 'Mitglieder verschieben', 'Join → Raum'],
      [c.canViewChannels, 'Kanäle sehen', 'Discord Zugriff'],
      [Boolean(S.cfg?.lobbyChannelId), 'Creator-Kanal', S.cfg?.lobbyChannelId ? 'Verbunden' : 'Fehlt']
    ];
    return rows.map(([ok, label, text]) => `<div class="voice-check ${ok ? 'ok' : ''}"><i>${ok ? '✓' : '!'}</i><b>${esc(label)}</b><small>${esc(text)}</small></div>`).join('');
  }

  function roomList() {
    const rooms = S.meta?.rooms || [];
    if (!rooms.length) {
      return `<div class="voice-empty"><b>Noch keine temporären Räume.</b><span>Sobald jemand den Creator-Kanal betritt, erscheint der Raum hier live.</span></div>`;
    }
    return rooms.map(room => `
      <article class="voice-room">
        <div><b>${esc(room.name)}</b><small>${esc(room.ownerName)} · ${room.members}${room.userLimit ? `/${room.userLimit}` : ''} Nutzer</small></div>
        <div><strong>${room.members ? 'LIVE' : 'LEER'}</strong><button type="button" data-voice-delete="${room.channelId}" ${room.members ? 'disabled' : ''}>Leeren Raum löschen</button></div>
      </article>`).join('');
  }

  function readinessOk() {
    const c = S.meta?.capabilities || {};
    return Boolean(c.ready && S.cfg?.lobbyChannelId);
  }

  function markup() {
    const c = S.cfg;
    const rooms = S.meta?.rooms || [];
    const ready = readinessOk();
    const maxBitrate = S.meta?.maxBitrateKbps || 96;
    const lobby = (S.meta?.voiceChannels || []).find(channel => channel.id === c.lobbyChannelId);

    return `<div class="voice-shell">
      <section class="voice-head raku-module-hero">
        <div class="voice-head-copy"><span>COMMUNITY / VOICE STUDIO</span><h2>Join. Create. Talk.</h2><p>Ein Creator-Kanal erzeugt automatisch persönliche Voice-Räume, verschiebt den Besitzer hinein und räumt leere Räume selbstständig wieder auf.</p></div>
        <div class="voice-head-side">
          <label class="voice-master"><input type="checkbox" data-v-enabled ${c.enabled ? 'checked' : ''}><i></i><b>${c.enabled ? 'SYSTEM AKTIV' : 'SYSTEM AUS'}</b></label>
          <button type="button" class="button button-primary voice-save ${S.dirty ? 'dirty' : ''}" data-v-save ${S.dirty ? '' : 'disabled'}>${S.dirty ? 'Änderungen speichern' : 'Gespeichert'}</button>
        </div>
      </section>

      <div class="voice-stat-strip">
        <div><span>AKTIVE RÄUME</span><b>${rooms.length}</b></div>
        <div><span>CREATOR-KANAL</span><b>${lobby ? esc(lobby.name) : '—'}</b></div>
        <div><span>MAX. NUTZER</span><b>${c.userLimit ? c.userLimit : '∞'}</b></div>
      </div>

      <section class="voice-flow">
        <article><i>01</i><div><b>JOIN</b><small>User betritt den Creator-Kanal.</small></div></article>
        <article><i>02</i><div><b>CREATE</b><small>ORBIT erzeugt den persönlichen Raum.</small></div></article>
        <article><i>03</i><div><b>MOVE</b><small>User wird automatisch verschoben.</small></div></article>
        <article><i>04</i><div><b>CLEANUP</b><small>Leerer Raum verschwindet automatisch.</small></div></article>
      </section>

      <div class="voice-layout">
        <main class="voice-main">
          <section class="voice-card">
            <header><div><span>01 / ENTRY NODE</span><b>Creator-Kanal & Ziel</b><small>Dieser Voice-Channel ist der Eingang in dein Join-to-Create-System.</small></div></header>
            <div class="voice-form-grid">
              <label class="voice-field"><span>CREATOR-KANAL</span><select data-v-lobby>${channelOptions(c.lobbyChannelId)}</select><small>Beim Betreten dieses Kanals wird automatisch ein Raum erstellt.</small></label>
              <label class="voice-field"><span>ZIELKATEGORIE</span><select data-v-category>${categoryOptions(c.categoryId)}</select><small>Leer = neue Räume erscheinen in der Kategorie des Creator-Kanals.</small></label>
            </div>
            <div class="voice-lobby-builder">
              <label><span>NOCH KEINEN CREATOR-KANAL?</span><input data-v-lobby-name value="➕ Eigenen Voice erstellen" maxlength="100"></label>
              <button type="button" class="button button-ghost" data-v-create-lobby>Creator-Kanal automatisch anlegen</button>
            </div>
          </section>

          <section class="voice-card">
            <header><div><span>02 / ROOM BLUEPRINT</span><b>Neue Räume</b><small>Lege fest, wie jeder automatisch erzeugte Voice-Raum startet.</small></div></header>
            <div class="voice-form-grid">
              <label class="voice-field wide"><span>NAMENSSCHEMA</span><input data-v-template maxlength="100" value="${esc(c.roomNameTemplate)}"><small>Variablen: {displayName}, {username}, {counter}</small></label>
              <label class="voice-field"><span>MAXIMALE NUTZERZAHL</span><input type="number" min="0" max="99" data-v-limit value="${Number(c.userLimit || 0)}"><small>0 = unbegrenzt. Discord blockiert weitere Joins automatisch.</small></label>
              <label class="voice-field"><span>BITRATE</span><input type="number" min="0" max="${maxBitrate}" step="8" data-v-bitrate value="${Number(c.bitrateKbps || 0)}"><small>0 = Discord-Standard · Servermaximum ${maxBitrate} kbit/s.</small></label>
            </div>
            <div class="voice-template-preview"><span>ROOM PREVIEW</span><b data-v-preview>${esc(previewName())}</b></div>
          </section>

          <details class="voice-advanced">
            <summary><div><span>ADVANCED CONTROL</span><b>Ownership & Cleanup</b></div></summary>
            <div class="voice-advanced-body">
              <div class="voice-toggle-row"><div><b>Room-Owner Controls</b><small>Der Ersteller darf seinen eigenen Raum umbenennen, Limit/Rechte anpassen und Mitglieder verschieben.</small></div><label class="voice-switch"><input type="checkbox" data-v-owner ${c.ownerControls ? 'checked' : ''}><i></i></label></div>
              <div class="voice-toggle-row"><div><b>Owner automatisch übertragen</b><small>Verlässt der Besitzer einen belegten Raum, bekommt ein verbleibendes Mitglied die Kontrolle. So bleibt kein Raum führungslos.</small></div><label class="voice-switch"><input type="checkbox" data-v-transfer ${c.autoTransferOwner ? 'checked' : ''}><i></i></label></div>
              <label class="voice-field"><span>CLEANUP DELAY</span><input type="number" min="0" max="300" data-v-cleanup value="${Number(c.cleanupDelaySeconds || 0)}"><small>Sekunden, die ein leerer Raum bestehen bleibt. Kleine Verzögerung schützt vor Reconnect-Flattern.</small></label>
            </div>
          </details>
        </main>

        <aside class="voice-side">
          <section class="voice-ready">
            <header><div><span>READINESS</span><b>Systemcheck</b></div><em class="${ready ? 'ok' : ''}">${ready ? 'READY' : 'SETUP'}</em></header>
            <div class="voice-checks">${capabilityRows()}</div>
            ${S.meta?.capabilities?.ready ? '' : `<a class="button button-primary voice-permission-cta" href="${esc(S.meta?.permissionUpgradeUrl || '#')}" target="_blank" rel="noopener">Voice-Rechte ergänzen ↗</a>`}
          </section>

          <section class="voice-live">
            <header><div><span>LIVE ROOMS</span><b>Temporäre Channels</b></div><em class="voice-live-signal"><i></i>${rooms.length} aktiv</em></header>
            <div class="voice-room-list">${roomList()}</div>
          </section>
        </aside>
      </div>
    </div>`;
  }

  function setDirty(value = true) {
    S.dirty = value;
    const button = document.querySelector('[data-v-save]');
    if (button) {
      button.disabled = !value;
      button.classList.toggle('dirty', value);
      button.textContent = value ? 'Änderungen speichern' : 'Gespeichert';
    }
  }

  function bindValue(selector, key, transform = value => value) {
    const field = document.querySelector(selector);
    if (!field) return;
    const eventName = field.matches('select,input[type="checkbox"]') ? 'change' : 'input';
    field.addEventListener(eventName, () => {
      const raw = field.type === 'checkbox' ? field.checked : field.value;
      S.cfg[key] = transform(raw);
      if (key === 'roomNameTemplate') {
        const preview = document.querySelector('[data-v-preview]');
        if (preview) preview.textContent = previewName();
      }
      if (key === 'enabled') {
        const label = field.closest('.voice-master')?.querySelector('b');
        if (label) label.textContent = field.checked ? 'SYSTEM AKTIV' : 'SYSTEM AUS';
      }
      setDirty(true);
    });
  }

  async function save({ rerender = true } = {}) {
    const guildId = activeGuildId();
    if (!guildId || !S.cfg) return;
    const button = document.querySelector('[data-v-save]');
    if (button) { button.disabled = true; button.textContent = 'Speichert …'; }
    try {
      const payload = await api(`/api/guilds/${guildId}/voice-studio`, { method: 'PATCH', body: JSON.stringify(S.cfg) });
      S.cfg = payload.config;
      S.meta = payload.meta;
      S.dirty = false;
      toast('Voice Studio gespeichert.');
      if (rerender) renderVoice();
      ensureVoiceNav();
      decorateOverview();
    } catch (error) {
      toast(error.message, 'error');
      setDirty(true);
      throw error;
    }
  }

  async function createLobby() {
    const guildId = activeGuildId();
    if (!guildId) return;
    try {
      if (S.dirty) await save({ rerender: false });
      const name = document.querySelector('[data-v-lobby-name]')?.value || '➕ Eigenen Voice erstellen';
      const categoryId = S.cfg.categoryId || '';
      const payload = await api(`/api/guilds/${guildId}/voice-studio/create-lobby`, {
        method: 'POST',
        body: JSON.stringify({ name, categoryId })
      });
      S.cfg = payload.config;
      S.meta = payload.meta;
      S.dirty = false;
      toast(`Creator-Kanal „${payload.channel.name}“ wurde angelegt.`);
      renderVoice();
      ensureVoiceNav();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function deleteRoom(channelId) {
    const guildId = activeGuildId();
    if (!guildId) return;
    try {
      const payload = await api(`/api/guilds/${guildId}/voice-studio/rooms/${channelId}`, { method: 'DELETE' });
      S.meta = payload.meta;
      toast('Leerer Voice-Raum entfernt.');
      renderVoice();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function wire() {
    bindValue('[data-v-enabled]', 'enabled', Boolean);
    bindValue('[data-v-lobby]', 'lobbyChannelId', String);
    bindValue('[data-v-category]', 'categoryId', String);
    bindValue('[data-v-template]', 'roomNameTemplate', String);
    bindValue('[data-v-limit]', 'userLimit', value => Math.max(0, Math.min(99, Number(value) || 0)));
    bindValue('[data-v-bitrate]', 'bitrateKbps', value => Math.max(0, Number(value) || 0));
    bindValue('[data-v-cleanup]', 'cleanupDelaySeconds', value => Math.max(0, Math.min(300, Number(value) || 0)));
    bindValue('[data-v-owner]', 'ownerControls', Boolean);
    bindValue('[data-v-transfer]', 'autoTransferOwner', Boolean);
    document.querySelector('[data-v-save]')?.addEventListener('click', () => save().catch(() => {}));
    document.querySelector('[data-v-create-lobby]')?.addEventListener('click', createLobby);
    document.querySelectorAll('[data-voice-delete]').forEach(button => button.addEventListener('click', () => deleteRoom(button.dataset.voiceDelete)));
  }

  async function renderVoice() {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.dataset.rakuTab = 'voice';
    root.classList.add('raku-workspace-v1');

    if (!S.cfg || !S.meta) {
      root.innerHTML = '<div class="voice-loading">Voice Studio wird geladen …</div>';
      try {
        await ensureLoaded();
        if (typeof activeTab === 'undefined' || activeTab !== 'voice') return;
      } catch (error) {
        root.innerHTML = `<div class="voice-loading">${esc(error.message)}</div>`;
        return;
      }
    }

    root.innerHTML = markup();
    wire();
  }

  function navStatus() {
    if (!S.cfg) return ['','Voice'];
    if (!S.cfg.enabled) return ['', 'Aus'];
    return ['on', `${S.meta?.rooms?.length || 0} Räume`];
  }

  function ensureVoiceNav() {
    const nav = document.querySelector('.deck-nav');
    if (!nav) return;
    let button = nav.querySelector('.deck-nav-item[data-tab="voice"]');
    const groups = [...nav.querySelectorAll('.raku-nav-group')];
    const community = groups.find(group => group.querySelector('.deck-nav-label')?.textContent.trim() === 'COMMUNITY');
    if (!community) return;

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'deck-nav-item';
      button.dataset.tab = 'voice';
      button.innerHTML = `${typeof icon === 'function' ? icon('wave') : ''}<span>Voice Studio</span><small></small>`;
      button.addEventListener('click', () => switchTab('voice'));
      const tickets = community.querySelector('[data-tab="tickets"]');
      if (tickets) tickets.insertAdjacentElement('afterend', button);
      else community.appendChild(button);
    }

    button.classList.toggle('active', typeof activeTab !== 'undefined' && activeTab === 'voice');
    const [cls, text] = navStatus();
    const small = button.querySelector('small');
    if (small) small.innerHTML = `<span class="raku-nav-node ${cls}"></span><span>${esc(text)}</span>`;
  }

  function decorateOverview() {
    if (typeof activeTab === 'undefined' || activeTab !== 'overview') return;
    const grid = document.querySelector('.raku-module-grid');
    if (!grid) return;
    let card = grid.querySelector('[data-raku-open="voice"]');
    const on = Boolean(S.cfg?.enabled);
    const stat = !S.cfg ? 'Bereit' : (S.meta?.rooms?.length ? `${S.meta.rooms.length} Räume live` : (S.cfg.lobbyChannelId ? 'Creator-Kanal gesetzt' : 'Nicht konfiguriert'));
    const html = `<div class="raku-card-top"><span>COMMUNITY</span><i class="raku-control-node"><u></u></i></div><b>Voice Studio</b><p>Join-to-Create Voice-Räume mit Ownership, Limits und Auto-Cleanup.</p><footer><span>${on ? 'AKTIV' : 'BEREIT'}</span><em>${esc(stat)}</em><strong>→</strong></footer>`;
    if (!card) {
      card = document.createElement('button');
      card.type = 'button';
      card.className = `raku-module-card ${on ? 'on' : ''}`;
      card.dataset.rakuOpen = 'voice';
      const tickets = grid.querySelector('[data-raku-open="tickets"]');
      if (tickets) tickets.insertAdjacentElement('afterend', card);
      else grid.appendChild(card);
      card.addEventListener('click', () => switchTab('voice'));
    }
    card.classList.toggle('on', on);
    card.innerHTML = html;
  }

  function startLiveRefresh() {
    if (S.refreshTimer) return;
    S.refreshTimer = setInterval(async () => {
      if (typeof activeTab === 'undefined' || activeTab !== 'voice' || !activeGuildId()) return;
      try {
        await load({ preserveDirty: true });
        const live = document.querySelector('.voice-live');
        if (live && typeof activeTab !== 'undefined' && activeTab === 'voice') renderVoice();
        ensureVoiceNav();
      } catch {}
    }, 10000);
    if (typeof S.refreshTimer.unref === 'function') S.refreshTimer.unref();
  }

  function installHooks() {
    if (typeof getInitialTab === 'function') {
      const previous = getInitialTab;
      getInitialTab = function getInitialTabWithVoice() {
        if (new URLSearchParams(location.search).get('tab') === 'voice') return 'voice';
        return previous();
      };
    }

    if (typeof activeModuleCount === 'function') {
      const previous = activeModuleCount;
      activeModuleCount = function activeModuleCountWithVoice(settings) {
        return previous(settings) + (S.cfg?.enabled ? 1 : 0);
      };
    }

    if (typeof renderGuildWorkspace === 'function') {
      const previous = renderGuildWorkspace;
      renderGuildWorkspace = function renderGuildWorkspaceWithVoice(tab) {
        if (tab === 'voice') {
          renderVoice();
          ensureVoiceNav();
          return;
        }
        previous(tab);
        if (tab === 'overview') decorateOverview();
        ensureVoiceNav();
      };
    }

    if (typeof renderGuildShell === 'function') {
      const previous = renderGuildShell;
      renderGuildShell = function renderGuildShellWithVoice() {
        previous();
        ensureVoiceNav();
        if (!S.cfg && activeGuildId()) {
          ensureLoaded().then(() => {
            ensureVoiceNav();
            if (typeof activeTab !== 'undefined' && activeTab === 'overview') renderGuildWorkspace('overview');
            if (typeof activeTab !== 'undefined' && activeTab === 'voice') renderVoice();
          }).catch(error => console.warn('[VOICE UI] Load failed:', error));
        }
      };
    }

    startLiveRefresh();
  }

  installHooks();
})();
