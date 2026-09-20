(() => {
  const MAX_PANELS = 10;
  const MAX_ITEMS = 20;
  let selectedPanelId = null;
  let dragItemId = null;
  let fetchWrapped = false;

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function newId(prefix) {
    if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function roleState() {
    if (typeof workingSettings === 'undefined' || !workingSettings) return null;
    if (!workingSettings.rolePanels || typeof workingSettings.rolePanels !== 'object') {
      workingSettings.rolePanels = { enabled: false, panels: [] };
    }
    if (!Array.isArray(workingSettings.rolePanels.panels)) workingSettings.rolePanels.panels = [];
    if (!selectedPanelId || !workingSettings.rolePanels.panels.some(panel => panel.id === selectedPanelId)) {
      selectedPanelId = workingSettings.rolePanels.panels[0]?.id || null;
    }
    return workingSettings.rolePanels;
  }

  function selectedPanel() {
    const state = roleState();
    return state?.panels.find(panel => panel.id === selectedPanelId) || null;
  }

  function ensurePanel(panel) {
    panel.id ||= newId('panel');
    panel.name ||= 'Neues Rollen-Panel';
    panel.enabled = panel.enabled !== false;
    panel.channelId ||= '';
    panel.mode = ['buttons', 'select', 'reactions'].includes(panel.mode) ? panel.mode : 'buttons';
    panel.selectionMode = panel.selectionMode === 'single' ? 'single' : 'multi';
    panel.allowRemove = panel.allowRemove !== false;
    panel.title ||= 'Wähle deine Rollen';
    panel.description ||= 'Klicke unten und stelle dir deine Rollen selbst zusammen.';
    panel.color = /^#[0-9a-f]{6}$/i.test(String(panel.color || '')) ? String(panel.color).toUpperCase() : '#5865F2';
    panel.placeholder ||= 'Rollen auswählen …';
    panel.items = Array.isArray(panel.items) ? panel.items : [];
    panel.items.forEach(item => {
      item.id ||= newId('role');
      item.roleId ||= '';
      item.label ||= '';
      item.emoji ||= '';
      item.description ||= '';
      item.style = ['primary', 'secondary', 'success', 'danger'].includes(item.style) ? item.style : 'secondary';
    });
    return panel;
  }

  function newPanel(template = 'blank') {
    const panel = ensurePanel({
      id: newId('panel'),
      name: 'Neues Rollen-Panel',
      enabled: true,
      channelId: '',
      mode: 'buttons',
      selectionMode: 'multi',
      allowRemove: true,
      title: 'Wähle deine Rollen',
      description: 'Klicke unten und stelle dir deine Rollen selbst zusammen.',
      color: '#5865F2',
      placeholder: 'Rollen auswählen …',
      items: []
    });

    if (template === 'gaming') {
      panel.name = 'Gaming Rollen';
      panel.title = 'Welche Games spielst du?';
      panel.description = 'Wähle alle Games aus, für die du Rollen und passende Channels sehen möchtest.';
      panel.items = [
        ['VALORANT', '🎯', 'primary'],
        ['League of Legends', '⚔️', 'secondary'],
        ['Minecraft', '⛏️', 'success'],
        ['Palworld', '🐾', 'secondary']
      ].map(([label, emoji, style]) => ({ id: newId('role'), roleId: '', label, emoji, description: '', style }));
    }

    if (template === 'pronouns') {
      panel.name = 'Pronomen';
      panel.title = 'Deine Pronomen';
      panel.description = 'Wähle die Rolle, mit der du angesprochen werden möchtest.';
      panel.selectionMode = 'single';
      panel.mode = 'buttons';
      panel.items = [
        ['Er / Ihm', '♂️', 'primary'],
        ['Sie / Ihr', '♀️', 'danger'],
        ['They / Them', '✨', 'secondary']
      ].map(([label, emoji, style]) => ({ id: newId('role'), roleId: '', label, emoji, description: '', style }));
    }

    if (template === 'notifications') {
      panel.name = 'Benachrichtigungen';
      panel.title = 'Welche Pings möchtest du?';
      panel.description = 'Du entscheidest selbst, für welche Events du Benachrichtigungen bekommst.';
      panel.mode = 'select';
      panel.items = [
        ['Streams', '🔴', 'Neue Livestreams'],
        ['Events', '🎉', 'Community-Events und Turniere'],
        ['Updates', '📣', 'Wichtige Server-Neuigkeiten']
      ].map(([label, emoji, description]) => ({ id: newId('role'), roleId: '', label, emoji, description, style: 'secondary' }));
    }

    return panel;
  }

  function roleById(id) {
    return activeGuildData?.roles?.find(role => role.id === id) || null;
  }

  function channelById(id) {
    return activeGuildData?.channels?.find(channel => channel.id === id) || null;
  }

  function channelOptions(selected = '') {
    const options = (activeGuildData?.channels || []).map(channel => {
      const label = channel.parent ? `${channel.parent} / #${channel.name}` : `#${channel.name}`;
      return `<option value="${channel.id}" ${channel.id === selected ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
    return `<option value="">Kanal auswählen</option>${options}`;
  }

  function roleOptions(selected = '') {
    const options = (activeGuildData?.roles || []).map(role =>
      `<option value="${role.id}" ${role.id === selected ? 'selected' : ''}>@${esc(role.name)}</option>`
    ).join('');
    return `<option value="">Rolle auswählen</option>${options}`;
  }

  function published(panel) {
    return Boolean(panel?.messageId && panel?.publishedChannelId);
  }

  function modeMeta(mode) {
    return {
      buttons: ['BTN', 'Buttons', 'Direkt, sichtbar und maximal intuitiv'],
      select: ['SEL', 'Dropdown', 'Perfekt für viele Rollen auf wenig Platz'],
      reactions: ['RXN', 'Reactions', 'Klassisch mit Emoji-Reaktionen']
    }[mode] || ['BTN', 'Buttons', ''];
  }

  function moduleEnabled() {
    return Boolean(roleState()?.enabled);
  }

  function panelReady(panel) {
    if (!panel) return false;
    if (!panel.channelId || !panel.items.length) return false;
    if (panel.items.some(item => !item.roleId)) return false;
    if (panel.mode === 'reactions' && panel.items.some(item => !item.emoji)) return false;
    if (activeGuildData?.capabilities?.canManageRoles === false) return false;
    return true;
  }

  function touch(preview = true) {
    if (typeof markDirty === 'function') markDirty();
    updateRoleNavState();
    updateStudioStats();
    if (preview) updatePreview();
  }

  function updateRoleNavState() {
    const item = document.querySelector('.deck-nav-item[data-tab="roles"]');
    if (!item) return;
    const small = item.querySelector('small');
    if (small) {
      small.innerHTML = `<span class="state-dot ${moduleEnabled() ? 'on' : ''}"></span><span>${moduleEnabled() ? 'Aktiv' : 'Aus'}</span>`;
    }
  }

  function updateStudioStats() {
    const state = roleState();
    if (!state) return;
    const panels = state.panels;
    const live = panels.filter(published).length;
    const roles = panels.reduce((sum, panel) => sum + (panel.items?.length || 0), 0);
    const el = document.querySelector('[data-role-stats]');
    if (el) el.innerHTML = `<span><b>${panels.length}</b> Panels</span><span><b>${live}</b> Live</span><span><b>${roles}</b> Rollen</span>`;
  }

  function wrapSettingsFetch() {
    if (fetchWrapped) return;
    fetchWrapped = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input, init = {}) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || '';
      const pathname = new URL(requestUrl, location.origin).pathname;
      const method = String(init.method || 'GET').toUpperCase();
      const match = pathname.match(/^\/api\/guilds\/(\d+)\/settings$/);

      if (match && method === 'PATCH' && typeof init.body === 'string') {
        try {
          const payload = JSON.parse(init.body);
          if (payload?.rolePanels && Array.isArray(payload.rolePanels.panels)) {
            const roleResponse = await nativeFetch(`/api/guilds/${match[1]}/role-studio`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload.rolePanels)
            });

            if (!roleResponse.ok) return roleResponse;
            delete payload.rolePanels;
            init = { ...init, body: JSON.stringify(payload) };
          }
        } catch (error) {
          console.warn('[ROLE STUDIO] Save bridge failed:', error);
        }
      }

      return nativeFetch(input, init);
    };
  }

  function installAppHooks() {
    if (typeof getInitialTab === 'function') {
      const originalGetInitialTab = getInitialTab;
      getInitialTab = function getInitialTabWithRoles() {
        if (new URLSearchParams(location.search).get('tab') === 'roles') return 'roles';
        return originalGetInitialTab();
      };
    }

    if (typeof activeModuleCount === 'function') {
      const originalActiveModuleCount = activeModuleCount;
      activeModuleCount = function activeModuleCountWithRoles(settings) {
        return originalActiveModuleCount(settings) + (settings?.rolePanels?.enabled ? 1 : 0);
      };
    }

    if (typeof renderGuildWorkspace === 'function') {
      const originalRenderWorkspace = renderGuildWorkspace;
      renderGuildWorkspace = function renderGuildWorkspaceWithRoles(tab) {
        if (tab === 'roles') {
          renderRoleStudio();
          return;
        }
        originalRenderWorkspace(tab);
        if (tab === 'overview') decorateOverview();
      };
    }

    if (typeof renderGuildShell === 'function') {
      const originalRenderShell = renderGuildShell;
      renderGuildShell = function renderGuildShellWithRoles() {
        originalRenderShell();
        ensureRoleNav();
        patchModuleCount();
      };
    }
  }

  function ensureRoleNav() {
    const nav = document.querySelector('.deck-nav');
    if (!nav || nav.querySelector('[data-tab="roles"]')) return;

    const commands = nav.querySelector('[data-tab="commands"]');
    if (!commands) return;

    const button = document.createElement('button');
    button.className = `deck-nav-item${activeTab === 'roles' ? ' active' : ''}`;
    button.dataset.tab = 'roles';
    button.type = 'button';
    button.innerHTML = `${typeof icon === 'function' ? icon('shield') : ''}<span>Role Studio</span><small><span class="state-dot ${moduleEnabled() ? 'on' : ''}"></span><span>${moduleEnabled() ? 'Aktiv' : 'Aus'}</span></small>`;
    commands.insertAdjacentElement('afterend', button);
  }

  function patchModuleCount() {
    const meta = document.querySelector('.command-meta');
    if (meta?.children?.[1]) {
      meta.children[1].textContent = `${activeModuleCount(workingSettings)}/5 Module aktiv`;
    }
  }

  function decorateOverview() {
    const list = document.querySelector('#guildWorkspace .module-list');
    if (list && !list.querySelector('[data-role-overview-row]')) {
      const row = document.createElement('div');
      row.className = 'module-row';
      row.dataset.roleOverviewRow = '1';
      row.innerHTML = `
        <div class="module-row-icon">${typeof icon === 'function' ? icon('shield') : ''}</div>
        <div><b>Role Studio</b><span>Buttons, Dropdowns und Reaction-Roles als visuelle Panels</span></div>
        <div class="module-row-state ${moduleEnabled() ? 'on' : ''}">${moduleEnabled() ? 'AKTIV' : 'AUS'}</div>
        <button class="mini-button" type="button" data-open-role-studio>Konfigurieren ${typeof icon === 'function' ? icon('arrow') : ''}</button>`;
      list.appendChild(row);
      row.querySelector('[data-open-role-studio]').addEventListener('click', () => switchTab('roles'));
    }

    const telemetry = document.querySelector('#guildWorkspace .telemetry-card small');
    if (telemetry && telemetry.textContent.includes('von 4')) telemetry.textContent = 'von 5 konfigurierbar';
  }

  function panelNav(panel, index) {
    const [code] = modeMeta(panel.mode);
    return `
      <button type="button" class="role-panel-nav ${panel.id === selectedPanelId ? 'active' : ''}" data-select-panel="${esc(panel.id)}">
        <span class="role-panel-number">${String(index + 1).padStart(2, '0')}</span>
        <span class="role-panel-nav-copy">
          <b>${esc(panel.name)}</b>
          <small>${code} · ${panel.items?.length || 0} Rollen</small>
        </span>
        <span class="role-live-dot ${published(panel) ? 'live' : ''}" title="${published(panel) ? 'Veröffentlicht' : 'Entwurf'}"></span>
      </button>`;
  }

  function emptyStudio() {
    return `
      <div class="role-onboarding">
        <span>ROLE STUDIO</span>
        <h3>Baue Rollen wie ein Produkt.</h3>
        <p>Starte leer oder nimm eine Vorlage. Danach ordnest du nur noch die echten Discord-Rollen zu.</p>
        <div class="role-template-grid">
          <button type="button" data-new-template="blank"><b>Blank</b><small>Komplett frei starten</small></button>
          <button type="button" data-new-template="gaming"><b>Gaming</b><small>Mehrfachauswahl für Games</small></button>
          <button type="button" data-new-template="pronouns"><b>Pronomen</b><small>Exklusive Einzelauswahl</small></button>
          <button type="button" data-new-template="notifications"><b>Pings</b><small>Dropdown für Benachrichtigungen</small></button>
        </div>
      </div>`;
  }

  function panelHeader(panel) {
    const live = published(panel);
    const url = live
      ? `https://discord.com/channels/${activeGuildData.guild.id}/${panel.publishedChannelId}/${panel.messageId}`
      : '';

    return `
      <div class="role-panel-commandbar">
        <div class="role-panel-state ${live ? 'live' : ''}">
          <span></span>
          <div><b>${live ? 'LIVE PANEL' : 'DRAFT'}</b><small>${live ? 'Discord-Nachricht verbunden' : 'Noch nicht veröffentlicht'}</small></div>
        </div>
        <label class="role-inline-field name">
          <span>INTERNER NAME</span>
          <input data-panel-name maxlength="60" value="${esc(panel.name)}">
        </label>
        <label class="role-inline-switch">
          <input type="checkbox" data-panel-enabled ${panel.enabled !== false ? 'checked' : ''}>
          <span></span><b>${panel.enabled !== false ? 'Aktiv' : 'Pausiert'}</b>
        </label>
        <div class="role-panel-actions">
          ${live ? `<a class="role-small-button" href="${url}" target="_blank" rel="noopener">Discord ↗</a>` : ''}
          <button type="button" class="role-small-button" data-duplicate-panel>Duplizieren</button>
          <button type="button" class="role-small-button danger" data-delete-panel>Löschen</button>
        </div>
      </div>`;
  }

  function modeSelector(panel) {
    return `
      <div class="role-mode-grid">
        ${['buttons', 'select', 'reactions'].map(mode => {
          const [code, label, hint] = modeMeta(mode);
          return `<button type="button" class="${panel.mode === mode ? 'active' : ''}" data-panel-mode="${mode}">
            <span>${code}</span><div><b>${label}</b><small>${hint}</small></div>
          </button>`;
        }).join('')}
      </div>`;
  }

  function roleItemRow(item, index, panel) {
    const role = roleById(item.roleId);
    return `
      <article class="role-item-row" draggable="true" data-role-item="${esc(item.id)}">
        <div class="role-item-drag" title="Ziehen zum Sortieren">⠿</div>
        <div class="role-item-index">${String(index + 1).padStart(2, '0')}</div>
        <label class="role-field role-select-field">
          <span>DISCORD-ROLLE</span>
          <select data-role-id>${roleOptions(item.roleId)}</select>
        </label>
        <label class="role-field">
          <span>LABEL</span>
          <input data-role-label maxlength="80" value="${esc(item.label)}" placeholder="${esc(role?.name || 'Anzeigetext')}">
        </label>
        <label class="role-field emoji">
          <span>EMOJI</span>
          <input data-role-emoji maxlength="64" value="${esc(item.emoji)}" placeholder="🎮">
        </label>
        ${panel.mode === 'buttons' ? `
          <label class="role-field style">
            <span>STYLE</span>
            <select data-role-style>
              ${['primary','secondary','success','danger'].map(style => `<option value="${style}" ${item.style === style ? 'selected' : ''}>${style}</option>`).join('')}
            </select>
          </label>` : `
          <label class="role-field description">
            <span>${panel.mode === 'select' ? 'BESCHREIBUNG' : 'REAKTION'}</span>
            <input data-role-description maxlength="100" value="${esc(item.description)}" placeholder="${panel.mode === 'select' ? 'Optionaler Hinweis' : 'Emoji = Rolle'}" ${panel.mode === 'reactions' ? 'disabled' : ''}>
          </label>`}
        <button type="button" class="role-row-delete" data-delete-role title="Eintrag löschen">×</button>
      </article>`;
  }

  function messageEditor(panel) {
    return `
      <section class="role-config-card">
        <div class="role-section-head"><div><span>01</span><b>Nachricht</b><small>So erscheint das Panel in Discord.</small></div></div>
        <div class="role-message-grid">
          <label class="role-field"><span>TITEL</span><input data-panel-title maxlength="256" value="${esc(panel.title)}"></label>
          <label class="role-field color"><span>FARBE</span><div><input type="color" data-panel-color-picker value="${esc(panel.color)}"><input data-panel-color maxlength="7" value="${esc(panel.color)}"></div></label>
          <label class="role-field full"><span>BESCHREIBUNG</span><textarea data-panel-description rows="5" maxlength="3500">${esc(panel.description)}</textarea></label>
          ${panel.mode === 'select' ? `<label class="role-field full"><span>DROPDOWN-PLATZHALTER</span><input data-panel-placeholder maxlength="150" value="${esc(panel.placeholder)}"></label>` : ''}
        </div>
      </section>`;
  }

  function behaviorEditor(panel) {
    return `
      <section class="role-config-card">
        <div class="role-section-head"><div><span>02</span><b>Verhalten</b><small>Wie Mitglieder Rollen auswählen dürfen.</small></div></div>
        ${modeSelector(panel)}
        <div class="role-behavior-grid">
          <div class="role-choice-block">
            <span>AUSWAHL</span>
            <div>
              <button type="button" data-selection-mode="multi" class="${panel.selectionMode === 'multi' ? 'active' : ''}"><b>Mehrfach</b><small>Mehrere Rollen gleichzeitig</small></button>
              <button type="button" data-selection-mode="single" class="${panel.selectionMode === 'single' ? 'active' : ''}"><b>Exklusiv</b><small>Nur eine Rolle aus dem Panel</small></button>
            </div>
          </div>
          <label class="role-remove-toggle">
            <input type="checkbox" data-allow-remove ${panel.allowRemove !== false ? 'checked' : ''} ${panel.mode === 'reactions' ? 'disabled' : ''}>
            <span></span>
            <div><b>Selbst entfernen</b><small>${panel.mode === 'reactions' ? 'Bei Reactions entspricht Entfernen der Reaktion dem Entfernen der Rolle.' : 'Mitglieder können ihre Auswahl wieder zurücknehmen.'}</small></div>
          </label>
        </div>
      </section>`;
  }

  function rolesEditor(panel) {
    return `
      <section class="role-config-card roles">
        <div class="role-section-head">
          <div><span>03</span><b>Rollen</b><small>Ordne Discord-Rollen, Labels und Darstellung zu.</small></div>
          <div class="role-section-actions">
            <button type="button" data-import-roles>Verfügbare Rollen übernehmen</button>
            <button type="button" data-add-role>+ Rolle</button>
          </div>
        </div>
        <div class="role-items">
          ${panel.items?.length
            ? panel.items.map((item, index) => roleItemRow(item, index, panel)).join('')
            : `<div class="role-items-empty"><b>Noch keine Rollen.</b><span>Füge einen Eintrag hinzu oder übernimm verfügbare Server-Rollen.</span><button type="button" data-add-role>Erste Rolle hinzufügen</button></div>`}
        </div>
        <div class="role-items-foot"><span>${panel.items?.length || 0}/${MAX_ITEMS} Einträge</span><span>Drag & Drop zum Sortieren</span></div>
      </section>`;
  }

  function renderMarkdown(value) {
    return esc(value || '')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replaceAll('\n', '<br>');
  }

  function previewContent(panel) {
    const items = panel.items || [];
    let controls = '';

    if (panel.mode === 'buttons') {
      controls = `<div class="role-preview-buttons">${items.map(item =>
        `<button class="${esc(item.style || 'secondary')}" type="button">${item.emoji ? `<span>${esc(item.emoji)}</span>` : ''}${esc(item.label || roleById(item.roleId)?.name || 'Rolle')}</button>`
      ).join('')}</div>`;
    } else if (panel.mode === 'select') {
      controls = `
        <div class="role-preview-select">
          <span>${esc(panel.placeholder || 'Rollen auswählen …')}</span><b>⌄</b>
        </div>
        <div class="role-preview-options">
          ${items.slice(0, 5).map(item => `<span>${item.emoji ? esc(item.emoji) : '•'} ${esc(item.label || roleById(item.roleId)?.name || 'Rolle')}</span>`).join('')}
          ${items.length > 5 ? `<span>+ ${items.length - 5} weitere</span>` : ''}
        </div>`;
    } else {
      controls = `<div class="role-preview-reactions">${items.map(item =>
        `<span>${esc(item.emoji || '▫️')} <b>1</b><small>${esc(item.label || roleById(item.roleId)?.name || 'Rolle')}</small></span>`
      ).join('')}</div>`;
    }

    return `
      <div class="role-discord-message">
        <div class="role-preview-avatar">O</div>
        <div class="role-preview-message-body">
          <div class="role-preview-author"><b>ORBIT</b><span>APP</span><small>Heute um 09:41</small></div>
          <div class="role-preview-embed" style="--role-color:${esc(panel.color || '#5865F2')}">
            <h4>${esc(panel.title || 'Wähle deine Rollen')}</h4>
            ${panel.description ? `<p>${renderMarkdown(panel.description)}</p>` : ''}
            <small>${panel.selectionMode === 'single' ? 'Eine Rolle aus dieser Gruppe' : 'Mehrere Rollen möglich'}</small>
          </div>
          ${controls}
        </div>
      </div>`;
  }

  function readiness(panel) {
    const checks = [
      ['MASTER', moduleEnabled(), moduleEnabled() ? 'Role Studio aktiv' : 'Wird beim Veröffentlichen aktiviert'],
      ['PANEL', panel.enabled !== false, panel.enabled !== false ? 'Panel aktiv' : 'Panel ist pausiert'],
      ['CHANNEL', Boolean(panel.channelId), panel.channelId ? `#${channelById(panel.channelId)?.name || 'Kanal'}` : 'Zielkanal fehlt'],
      ['ROLES', panel.items?.length > 0 && panel.items.every(item => item.roleId), panel.items?.length ? `${panel.items.filter(item => item.roleId).length}/${panel.items.length} zugeordnet` : 'Keine Rollen'],
      ['HIERARCHY', activeGuildData?.capabilities?.canManageRoles !== false, activeGuildData?.capabilities?.canManageRoles !== false ? 'Bot kann Rollen verwalten' : 'Manage Roles fehlt']
    ];
    if (panel.mode === 'reactions') {
      checks.push(['EMOJIS', panel.items?.length > 0 && panel.items.every(item => item.emoji), panel.items?.every(item => item.emoji) ? 'Alle Reactions gesetzt' : 'Emoji fehlt']);
    }

    return checks.map(([code, ok, text]) => `
      <div class="role-ready-row ${ok ? 'ok' : 'warn'}"><span>${ok ? '✓' : '!'}</span><b>${code}</b><small>${esc(text)}</small></div>`
    ).join('');
  }

  function previewPanel(panel) {
    const live = published(panel);
    const ready = panelReady(panel);
    const channel = channelById(panel.channelId);
    const liveUrl = live ? `https://discord.com/channels/${activeGuildData.guild.id}/${panel.publishedChannelId}/${panel.messageId}` : '';

    return `
      <div class="role-preview-stack">
        <div class="role-preview-console">
          <div class="role-preview-top"><span>LIVE DISCORD PREVIEW</span><b>${channel ? `#${esc(channel.name)}` : '#zielkanal'}</b></div>
          ${previewContent(panel)}
          <div class="role-preview-foot">Preview · ${modeMeta(panel.mode)[1]} · ${panel.selectionMode === 'single' ? 'Single Choice' : 'Multi Role'}</div>
        </div>

        <div class="role-readiness">
          <div class="role-readiness-head"><span>PUBLISH CHECK</span><b>${ready ? 'READY' : 'SETUP'}</b></div>
          ${readiness(panel)}
        </div>

        <div class="role-publish-card ${live ? 'live' : ''}">
          <div>
            <span>${live ? 'VERÖFFENTLICHT' : 'ENTWURF'}</span>
            <b>${live ? 'Panel mit Discord verbunden' : 'Bereit für den ersten Publish'}</b>
            <small>${live && panel.publishedAt ? `Zuletzt veröffentlicht: ${new Date(panel.publishedAt).toLocaleString('de-DE')}` : 'Speichern und direkt als Bot-Nachricht veröffentlichen.'}</small>
          </div>
          <button type="button" class="role-publish-button" data-publish-panel>
            ${live ? 'Panel aktualisieren' : (moduleEnabled() ? 'Panel veröffentlichen' : 'Aktivieren & veröffentlichen')}
          </button>
          ${live ? `<div class="role-publish-links"><a href="${liveUrl}" target="_blank" rel="noopener">Nachricht öffnen ↗</a><button type="button" data-unpublish-panel>Unpublish</button></div>` : ''}
        </div>
      </div>`;
  }

  function panelWorkspace(panel) {
    return `
      ${panelHeader(panel)}
      <div class="role-builder-grid">
        <div class="role-editor-column">
          <section class="role-target-strip">
            <label class="role-field"><span>ZIELKANAL</span><select data-panel-channel>${channelOptions(panel.channelId)}</select></label>
            <div class="role-target-hint"><span>${activeGuildData?.channels?.length || 0}</span><small>beschreibbare Kanäle</small></div>
          </section>
          ${messageEditor(panel)}
          ${behaviorEditor(panel)}
          ${rolesEditor(panel)}
        </div>
        <aside class="role-preview-column">
          ${previewPanel(panel)}
        </aside>
      </div>`;
  }

  function studioMarkup() {
    const state = roleState();
    state.panels.forEach(ensurePanel);
    const panel = selectedPanel();
    const live = state.panels.filter(published).length;

    return `
      <div class="role-studio">
        <div class="role-studio-toolbar">
          <div class="role-studio-title"><span>COMMUNITY / ROLE STUDIO</span><b>Self-Service Roles</b><small>Baue, prüfe und veröffentliche Rollen-Panels ohne Discord-Fummelei.</small></div>
          <div class="role-studio-stats" data-role-stats><span><b>${state.panels.length}</b> Panels</span><span><b>${live}</b> Live</span><span><b>${state.panels.reduce((sum, p) => sum + (p.items?.length || 0), 0)}</b> Rollen</span></div>
          <label class="role-master-switch">
            <input type="checkbox" data-role-master ${state.enabled ? 'checked' : ''}>
            <span></span><div><b>Role Studio</b><small>${state.enabled ? 'Aktiv' : 'Aus'}</small></div>
          </label>
          <button type="button" class="button button-primary" data-new-panel ${state.panels.length >= MAX_PANELS ? 'disabled' : ''}>+ Neues Panel</button>
        </div>

        <div class="role-studio-body">
          <aside class="role-panel-sidebar">
            <div class="role-sidebar-head"><span>PANELS</span><b>${state.panels.length}/${MAX_PANELS}</b></div>
            <div class="role-panel-list">${state.panels.map(panelNav).join('')}</div>
            <div class="role-sidebar-foot"><span>BTN</span><span>SEL</span><span>RXN</span><small>3 Interaktionsarten</small></div>
          </aside>
          <section class="role-panel-stage">${panel ? panelWorkspace(panel) : emptyStudio()}</section>
        </div>
      </div>`;
  }

  function renderRoleStudio() {
    const workspace = document.querySelector('#guildWorkspace');
    if (!workspace) return;
    workspace.innerHTML = studioMarkup();
    wireStudio();
  }

  function updatePreview() {
    const panel = selectedPanel();
    const column = document.querySelector('.role-preview-column');
    if (panel && column) column.innerHTML = previewPanel(panel);
    wirePreviewButtons();
  }

  function updateSelectedPanelNav() {
    const panel = selectedPanel();
    if (!panel) return;
    const nav = document.querySelector(`.role-panel-nav[data-select-panel="${CSS.escape(panel.id)}"]`);
    if (nav) {
      const copy = nav.querySelector('.role-panel-nav-copy b');
      if (copy) copy.textContent = panel.name;
    }
  }

  function addPanel(template = 'blank') {
    const state = roleState();
    if (!state || state.panels.length >= MAX_PANELS) return;
    const panel = newPanel(template);
    state.panels.push(panel);
    selectedPanelId = panel.id;
    touch(false);
    renderRoleStudio();
  }

  function addRole(panel) {
    if (!panel || panel.items.length >= MAX_ITEMS) return;
    panel.items.push({
      id: newId('role'),
      roleId: '',
      label: '',
      emoji: '',
      description: '',
      style: 'secondary'
    });
    touch(false);
    renderRoleStudio();
  }

  function importRoles(panel) {
    if (!panel) return;
    const used = new Set(panel.items.map(item => item.roleId).filter(Boolean));
    for (const role of activeGuildData.roles || []) {
      if (panel.items.length >= MAX_ITEMS) break;
      if (used.has(role.id)) continue;
      panel.items.push({
        id: newId('role'),
        roleId: role.id,
        label: role.name,
        emoji: '',
        description: '',
        style: 'secondary'
      });
      used.add(role.id);
    }
    touch(false);
    renderRoleStudio();
  }

  function duplicatePanel(panel) {
    const state = roleState();
    if (!panel || state.panels.length >= MAX_PANELS) return;
    const clonePanel = JSON.parse(JSON.stringify(panel));
    clonePanel.id = newId('panel');
    clonePanel.name = `${panel.name} Kopie`.slice(0, 60);
    clonePanel.messageId = '';
    clonePanel.publishedChannelId = '';
    clonePanel.publishedAt = '';
    clonePanel.items = clonePanel.items.map(item => ({ ...item, id: newId('role') }));
    state.panels.splice(state.panels.indexOf(panel) + 1, 0, clonePanel);
    selectedPanelId = clonePanel.id;
    touch(false);
    renderRoleStudio();
  }

  async function saveRoleStudioDraft() {
    const state = roleState();
    const result = await api(`/api/guilds/${activeGuildData.guild.id}/role-studio`, {
      method: 'PATCH',
      body: JSON.stringify(state)
    });

    workingSettings.rolePanels = clone(result.rolePanels);
    savedSettings.rolePanels = clone(result.rolePanels);
    if (activeGuildData.settings) activeGuildData.settings.rolePanels = clone(result.rolePanels);
    selectedPanelId = result.rolePanels.panels.some(panel => panel.id === selectedPanelId)
      ? selectedPanelId
      : result.rolePanels.panels[0]?.id || null;
    markDirty();
    return result;
  }

  async function publishSelectedPanel() {
    let panel = selectedPanel();
    if (!panel) return;

    const button = document.querySelector('[data-publish-panel]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Veröffentlicht …';
    }

    try {
      if (!roleState().enabled) roleState().enabled = true;
      panel.enabled = true;
      touch();

      await saveRoleStudioDraft();
      panel = selectedPanel();

      const wasLive = published(panel);
      const result = await api(`/api/guilds/${activeGuildData.guild.id}/role-studio/${panel.id}/publish`, {
        method: 'POST'
      });

      workingSettings.rolePanels = clone(result.rolePanels);
      savedSettings.rolePanels = clone(result.rolePanels);
      if (activeGuildData.settings) activeGuildData.settings.rolePanels = clone(result.rolePanels);
      markDirty();
      toast(wasLive ? 'Rollen-Panel aktualisiert.' : 'Rollen-Panel veröffentlicht.');
      renderGuildShell();
    } catch (error) {
      toast(error.message, 'error');
      renderRoleStudio();
    }
  }

  async function unpublishSelectedPanel() {
    const panel = selectedPanel();
    if (!panel) return;

    try {
      const result = await api(`/api/guilds/${activeGuildData.guild.id}/role-studio/${panel.id}/unpublish`, {
        method: 'POST'
      });
      workingSettings.rolePanels = clone(result.rolePanels);
      savedSettings.rolePanels = clone(result.rolePanels);
      if (activeGuildData.settings) activeGuildData.settings.rolePanels = clone(result.rolePanels);
      markDirty();
      toast('Rollen-Panel aus Discord entfernt.');
      renderRoleStudio();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function wirePreviewButtons() {
    document.querySelector('[data-publish-panel]')?.addEventListener('click', publishSelectedPanel);
    document.querySelector('[data-unpublish-panel]')?.addEventListener('click', unpublishSelectedPanel);
  }

  function wireItem(row, panel) {
    const item = panel.items.find(entry => entry.id === row.dataset.roleItem);
    if (!item) return;

    row.addEventListener('dragstart', event => {
      dragItemId = item.id;
      event.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      dragItemId = null;
      row.classList.remove('dragging');
      document.querySelectorAll('.role-item-row.drag-target').forEach(el => el.classList.remove('drag-target'));
    });
    row.addEventListener('dragover', event => {
      event.preventDefault();
      if (dragItemId && dragItemId !== item.id) row.classList.add('drag-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-target'));
    row.addEventListener('drop', event => {
      event.preventDefault();
      row.classList.remove('drag-target');
      if (!dragItemId || dragItemId === item.id) return;
      const from = panel.items.findIndex(entry => entry.id === dragItemId);
      const to = panel.items.findIndex(entry => entry.id === item.id);
      if (from === -1 || to === -1) return;
      const [moved] = panel.items.splice(from, 1);
      panel.items.splice(to, 0, moved);
      touch(false);
      renderRoleStudio();
    });

    const roleSelect = row.querySelector('[data-role-id]');
    roleSelect.addEventListener('change', () => {
      item.roleId = roleSelect.value;
      const role = roleById(item.roleId);
      if (role && !item.label.trim()) {
        item.label = role.name;
        row.querySelector('[data-role-label]').value = role.name;
      }
      touch();
    });

    row.querySelector('[data-role-label]').addEventListener('input', event => {
      item.label = event.target.value;
      touch();
    });
    row.querySelector('[data-role-emoji]').addEventListener('input', event => {
      item.emoji = event.target.value;
      touch();
    });
    row.querySelector('[data-role-style]')?.addEventListener('change', event => {
      item.style = event.target.value;
      touch();
    });
    row.querySelector('[data-role-description]')?.addEventListener('input', event => {
      item.description = event.target.value;
      touch();
    });
    row.querySelector('[data-delete-role]').addEventListener('click', () => {
      panel.items = panel.items.filter(entry => entry.id !== item.id);
      touch(false);
      renderRoleStudio();
    });
  }

  function wireStudio() {
    const state = roleState();
    const panel = selectedPanel();

    document.querySelector('[data-role-master]')?.addEventListener('change', event => {
      state.enabled = event.target.checked;
      touch(false);
      renderGuildShell();
    });

    document.querySelector('[data-new-panel]')?.addEventListener('click', () => addPanel('blank'));
    document.querySelectorAll('[data-new-template]').forEach(button =>
      button.addEventListener('click', () => addPanel(button.dataset.newTemplate))
    );
    document.querySelectorAll('[data-select-panel]').forEach(button =>
      button.addEventListener('click', () => {
        selectedPanelId = button.dataset.selectPanel;
        renderRoleStudio();
      })
    );

    if (!panel) return;

    document.querySelector('[data-panel-name]').addEventListener('input', event => {
      panel.name = event.target.value;
      touch(false);
      updateSelectedPanelNav();
    });
    document.querySelector('[data-panel-enabled]').addEventListener('change', event => {
      panel.enabled = event.target.checked;
      touch();
    });
    document.querySelector('[data-panel-channel]').addEventListener('change', event => {
      panel.channelId = event.target.value;
      touch();
    });
    document.querySelector('[data-panel-title]').addEventListener('input', event => {
      panel.title = event.target.value;
      touch();
    });
    document.querySelector('[data-panel-description]').addEventListener('input', event => {
      panel.description = event.target.value;
      touch();
    });
    document.querySelector('[data-panel-placeholder]')?.addEventListener('input', event => {
      panel.placeholder = event.target.value;
      touch();
    });

    const colorText = document.querySelector('[data-panel-color]');
    const colorPicker = document.querySelector('[data-panel-color-picker]');
    colorText.addEventListener('input', event => {
      panel.color = event.target.value;
      if (/^#[0-9a-f]{6}$/i.test(panel.color)) colorPicker.value = panel.color;
      touch();
    });
    colorPicker.addEventListener('input', event => {
      panel.color = event.target.value.toUpperCase();
      colorText.value = panel.color;
      touch();
    });

    document.querySelectorAll('[data-panel-mode]').forEach(button =>
      button.addEventListener('click', () => {
        panel.mode = button.dataset.panelMode;
        if (panel.mode === 'reactions') panel.allowRemove = true;
        touch(false);
        renderRoleStudio();
      })
    );

    document.querySelectorAll('[data-selection-mode]').forEach(button =>
      button.addEventListener('click', () => {
        panel.selectionMode = button.dataset.selectionMode;
        touch(false);
        renderRoleStudio();
      })
    );

    document.querySelector('[data-allow-remove]').addEventListener('change', event => {
      panel.allowRemove = event.target.checked;
      touch();
    });

    document.querySelectorAll('[data-add-role]').forEach(button => button.addEventListener('click', () => addRole(panel)));
    document.querySelector('[data-import-roles]')?.addEventListener('click', () => importRoles(panel));
    document.querySelector('[data-duplicate-panel]').addEventListener('click', () => duplicatePanel(panel));
    document.querySelector('[data-delete-panel]').addEventListener('click', async () => {
      try {
        if (published(panel)) {
          const result = await api(`/api/guilds/${activeGuildData.guild.id}/role-studio/${panel.id}/unpublish`, {
            method: 'POST'
          });
          workingSettings.rolePanels = clone(result.rolePanels);
          savedSettings.rolePanels = clone(result.rolePanels);
        }

        const currentState = roleState();
        currentState.panels = currentState.panels.filter(entry => entry.id !== panel.id);
        selectedPanelId = currentState.panels[0]?.id || null;
        touch(false);
        renderRoleStudio();
      } catch (error) {
        toast(error.message, 'error');
      }
    });

    document.querySelectorAll('.role-item-row').forEach(row => wireItem(row, panel));
    wirePreviewButtons();
  }

  wrapSettingsFetch();
  installAppHooks();

  const observer = new MutationObserver(() => {
    if (!document.querySelector('.deck-nav')) return;
    ensureRoleNav();
    patchModuleCount();
    if (activeTab === 'overview') decorateOverview();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
