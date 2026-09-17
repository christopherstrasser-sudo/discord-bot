(() => {
  const state = {
    guildId: '',
    loading: false,
    data: null,
    error: '',
    wiring: false
  };

  function esc(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(String(value ?? ''));
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  }

  function guildId() {
    return activeGuildData?.guild?.id || '';
  }

  function resetForGuild() {
    const id = guildId();
    if (state.guildId === id) return;
    state.guildId = id;
    state.loading = false;
    state.data = null;
    state.error = '';
  }

  function statusLabel(runtime) {
    if (runtime?.starting) return ['starting', 'VERBINDET'];
    if (runtime?.connected && runtime?.inTargetGuild) return ['online', 'ONLINE'];
    if (runtime?.connected) return ['waiting', 'EINLADUNG FEHLT'];
    return ['offline', 'OFFLINE'];
  }

  function identity(config, runtime) {
    const avatar = runtime?.avatarUrl || config?.avatarUrl || '';
    const username = runtime?.username || config?.username || 'Custom Bot';
    const appId = runtime?.applicationId || config?.applicationId || '—';
    return `<div class="cb-identity">
      <div class="cb-avatar">${avatar ? `<img src="${esc(avatar)}" alt="">` : '<span>CB</span>'}</div>
      <div><b>${esc(username)}</b><small>Application ID · ${esc(appId)}</small></div>
    </div>`;
  }

  function setupMarkup() {
    return `<div class="cb-setup-grid">
      <div class="cb-setup-copy">
        <span class="cb-kicker">OPTIONALER EIGENER DISCORD BOT</span>
        <h3>Deine Bot-Identität. Weiterhin von ORBIT gesteuert.</h3>
        <p>Erstelle im Discord Developer Portal eine eigene Application, kopiere den Bot-Token hier hinein und ORBIT startet dafür eine separate Gateway-Verbindung.</p>
        <div class="cb-security-note"><span>✓</span><p>Der Token wird verschlüsselt gespeichert, nie wieder vollständig angezeigt und niemals an den Browser zurückgegeben.</p></div>
      </div>
      <div class="cb-connect-box">
        <label><span>Bot-Token</span><input data-cb-token type="password" autocomplete="off" spellcheck="false" placeholder="Token aus dem Discord Developer Portal"></label>
        <button class="button button-primary" type="button" data-cb-connect>Custom Bot verbinden</button>
        <small>Der Bot braucht zunächst nur einen gültigen Token. Danach erzeugt ORBIT den passenden Server-Invite.</small>
      </div>
    </div>`;
  }

  function connectedMarkup(config, runtime) {
    const [statusClass, statusText] = statusLabel(runtime);
    const p = config?.presence || { status:'online', activityType:'playing', activityText:'', activityUrl:'' };
    return `<div class="cb-connected">
      <div class="cb-runtime-head">
        ${identity(config, runtime)}
        <span class="cb-status ${statusClass}"><i></i>${statusText}</span>
      </div>

      <div class="cb-runtime-grid">
        <div class="cb-runtime-card">
          <span>VERBINDUNG</span>
          <b>${runtime?.connected ? 'Gateway verbunden' : 'Nicht verbunden'}</b>
          <small>${runtime?.inTargetGuild ? 'Custom Bot ist auf diesem Server aktiv.' : runtime?.connected ? 'Bot ist bereit, aber noch nicht auf diesem Server.' : (runtime?.lastError || 'Neu verbinden, um die Gateway-Session zu starten.')}</small>
          <div class="cb-card-actions">
            ${runtime?.inviteUrl ? `<a class="bp-secondary cb-link" href="${esc(runtime.inviteUrl)}" target="_blank" rel="noopener">Bot auf Server einladen</a>` : ''}
            <button class="bp-secondary" type="button" data-cb-reconnect>Neu verbinden</button>
          </div>
        </div>

        <div class="cb-runtime-card">
          <span>CREDENTIAL</span>
          <b>${esc(config?.tokenHint || 'Gespeichert')}</b>
          <small>Der vollständige Token kann aus Sicherheitsgründen nicht angezeigt werden.</small>
          <details class="cb-token-replace"><summary>Token ersetzen</summary><div><input data-cb-token-replace type="password" autocomplete="off" placeholder="Neuen Bot-Token eintragen"><button class="bp-secondary" type="button" data-cb-replace>Ersetzen</button></div></details>
        </div>
      </div>

      <div class="cb-presence">
        <header><div><span>Aktivität & Status</span><h3>Wie soll dein Bot in Discord erscheinen?</h3></div><small>Wird direkt auf die Custom-Bot-Session angewendet.</small></header>
        <div class="cb-presence-fields">
          <label><span>Status</span><select data-cb-status>
            <option value="online" ${p.status==='online'?'selected':''}>Online</option>
            <option value="idle" ${p.status==='idle'?'selected':''}>Abwesend</option>
            <option value="dnd" ${p.status==='dnd'?'selected':''}>Nicht stören</option>
            <option value="invisible" ${p.status==='invisible'?'selected':''}>Unsichtbar</option>
          </select></label>
          <label><span>Aktivität</span><select data-cb-activity-type>
            <option value="playing" ${p.activityType==='playing'?'selected':''}>Spielt</option>
            <option value="watching" ${p.activityType==='watching'?'selected':''}>Schaut</option>
            <option value="listening" ${p.activityType==='listening'?'selected':''}>Hört</option>
            <option value="competing" ${p.activityType==='competing'?'selected':''}>Tritt an in</option>
            <option value="streaming" ${p.activityType==='streaming'?'selected':''}>Streamt</option>
          </select></label>
          <label class="cb-wide"><span>Aktivitätstext</span><input data-cb-activity-text maxlength="128" value="${esc(p.activityText || '')}" placeholder="z. B. auf Rakuleins Community"></label>
          <label class="cb-wide"><span>Streaming-URL <em>optional</em></span><input data-cb-activity-url maxlength="300" value="${esc(p.activityUrl || '')}" placeholder="https://twitch.tv/..."></label>
        </div>
        <footer><small>Streaming-URL wird nur bei der Aktivität „Streamt“ verwendet.</small><button class="button button-primary" type="button" data-cb-save-presence>Aktivität speichern</button></footer>
      </div>

      <div class="cb-danger-zone">
        <div><b>Custom Bot entfernen</b><small>Trennt die Gateway-Verbindung und löscht den verschlüsselten Token aus ORBIT.</small></div>
        <button type="button" data-cb-remove>Entfernen</button>
      </div>
    </div>`;
  }

  function markup() {
    const config = state.data?.config;
    const runtime = state.data?.runtime;
    if (state.loading && !state.data) return `<section class="cb-panel o6-island"><div class="cb-loading"><span></span><div><b>Custom Bot wird geladen</b><small>Verbindungsstatus und Credential-Metadaten werden geprüft …</small></div></div></section>`;
    if (state.error && !state.data) return `<section class="cb-panel o6-island"><div class="cb-error"><span>!</span><div><b>Custom Bot konnte nicht geladen werden</b><small>${esc(state.error)}</small></div><button class="bp-secondary" type="button" data-cb-retry>Erneut versuchen</button></div></section>`;
    return `<section class="cb-panel o6-island">
      <header class="cb-head"><div><span>CUSTOM BOT</span><h2>Eigener Discord Bot</h2></div>${config?.configured ? `<small>${esc(config.tokenHint || 'Credential gespeichert')}</small>` : '<small>Optional</small>'}</header>
      ${config?.configured ? connectedMarkup(config, runtime) : setupMarkup()}
    </section>`;
  }

  function mount() {
    resetForGuild();
    const root = document.querySelector('#guildWorkspace');
    if (!root || root.dataset.page !== 'profile') return;
    if (root.querySelector('.cb-panel')) return;
    const anchor = root.querySelector('.bp-grid') || root.querySelector('.bp-loading') || root.querySelector('.bp-error');
    if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', markup());
    if (!state.data && !state.loading && !state.error) load();
  }

  function rerender() {
    const root = document.querySelector('#guildWorkspace');
    if (!root || root.dataset.page !== 'profile') return;
    const current = root.querySelector('.cb-panel');
    if (current) current.outerHTML = markup();
    else mount();
  }

  async function load(force = false) {
    resetForGuild();
    if (!state.guildId || state.loading || (state.data && !force)) return;
    state.loading = true;
    state.error = '';
    rerender();
    try {
      state.data = await api(`/api/guilds/${state.guildId}/custom-bot`);
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      rerender();
    }
  }

  async function request(path, options = {}) {
    try {
      const result = await api(`/api/guilds/${state.guildId}/custom-bot${path}`, options);
      state.data = { config: result.config, runtime: result.runtime };
      state.error = '';
      rerender();
      return result;
    } catch (error) {
      toast(error.message, 'error');
      throw error;
    }
  }

  function presenceFromUi() {
    return {
      status: document.querySelector('[data-cb-status]')?.value || 'online',
      activityType: document.querySelector('[data-cb-activity-type]')?.value || 'playing',
      activityText: document.querySelector('[data-cb-activity-text]')?.value || '',
      activityUrl: document.querySelector('[data-cb-activity-url]')?.value || ''
    };
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-cb-connect],[data-cb-reconnect],[data-cb-replace],[data-cb-save-presence],[data-cb-remove],[data-cb-retry]');
    if (!button) return;
    event.preventDefault();

    if (button.matches('[data-cb-retry]')) return load(true);

    button.disabled = true;
    try {
      if (button.matches('[data-cb-connect]')) {
        const token = document.querySelector('[data-cb-token]')?.value.trim() || '';
        if (!token) return toast('Bitte zuerst den Bot-Token eintragen.', 'error');
        await request('/connect', { method:'POST', body:JSON.stringify({ token }) });
        toast('Custom Bot verbunden.');
      } else if (button.matches('[data-cb-reconnect]')) {
        await request('/reconnect', { method:'POST' });
        toast('Custom Bot neu verbunden.');
      } else if (button.matches('[data-cb-replace]')) {
        const token = document.querySelector('[data-cb-token-replace]')?.value.trim() || '';
        if (!token) return toast('Bitte einen neuen Bot-Token eintragen.', 'error');
        await request('/connect', { method:'POST', body:JSON.stringify({ token, presence: state.data?.config?.presence || {} }) });
        toast('Bot-Token ersetzt und Verbindung aktualisiert.');
      } else if (button.matches('[data-cb-save-presence]')) {
        await request('/presence', { method:'PATCH', body:JSON.stringify(presenceFromUi()) });
        toast('Aktivität und Status gespeichert.');
      } else if (button.matches('[data-cb-remove]')) {
        if (!confirm('Custom Bot wirklich entfernen? Der gespeicherte Bot-Token wird aus ORBIT gelöscht.')) return;
        await request('', { method:'DELETE' });
        toast('Custom Bot entfernt.');
      }
    } finally {
      button.disabled = false;
    }
  });

  const root = document.querySelector('#guildDashboard');
  if (root && typeof MutationObserver !== 'undefined') {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; mount(); });
    });
    observer.observe(root, { childList:true, subtree:true });
  }

  requestAnimationFrame(mount);
})();