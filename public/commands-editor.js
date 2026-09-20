(() => {
  const MAX_COMMANDS = 50;
  const MAX_BLOCKS = 12;
  const MAX_BUTTONS = 5;
  const MAX_EMBEDS = 3;
  const BLOCK_META = {
    text: { code: 'TXT', title: 'Text', hint: 'Freier Nachrichtentext' },
    embed: { code: 'EMB', title: 'Embed', hint: 'Titel, Text, Farbe und Bild' },
    button: { code: 'URL', title: 'Link Button', hint: 'Klickbarer Discord-Button' },
    random: { code: 'RND', title: 'Zufall', hint: 'Eine von mehreren Antworten' }
  };

  let selectedCommandId = null;
  let lastTemplateField = null;
  const previewArgs = new Map();
  const previewRolls = new Map();
  let dragPayload = null;
  let fetchWrapped = false;

  function escape(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function newId(prefix = 'id') {
    if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeTrigger(value) {
    let trigger = String(value || '').trim().toLowerCase();
    if (trigger && !trigger.startsWith('!')) trigger = `!${trigger}`;
    return trigger;
  }

  function commandsState() {
    if (typeof workingSettings === 'undefined' || !workingSettings?.customCommands) return null;
    if (!Array.isArray(workingSettings.customCommands.commands)) workingSettings.customCommands.commands = [];
    workingSettings.customCommands.commands.forEach(ensureFlow);
    if (!selectedCommandId || !workingSettings.customCommands.commands.some(command => command.id === selectedCommandId)) {
      selectedCommandId = workingSettings.customCommands.commands[0]?.id || null;
    }
    return workingSettings.customCommands.commands;
  }

  function ensureFlow(command) {
    if (!command.id) command.id = newId('cmd');
    command.trigger = normalizeTrigger(command.trigger) || '!command';
    command.enabled = command.enabled !== false;
    command.cooldownSeconds = Math.max(0, Math.min(3600, Number(command.cooldownSeconds) || 0));
    command.delivery = command.delivery === 'reply' ? 'reply' : 'send';
    if (!Array.isArray(command.blocks) || !command.blocks.length) {
      const legacy = String(command.response || '').trim() || 'Hey {user}!';
      command.blocks = [{ id: newId('block'), type: 'text', text: legacy }];
    }
    command.blocks.forEach(block => {
      if (!block.id) block.id = newId('block');
      if (!BLOCK_META[block.type]) block.type = 'text';
      if (block.type === 'text') block.text = String(block.text || '');
      if (block.type === 'embed') {
        block.title = String(block.title || '');
        block.description = String(block.description || '');
        block.footer = String(block.footer || '');
        block.color = /^#[0-9a-f]{6}$/i.test(String(block.color || '')) ? String(block.color).toUpperCase() : '#5865F2';
        block.imageUrl = String(block.imageUrl || '');
      }
      if (block.type === 'button') {
        block.label = String(block.label || 'Mehr erfahren');
        block.url = String(block.url || 'https://example.com');
      }
      if (block.type === 'random') {
        block.options = Array.isArray(block.options) && block.options.length
          ? block.options.map(option => String(option))
          : ['Antwort A', 'Antwort B'];
      }
    });
    syncLegacyResponse(command);
    return command;
  }

  function syncLegacyResponse(command) {
    const fallback = command.blocks.find(block => block.type === 'text')?.text ||
      command.blocks.find(block => block.type === 'random')?.options?.[0] ||
      command.blocks.find(block => block.type === 'embed')?.description ||
      command.blocks.find(block => block.type === 'embed')?.title ||
      '[Flow Command]';
    command.response = String(fallback).slice(0, 1800);
  }

  function uniqueTrigger(base = '!command') {
    const commands = commandsState() || [];
    const used = new Set(commands.map(item => normalizeTrigger(item.trigger)));
    let candidate = normalizeTrigger(base) || '!command';
    if (!used.has(candidate)) return candidate;
    const plain = candidate.replace(/^!/, '').replace(/\d+$/, '') || 'command';
    let index = 2;
    while (used.has(`!${plain}${index}`)) index += 1;
    return `!${plain}${index}`;
  }

  function makeBlock(type) {
    if (type === 'embed') {
      return { id: newId('block'), type, title: 'Information', description: 'Hey {user}, hier kannst du deine Embed-Nachricht bauen.', footer: '', color: '#5865F2', imageUrl: '' };
    }
    if (type === 'button') {
      return { id: newId('block'), type, label: 'Mehr erfahren', url: 'https://example.com' };
    }
    if (type === 'random') {
      return { id: newId('block'), type, options: ['Antwort A', 'Antwort B', 'Antwort C'] };
    }
    return { id: newId('block'), type: 'text', text: 'Hey {user}!' };
  }

  function commandTemplate() {
    return ensureFlow({
      id: newId('cmd'),
      trigger: uniqueTrigger('!command'),
      response: 'Hey {user}!',
      enabled: true,
      cooldownSeconds: 5,
      delivery: 'send',
      blocks: [makeBlock('text')]
    });
  }

  function selectedCommand() {
    return (commandsState() || []).find(command => command.id === selectedCommandId) || null;
  }

  function touch(command = selectedCommand()) {
    if (command) syncLegacyResponse(command);
    if (typeof markDirty === 'function') markDirty();
    updatePreview();
    updateCommandNav(command);
    updateStudioStats();
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
          const custom = payload?.customCommands;
          if (custom && Array.isArray(custom.commands)) {
            const builderResponse = await nativeFetch(`/api/guilds/${match[1]}/command-builder`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: Boolean(custom.enabled), commands: custom.commands })
            });
            if (!builderResponse.ok) return builderResponse;
            delete custom.commands;
            init = { ...init, body: JSON.stringify(payload) };
          }
        } catch (error) {
          console.warn('[COMMAND BUILDER] Could not prepare builder save:', error);
        }
      }

      return nativeFetch(input, init);
    };
  }

  function commandNavItem(command, index) {
    const active = command.id === selectedCommandId;
    const blockCount = command.blocks?.length || 0;
    return `
      <button type="button" class="flow-command-nav ${active ? 'active' : ''}" data-select-command="${escape(command.id)}" data-command-search="${escape(`${command.trigger} ${command.response}`.toLowerCase())}">
        <span class="flow-command-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="flow-command-copy"><b>${escape(command.trigger)}</b><small>${blockCount} Baustein${blockCount === 1 ? '' : 'e'} · ${command.cooldownSeconds || 0}s</small></span>
        <i class="flow-status-dot ${command.enabled !== false ? 'on' : ''}"></i>
      </button>`;
  }

  function blockPalette() {
    return `
      <aside class="flow-palette">
        <div class="flow-panel-head"><span>BAUSTEINE</span><b>DRAG / CLICK</b></div>
        <div class="flow-palette-list">
          ${Object.entries(BLOCK_META).map(([type, meta]) => `
            <button type="button" draggable="true" class="flow-palette-item" data-add-block="${type}">
              <span>${meta.code}</span><div><b>${meta.title}</b><small>${meta.hint}</small></div><i>+</i>
            </button>`).join('')}
        </div>
        <div class="flow-panel-head secondary"><span>VARIABLEN</span><b>INSERT</b></div>
        <div class="flow-token-grid">
          ${['{user}','{username}','{displayName}','{server}','{channel}','{args}'].map(token => `<button type="button" data-flow-token="${token}">${token}</button>`).join('')}
        </div>
        <div class="flow-limits">
          <span>Bausteine <b>${MAX_BLOCKS}</b></span>
          <span>Embeds <b>${MAX_EMBEDS}</b></span>
          <span>Buttons <b>${MAX_BUTTONS}</b></span>
        </div>
      </aside>`;
  }

  function blockHeader(block, index) {
    const meta = BLOCK_META[block.type];
    return `
      <div class="flow-block-head">
        <button type="button" draggable="true" class="flow-drag-handle" data-drag-block="${escape(block.id)}" title="Ziehen zum Sortieren">⠿</button>
        <span class="flow-block-code">${meta.code}</span>
        <div><b>${meta.title}</b><small>Block ${String(index + 1).padStart(2, '0')}</small></div>
        <div class="flow-block-actions">
          <button type="button" data-move-block="up" title="Nach oben">↑</button>
          <button type="button" data-move-block="down" title="Nach unten">↓</button>
          <button type="button" data-duplicate-block title="Duplizieren">⧉</button>
          <button type="button" data-delete-block class="danger" title="Löschen">×</button>
        </div>
      </div>`;
  }

  function textBlock(block, index) {
    return `
      <article class="flow-block" data-block-id="${escape(block.id)}">
        ${blockHeader(block, index)}
        <div class="flow-block-body">
          <label class="flow-field"><span>TEXT</span><textarea data-template-field data-block-text rows="4" maxlength="1800">${escape(block.text)}</textarea></label>
          <div class="flow-charcount"><span>Discord Markdown & Variablen unterstützt</span><b>${String(block.text || '').length}/1800</b></div>
        </div>
      </article>`;
  }

  function embedBlock(block, index) {
    return `
      <article class="flow-block embed-block" data-block-id="${escape(block.id)}">
        ${blockHeader(block, index)}
        <div class="flow-block-body flow-embed-fields">
          <label class="flow-field"><span>TITEL</span><input data-template-field data-embed-title maxlength="256" value="${escape(block.title)}" placeholder="Embed-Titel"></label>
          <label class="flow-field full"><span>BESCHREIBUNG</span><textarea data-template-field data-embed-description rows="5" maxlength="3500" placeholder="Text des Embeds …">${escape(block.description)}</textarea></label>
          <label class="flow-field"><span>FARBE</span><div class="flow-color-field"><input type="color" data-embed-color-picker value="${escape(block.color)}"><input data-embed-color maxlength="7" value="${escape(block.color)}"></div></label>
          <label class="flow-field"><span>FOOTER</span><input data-template-field data-embed-footer maxlength="512" value="${escape(block.footer)}" placeholder="Optional"></label>
          <label class="flow-field full"><span>BILD-URL</span><input data-embed-image value="${escape(block.imageUrl)}" placeholder="https://…"></label>
        </div>
      </article>`;
  }

  function buttonBlock(block, index) {
    return `
      <article class="flow-block button-block" data-block-id="${escape(block.id)}">
        ${blockHeader(block, index)}
        <div class="flow-block-body flow-two-cols">
          <label class="flow-field"><span>BUTTON-TEXT</span><input data-template-field data-button-label maxlength="80" value="${escape(block.label)}"></label>
          <label class="flow-field"><span>LINK</span><input data-button-url value="${escape(block.url)}" placeholder="https://…"></label>
        </div>
      </article>`;
  }

  function randomBlock(block, index) {
    return `
      <article class="flow-block random-block" data-block-id="${escape(block.id)}">
        ${blockHeader(block, index)}
        <div class="flow-block-body">
          <label class="flow-field"><span>ANTWORTEN · EINE PRO ZEILE</span><textarea data-template-field data-random-options rows="5" maxlength="5000">${escape((block.options || []).join('\n'))}</textarea></label>
          <div class="flow-charcount"><span>2–10 Varianten · beim Ausführen wird eine zufällig gewählt</span><b>${block.options?.length || 0} Optionen</b></div>
        </div>
      </article>`;
  }

  function blockMarkup(block, index) {
    if (block.type === 'embed') return embedBlock(block, index);
    if (block.type === 'button') return buttonBlock(block, index);
    if (block.type === 'random') return randomBlock(block, index);
    return textBlock(block, index);
  }

  function templatePreview(value, args = '') {
    let html = escape(value || '');
    html = html
      .replaceAll('{user}', '<mark>@NeuesMitglied</mark>')
      .replaceAll('{username}', 'neuesmitglied')
      .replaceAll('{displayName}', 'Neues Mitglied')
      .replaceAll('{server}', escape(activeGuildData?.guild?.name || 'Dein Server'))
      .replaceAll('{channel}', '<mark>#general</mark>')
      .replaceAll('{args}', escape(args || 'deine argumente'))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replaceAll('\n', '<br>');
    return html;
  }

  function chosenRandom(block) {
    const options = Array.isArray(block.options) && block.options.length ? block.options : ['—'];
    const raw = previewRolls.get(block.id) || 0;
    return options[raw % options.length];
  }

  function previewMarkup(command) {
    if (!command) return '';
    const args = previewArgs.get(command.id) || 'hello world';
    const textParts = [];
    const embeds = [];
    const buttons = [];

    command.blocks.forEach(block => {
      if (block.type === 'text') textParts.push(templatePreview(block.text, args));
      if (block.type === 'random') textParts.push(templatePreview(chosenRandom(block), args));
      if (block.type === 'embed') embeds.push(`
        <div class="flow-preview-embed" style="--embed-color:${escape(block.color || '#5865F2')}">
          ${block.title ? `<b>${templatePreview(block.title, args)}</b>` : ''}
          ${block.description ? `<p>${templatePreview(block.description, args)}</p>` : ''}
          ${block.imageUrl ? `<img src="${escape(block.imageUrl)}" alt="" onerror="this.style.display='none'">` : ''}
          ${block.footer ? `<small>${templatePreview(block.footer, args)}</small>` : ''}
        </div>`);
      if (block.type === 'button') buttons.push(`<span class="flow-preview-button">${templatePreview(block.label, args)} <i>↗</i></span>`);
    });

    return `
      <div class="flow-preview-toolbar">
        <span>LIVE PREVIEW</span>
        <b>${command.delivery === 'reply' ? 'REPLY' : 'MESSAGE'}</b>
      </div>
      <div class="flow-preview-args"><span>{args}</span><input data-preview-args value="${escape(args)}" placeholder="Preview-Argumente"></div>
      <div class="flow-discord-preview">
        ${command.delivery === 'reply' ? '<div class="flow-reply-context">↳ Antwort auf @NeuesMitglied</div>' : ''}
        <div class="flow-preview-message">
          <div class="flow-preview-avatar">O</div>
          <div class="flow-preview-copy">
            <div class="flow-preview-author"><b>ORBIT</b><span>APP</span><small>Heute um 08:42</small></div>
            ${textParts.length ? `<div class="flow-preview-text">${textParts.map(text => `<p>${text}</p>`).join('')}</div>` : ''}
            ${embeds.join('')}
            ${buttons.length ? `<div class="flow-preview-buttons">${buttons.join('')}</div>` : ''}
          </div>
        </div>
      </div>
      ${command.blocks.some(block => block.type === 'random') ? '<button type="button" class="flow-roll-button" data-preview-reroll>↻ Zufall neu würfeln</button>' : ''}`;
  }

  function studioMarkup(command) {
    if (!command) {
      return `<div class="flow-no-command"><span>COMMAND STUDIO</span><strong>Noch kein Command.</strong><p>Erstelle links deinen ersten Command und baue die Antwort aus Bausteinen zusammen.</p><button type="button" class="button button-primary" data-command-add>+ Ersten Command erstellen</button></div>`;
    }

    return `
      <div class="flow-command-config">
        <label class="flow-command-switch"><input type="checkbox" data-command-enabled ${command.enabled !== false ? 'checked' : ''}><span></span></label>
        <label class="flow-meta-field trigger"><span>TRIGGER</span><input data-command-trigger maxlength="33" spellcheck="false" value="${escape(command.trigger)}"></label>
        <label class="flow-meta-field cooldown"><span>COOLDOWN</span><div><input data-command-cooldown type="number" min="0" max="3600" value="${command.cooldownSeconds || 0}"><b>s</b></div></label>
        <div class="flow-delivery"><span>AUSGABE</span><div><button type="button" data-delivery="send" class="${command.delivery !== 'reply' ? 'active' : ''}">Nachricht</button><button type="button" data-delivery="reply" class="${command.delivery === 'reply' ? 'active' : ''}">Antwort</button></div></div>
        <div class="flow-command-actions"><button type="button" data-command-duplicate>Duplizieren</button><button type="button" class="danger" data-command-delete>Löschen</button></div>
      </div>
      <div class="flow-builder-grid">
        ${blockPalette()}
        <main class="flow-canvas-panel">
          <div class="flow-panel-head"><span>COMMAND FLOW</span><b>${command.blocks.length}/${MAX_BLOCKS}</b></div>
          <div class="flow-canvas" data-flow-canvas>
            ${command.blocks.length ? command.blocks.map(blockMarkup).join('') : '<div class="flow-drop-empty"><b>Dropzone</b><span>Ziehe links einen Baustein hierher.</span></div>'}
          </div>
        </main>
        <aside class="flow-preview-panel" data-flow-preview>${previewMarkup(command)}</aside>
      </div>`;
  }

  function editorMarkup() {
    const commands = commandsState() || [];
    const active = commands.filter(command => command.enabled !== false).length;
    const command = selectedCommand();

    return `
      <section class="flow-studio" data-command-editor-mounted>
        <div class="flow-studio-toolbar">
          <div class="flow-studio-title"><span>COMMAND BUILDER</span><b>Baue Antworten wie einen Flow.</b></div>
          <div class="flow-studio-stats" data-flow-stats><span><b>${commands.length}</b> Commands</span><span><b>${active}</b> aktiv</span><span><b>${commands.reduce((sum, item) => sum + (item.blocks?.length || 0), 0)}</b> Bausteine</span></div>
          <button type="button" class="button button-primary" data-command-add ${commands.length >= MAX_COMMANDS ? 'disabled' : ''}>+ Neuer Command</button>
        </div>
        <div class="flow-studio-body">
          <aside class="flow-command-sidebar">
            <label class="flow-command-search"><span>⌕</span><input type="search" data-command-search placeholder="Commands suchen"></label>
            <div class="flow-command-list">${commands.length ? commands.map(commandNavItem).join('') : '<div class="flow-sidebar-empty">Noch keine Commands</div>'}</div>
          </aside>
          <section class="flow-stage">${studioMarkup(command)}</section>
        </div>
      </section>`;
  }

  function render() {
    const placeholder = document.querySelector('#guildWorkspace .coming-panel');
    const existing = document.querySelector('#guildWorkspace [data-command-editor-mounted]');
    if (!placeholder && !existing) return;
    commandsState();
    const target = existing || placeholder;
    target.outerHTML = editorMarkup();
    wire();
  }

  function findBlock(command, id) {
    return command?.blocks?.find(block => block.id === id) || null;
  }

  function addCommand() {
    const commands = commandsState();
    if (!commands || commands.length >= MAX_COMMANDS) return;
    const command = commandTemplate();
    commands.push(command);
    selectedCommandId = command.id;
    touch(command);
    render();
  }

  function duplicateCommand(command) {
    const commands = commandsState();
    if (!commands || commands.length >= MAX_COMMANDS || !command) return;
    const clone = JSON.parse(JSON.stringify(command));
    clone.id = newId('cmd');
    clone.trigger = uniqueTrigger(command.trigger);
    clone.blocks = clone.blocks.map(block => ({ ...block, id: newId('block') }));
    commands.splice(commands.indexOf(command) + 1, 0, clone);
    selectedCommandId = clone.id;
    touch(clone);
    render();
  }

  function addBlock(type, atIndex = null) {
    const command = selectedCommand();
    if (!command || !BLOCK_META[type] || command.blocks.length >= MAX_BLOCKS) return;
    if (type === 'button' && command.blocks.filter(block => block.type === 'button').length >= MAX_BUTTONS) return toast?.(`Maximal ${MAX_BUTTONS} Buttons pro Command.`, 'error');
    if (type === 'embed' && command.blocks.filter(block => block.type === 'embed').length >= MAX_EMBEDS) return toast?.(`Maximal ${MAX_EMBEDS} Embeds pro Command.`, 'error');
    const index = Number.isInteger(atIndex) ? atIndex : command.blocks.length;
    command.blocks.splice(index, 0, makeBlock(type));
    touch(command);
    render();
  }

  function deleteCommand(command) {
    const commands = commandsState();
    const index = commands.indexOf(command);
    if (index === -1) return;
    commands.splice(index, 1);
    selectedCommandId = commands[Math.min(index, commands.length - 1)]?.id || null;
    touch();
    render();
  }

  function updateCommandNav(command) {
    if (!command) return;
    const item = document.querySelector(`[data-select-command="${CSS.escape(command.id)}"]`);
    if (!item) return;
    const copy = item.querySelector('.flow-command-copy');
    if (copy) copy.innerHTML = `<b>${escape(command.trigger)}</b><small>${command.blocks.length} Baustein${command.blocks.length === 1 ? '' : 'e'} · ${command.cooldownSeconds || 0}s</small>`;
    item.querySelector('.flow-status-dot')?.classList.toggle('on', command.enabled !== false);
  }

  function updateStudioStats() {
    const stats = document.querySelector('[data-flow-stats]');
    const commands = commandsState() || [];
    if (!stats) return;
    const active = commands.filter(command => command.enabled !== false).length;
    stats.innerHTML = `<span><b>${commands.length}</b> Commands</span><span><b>${active}</b> aktiv</span><span><b>${commands.reduce((sum, item) => sum + item.blocks.length, 0)}</b> Bausteine</span>`;
  }

  function updatePreview() {
    const preview = document.querySelector('[data-flow-preview]');
    const command = selectedCommand();
    if (!preview || !command) return;
    preview.innerHTML = previewMarkup(command);
    wirePreview(command);
  }

  function insertToken(token) {
    const command = selectedCommand();
    if (!command) return;
    let field = lastTemplateField;
    if (!field || !document.contains(field)) field = document.querySelector('[data-template-field]');
    if (!field) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    field.value = field.value.slice(0, start) + token + field.value.slice(end);
    field.focus();
    field.setSelectionRange(start + token.length, start + token.length);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function wirePreview(command) {
    const argsField = document.querySelector('[data-preview-args]');
    argsField?.addEventListener('input', () => {
      previewArgs.set(command.id, argsField.value);
      updatePreview();
      requestAnimationFrame(() => {
        const next = document.querySelector('[data-preview-args]');
        next?.focus();
        next?.setSelectionRange(next.value.length, next.value.length);
      });
    });
    document.querySelector('[data-preview-reroll]')?.addEventListener('click', () => {
      command.blocks.filter(block => block.type === 'random').forEach(block => {
        previewRolls.set(block.id, (previewRolls.get(block.id) || 0) + 1);
      });
      updatePreview();
    });
  }

  function wireBlock(card, command) {
    const block = findBlock(command, card.dataset.blockId);
    if (!block) return;

    card.querySelectorAll('[data-template-field]').forEach(field => field.addEventListener('focus', () => { lastTemplateField = field; }));

    const onInput = (selector, setter) => {
      const field = card.querySelector(selector);
      field?.addEventListener('input', () => { setter(field.value); touch(command); });
    };

    if (block.type === 'text') onInput('[data-block-text]', value => { block.text = value; });
    if (block.type === 'embed') {
      onInput('[data-embed-title]', value => { block.title = value; });
      onInput('[data-embed-description]', value => { block.description = value; });
      onInput('[data-embed-footer]', value => { block.footer = value; });
      onInput('[data-embed-image]', value => { block.imageUrl = value; });
      const colorText = card.querySelector('[data-embed-color]');
      const colorPicker = card.querySelector('[data-embed-color-picker]');
      colorText?.addEventListener('input', () => {
        if (/^#[0-9a-f]{6}$/i.test(colorText.value)) {
          block.color = colorText.value.toUpperCase();
          colorPicker.value = block.color;
          touch(command);
        }
      });
      colorPicker?.addEventListener('input', () => {
        block.color = colorPicker.value.toUpperCase();
        colorText.value = block.color;
        touch(command);
      });
    }
    if (block.type === 'button') {
      onInput('[data-button-label]', value => { block.label = value; });
      onInput('[data-button-url]', value => { block.url = value; });
    }
    if (block.type === 'random') {
      onInput('[data-random-options]', value => {
        block.options = value.split(/\r?\n/).map(option => option.trim()).filter(Boolean).slice(0, 10);
      });
    }

    card.querySelector('[data-delete-block]')?.addEventListener('click', () => {
      command.blocks = command.blocks.filter(item => item.id !== block.id);
      touch(command);
      render();
    });
    card.querySelector('[data-duplicate-block]')?.addEventListener('click', () => {
      if (command.blocks.length >= MAX_BLOCKS) return;
      if (block.type === 'button' && command.blocks.filter(item => item.type === 'button').length >= MAX_BUTTONS) return;
      if (block.type === 'embed' && command.blocks.filter(item => item.type === 'embed').length >= MAX_EMBEDS) return;
      const clone = JSON.parse(JSON.stringify(block));
      clone.id = newId('block');
      const index = command.blocks.indexOf(block);
      command.blocks.splice(index + 1, 0, clone);
      touch(command);
      render();
    });
    card.querySelectorAll('[data-move-block]').forEach(button => button.addEventListener('click', () => {
      const from = command.blocks.indexOf(block);
      const to = button.dataset.moveBlock === 'up' ? from - 1 : from + 1;
      if (to < 0 || to >= command.blocks.length) return;
      command.blocks.splice(from, 1);
      command.blocks.splice(to, 0, block);
      touch(command);
      render();
    }));
  }

  function wireCanvas(command) {
    const canvas = document.querySelector('[data-flow-canvas]');
    if (!canvas) return;

    canvas.addEventListener('dragover', event => {
      event.preventDefault();
      canvas.classList.add('drag-over');
    });
    canvas.addEventListener('dragleave', event => {
      if (!canvas.contains(event.relatedTarget)) canvas.classList.remove('drag-over');
    });
    canvas.addEventListener('drop', event => {
      event.preventDefault();
      canvas.classList.remove('drag-over');
      const targetCard = event.target.closest('.flow-block');
      const insertAt = targetCard ? command.blocks.findIndex(block => block.id === targetCard.dataset.blockId) : command.blocks.length;
      if (!dragPayload) return;

      if (dragPayload.kind === 'new') addBlock(dragPayload.type, insertAt);
      if (dragPayload.kind === 'move') {
        const from = command.blocks.findIndex(block => block.id === dragPayload.id);
        if (from === -1) return;
        const [moved] = command.blocks.splice(from, 1);
        const corrected = from < insertAt ? insertAt - 1 : insertAt;
        command.blocks.splice(Math.max(0, corrected), 0, moved);
        touch(command);
        render();
      }
      dragPayload = null;
    });
  }

  function wireCommandConfig(command) {
    const enabled = document.querySelector('[data-command-enabled]');
    const trigger = document.querySelector('[data-command-trigger]');
    const cooldown = document.querySelector('[data-command-cooldown]');

    enabled?.addEventListener('change', () => { command.enabled = enabled.checked; touch(command); });
    trigger?.addEventListener('input', () => { command.trigger = trigger.value; touch(command); });
    trigger?.addEventListener('blur', () => { command.trigger = normalizeTrigger(trigger.value); trigger.value = command.trigger; touch(command); });
    cooldown?.addEventListener('input', () => {
      command.cooldownSeconds = Math.max(0, Math.min(3600, Number.parseInt(cooldown.value || '0', 10) || 0));
      touch(command);
    });
    document.querySelectorAll('[data-delivery]').forEach(button => button.addEventListener('click', () => {
      command.delivery = button.dataset.delivery === 'reply' ? 'reply' : 'send';
      document.querySelectorAll('[data-delivery]').forEach(item => item.classList.toggle('active', item === button));
      touch(command);
    }));
    document.querySelector('[data-command-duplicate]')?.addEventListener('click', () => duplicateCommand(command));
    document.querySelector('[data-command-delete]')?.addEventListener('click', () => deleteCommand(command));
  }

  function wire() {
    commandsState();
    const command = selectedCommand();

    document.querySelectorAll('[data-command-add]').forEach(button => button.addEventListener('click', addCommand));
    document.querySelectorAll('[data-select-command]').forEach(button => button.addEventListener('click', () => {
      selectedCommandId = button.dataset.selectCommand;
      render();
    }));

    const search = document.querySelector('.flow-command-search input');
    search?.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      document.querySelectorAll('[data-select-command]').forEach(item => {
        item.classList.toggle('hidden', Boolean(query) && !item.dataset.commandSearch.includes(query));
      });
    });

    document.querySelectorAll('[data-add-block]').forEach(button => {
      button.addEventListener('click', () => addBlock(button.dataset.addBlock));
      button.addEventListener('dragstart', event => {
        dragPayload = { kind: 'new', type: button.dataset.addBlock };
        event.dataTransfer.effectAllowed = 'copy';
      });
    });

    document.querySelectorAll('[data-flow-token]').forEach(button => button.addEventListener('click', () => insertToken(button.dataset.flowToken)));

    if (!command) return;
    wireCommandConfig(command);
    document.querySelectorAll('.flow-block').forEach(card => wireBlock(card, command));
    document.querySelectorAll('[data-drag-block]').forEach(handle => handle.addEventListener('dragstart', event => {
      dragPayload = { kind: 'move', id: handle.dataset.dragBlock };
      event.dataTransfer.effectAllowed = 'move';
    }));
    wireCanvas(command);
    wirePreview(command);
  }

  wrapSettingsFetch();

  const observer = new MutationObserver(() => {
    if (document.querySelector('#guildWorkspace .coming-panel')) render();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  render();
})();
