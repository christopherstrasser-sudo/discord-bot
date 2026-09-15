(() => {
  const MAX_COMMANDS = 50;
  let searchTerm = '';

  function escape(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function commandsState() {
    if (typeof workingSettings === 'undefined' || !workingSettings?.customCommands) return null;
    if (!Array.isArray(workingSettings.customCommands.commands)) {
      workingSettings.customCommands.commands = [];
    }
    return workingSettings.customCommands.commands;
  }

  function normalizeTrigger(value) {
    let trigger = String(value || '').trim().toLowerCase();
    if (trigger && !trigger.startsWith('!')) trigger = `!${trigger}`;
    return trigger;
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

  function newId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function commandTemplate(trigger = '!command') {
    return {
      id: newId(),
      trigger: uniqueTrigger(trigger),
      response: 'Hey {user}!',
      enabled: true,
      cooldownSeconds: 5
    };
  }

  function moduleEnabled() {
    return Boolean(workingSettings?.customCommands?.enabled);
  }

  function visibleCommands() {
    const commands = commandsState() || [];
    const query = searchTerm.trim().toLowerCase();
    if (!query) return commands;
    return commands.filter(command =>
      String(command.trigger || '').toLowerCase().includes(query) ||
      String(command.response || '').toLowerCase().includes(query)
    );
  }

  function statBlock(label, value, tone = '') {
    return `<div class="command-stat ${tone}"><span>${label}</span><b>${value}</b></div>`;
  }

  function commandCard(command, index) {
    const enabled = command.enabled !== false;
    return `
      <article class="command-editor-card ${enabled ? 'enabled' : 'disabled'}" data-command-id="${escape(command.id)}">
        <div class="command-editor-head">
          <div class="command-index">${String(index + 1).padStart(2, '0')}</div>
          <label class="command-inline-switch">
            <input type="checkbox" data-command-enabled ${enabled ? 'checked' : ''}>
            <span></span>
          </label>
          <div class="command-trigger-wrap">
            <span>TRIGGER</span>
            <input data-command-trigger maxlength="33" spellcheck="false" value="${escape(command.trigger)}" placeholder="!command">
          </div>
          <label class="command-cooldown">
            <span>COOLDOWN</span>
            <div><input data-command-cooldown type="number" min="0" max="3600" step="1" value="${Number(command.cooldownSeconds) || 0}"><b>s</b></div>
          </label>
          <div class="command-head-actions">
            <button type="button" data-command-duplicate title="Command duplizieren">Duplizieren</button>
            <button type="button" data-command-delete class="danger" title="Command löschen">Löschen</button>
          </div>
        </div>

        <div class="command-editor-body">
          <label class="command-response-field">
            <span>ANTWORT</span>
            <textarea data-command-response rows="4" maxlength="1800" placeholder="Antwort des Bots …">${escape(command.response)}</textarea>
          </label>
          <div class="command-editor-foot">
            <div class="command-variable-list">
              <span>VARIABLEN</span>
              ${['{user}','{username}','{displayName}','{server}','{channel}','{args}']
                .map(token => `<button type="button" data-command-variable="${token}">${token}</button>`).join('')}
            </div>
            <span class="command-length"><b data-command-length>${String(command.response || '').length}</b>/1800</span>
          </div>
        </div>
      </article>`;
  }

  function editorMarkup() {
    const commands = commandsState() || [];
    const shown = visibleCommands();
    const active = commands.filter(item => item.enabled !== false).length;

    return `
      <section class="command-editor-shell" data-command-editor-mounted>
        <div class="command-editor-toolbar">
          <div class="command-editor-stats">
            ${statBlock('COMMANDS', commands.length)}
            ${statBlock('AKTIV', active, 'positive')}
            ${statBlock('MODUL', moduleEnabled() ? 'ON' : 'OFF', moduleEnabled() ? 'positive' : '')}
          </div>
          <div class="command-editor-tools">
            <label class="command-search">
              <span>⌕</span>
              <input data-command-search type="search" autocomplete="off" placeholder="Commands durchsuchen" value="${escape(searchTerm)}">
            </label>
            <button type="button" class="button button-primary" data-command-add ${commands.length >= MAX_COMMANDS ? 'disabled' : ''}>+ Command</button>
          </div>
        </div>

        <div class="command-help-strip">
          <span>Trigger: <b>!name</b></span>
          <span>Argumente: <b>{args}</b></span>
          <span>Cooldown gilt pro Nutzer</span>
          <span>Maximal ${MAX_COMMANDS} Commands</span>
        </div>

        <div class="command-editor-list">
          ${shown.length
            ? shown.map(command => commandCard(command, commands.indexOf(command))).join('')
            : `<div class="command-editor-empty">
                <strong>${commands.length ? 'Keine Commands gefunden.' : 'Noch keine Custom Commands.'}</strong>
                <span>${commands.length ? 'Ändere deine Suche.' : 'Erstelle deinen ersten Command und speichere die Server-Einstellungen.'}</span>
                ${commands.length ? '' : '<button type="button" class="button button-primary" data-command-add>Ersten Command erstellen</button>'}
              </div>`}
        </div>
      </section>`;
  }

  function render() {
    const placeholder = document.querySelector('#guildWorkspace .coming-panel');
    const existing = document.querySelector('#guildWorkspace [data-command-editor-mounted]');
    if (!placeholder && !existing) return;

    const target = existing || placeholder;
    target.outerHTML = editorMarkup();
    wire();
  }

  function findCommand(card) {
    const commands = commandsState() || [];
    return commands.find(item => item.id === card.dataset.commandId) || null;
  }

  function touch() {
    if (typeof markDirty === 'function') markDirty();
  }

  function addCommand() {
    const commands = commandsState();
    if (!commands || commands.length >= MAX_COMMANDS) return;
    commands.push(commandTemplate());
    touch();
    searchTerm = '';
    if (typeof renderGuildWorkspace === 'function') renderGuildWorkspace('commands');
  }

  function duplicateCommand(source) {
    const commands = commandsState();
    if (!commands || commands.length >= MAX_COMMANDS) return;
    const clone = {
      ...source,
      id: newId(),
      trigger: uniqueTrigger(source.trigger),
      response: String(source.response || ''),
      enabled: source.enabled !== false,
      cooldownSeconds: Number(source.cooldownSeconds) || 0
    };
    const index = commands.findIndex(item => item.id === source.id);
    commands.splice(index + 1, 0, clone);
    touch();
    if (typeof renderGuildWorkspace === 'function') renderGuildWorkspace('commands');
  }

  function wireCard(card) {
    const command = findCommand(card);
    if (!command) return;

    const enabled = card.querySelector('[data-command-enabled]');
    const trigger = card.querySelector('[data-command-trigger]');
    const cooldown = card.querySelector('[data-command-cooldown]');
    const response = card.querySelector('[data-command-response]');
    const length = card.querySelector('[data-command-length]');

    enabled.addEventListener('change', () => {
      command.enabled = enabled.checked;
      card.classList.toggle('enabled', enabled.checked);
      card.classList.toggle('disabled', !enabled.checked);
      touch();
    });

    trigger.addEventListener('input', () => {
      command.trigger = trigger.value;
      touch();
    });
    trigger.addEventListener('blur', () => {
      command.trigger = normalizeTrigger(trigger.value);
      trigger.value = command.trigger;
      touch();
    });

    cooldown.addEventListener('input', () => {
      const value = Math.max(0, Math.min(3600, Number.parseInt(cooldown.value || '0', 10) || 0));
      command.cooldownSeconds = value;
      touch();
    });
    cooldown.addEventListener('blur', () => {
      cooldown.value = String(command.cooldownSeconds || 0);
    });

    response.addEventListener('input', () => {
      command.response = response.value;
      length.textContent = String(response.value.length);
      touch();
    });

    card.querySelectorAll('[data-command-variable]').forEach(button => {
      button.addEventListener('click', () => {
        const token = button.dataset.commandVariable;
        const start = response.selectionStart ?? response.value.length;
        const end = response.selectionEnd ?? response.value.length;
        response.value = response.value.slice(0, start) + token + response.value.slice(end);
        response.focus();
        response.setSelectionRange(start + token.length, start + token.length);
        command.response = response.value;
        length.textContent = String(response.value.length);
        touch();
      });
    });

    card.querySelector('[data-command-duplicate]').addEventListener('click', () => duplicateCommand(command));
    card.querySelector('[data-command-delete]').addEventListener('click', () => {
      const commands = commandsState();
      const index = commands.findIndex(item => item.id === command.id);
      if (index !== -1) commands.splice(index, 1);
      touch();
      if (typeof renderGuildWorkspace === 'function') renderGuildWorkspace('commands');
    });
  }

  function wire() {
    document.querySelectorAll('[data-command-add]').forEach(button => button.addEventListener('click', addCommand));
    document.querySelectorAll('.command-editor-card').forEach(wireCard);

    const search = document.querySelector('[data-command-search]');
    search?.addEventListener('input', () => {
      searchTerm = search.value;
      const list = document.querySelector('.command-editor-list');
      if (!list) return;
      const commands = commandsState() || [];
      const shown = visibleCommands();
      list.innerHTML = shown.length
        ? shown.map(command => commandCard(command, commands.indexOf(command))).join('')
        : '<div class="command-editor-empty"><strong>Keine Commands gefunden.</strong><span>Ändere deine Suche.</span></div>';
      document.querySelectorAll('.command-editor-card').forEach(wireCard);
    });
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('#guildWorkspace .coming-panel')) render();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  render();
})();
