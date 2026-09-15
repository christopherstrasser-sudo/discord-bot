(() => {
  const EMOJI_DATA_SOURCE = '/api/emoji-data';
  let overlay = null;
  let picker = null;
  let activeInput = null;
  let opening = false;

  const i18n = {
    categories: {
      custom: 'Eigene',
      'smileys-emotion': 'Smileys & Emotionen',
      'people-body': 'Menschen & Körper',
      'animals-nature': 'Tiere & Natur',
      'food-drink': 'Essen & Trinken',
      'travel-places': 'Reisen & Orte',
      activities: 'Aktivitäten',
      objects: 'Objekte',
      symbols: 'Symbole',
      flags: 'Flaggen'
    },
    categoriesLabel: 'Kategorien',
    emojiUnsupportedMessage: 'Dein Browser unterstützt dieses Emoji nicht.',
    favoritesLabel: 'Favoriten',
    loadingMessage: 'Emojis werden geladen …',
    networkErrorMessage: 'Emojis konnten nicht geladen werden.',
    regionLabel: 'Emoji-Auswahl',
    searchDescription: 'Suche nach einem Emoji und wähle es mit Enter oder per Klick aus.',
    searchLabel: 'Emoji suchen',
    searchResultsLabel: 'Suchergebnisse',
    skinToneDescription: 'Wähle einen Hautton.',
    skinToneLabel: 'Hautton auswählen (aktuell {skinTone})',
    skinTones: ['Standard', 'Hell', 'Mittelhell', 'Mittel', 'Mitteldunkel', 'Dunkel'],
    skinTonesLabel: 'Hauttöne'
  };

  function setEmoji(value) {
    if (!activeInput) return;
    activeInput.value = value || '';
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function closePicker() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('raku-emoji-open');
    activeInput = null;
  }

  function currentEmoji() {
    return String(activeInput?.value || '').trim() || '—';
  }

  function buildShell() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'raku-emoji-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Emoji auswählen');
    overlay.innerHTML = `
      <div class="raku-emoji-modal">
        <div class="raku-emoji-head">
          <div>
            <span>ROLE STUDIO / EMOJI</span>
            <b>Emoji auswählen</b>
            <small>Suchen, Kategorie öffnen oder Hautton wählen.</small>
          </div>
          <button type="button" class="raku-emoji-close" data-emoji-close aria-label="Schließen">×</button>
        </div>
        <div class="raku-emoji-current">
          <div><span>AKTUELL</span><b data-current-emoji>—</b></div>
          <button type="button" data-emoji-clear>Emoji entfernen</button>
        </div>
        <div class="raku-emoji-host" data-emoji-host>
          <div class="raku-emoji-loading"><span></span><b>Emoji-Bibliothek wird geladen …</b></div>
        </div>
        <div class="raku-emoji-foot">
          <span>Unicode Emoji · Suche auf Deutsch</span>
          <small>Das Feld kann weiterhin per Tastatur oder Copy & Paste befüllt werden.</small>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', event => {
      if (event.target === overlay) closePicker();
    });
    overlay.querySelector('[data-emoji-close]').addEventListener('click', closePicker);
    overlay.querySelector('[data-emoji-clear]').addEventListener('click', () => {
      setEmoji('');
      closePicker();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay?.classList.contains('open')) closePicker();
    });

    return overlay;
  }

  async function ensurePicker() {
    if (picker) return picker;
    if (opening) {
      await customElements.whenDefined('emoji-picker');
      return picker;
    }

    opening = true;
    try {
      await Promise.race([
        customElements.whenDefined('emoji-picker'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ]);

      const host = buildShell().querySelector('[data-emoji-host]');
      host.innerHTML = '';
      picker = document.createElement('emoji-picker');
      picker.className = 'raku-emoji-picker';
      picker.locale = 'de-x-raku-v074';
      picker.dataSource = EMOJI_DATA_SOURCE;
      picker.i18n = i18n;
      picker.skinToneEmoji = '👍';
      picker.emojiVersion = 16;
      picker.addEventListener('emoji-click', event => {
        const unicode = event.detail?.unicode || event.detail?.emoji?.unicode || event.detail?.emoji?.emoji || '';
        if (!unicode) return;
        setEmoji(unicode);
        closePicker();
      });
      host.appendChild(picker);
      return picker;
    } catch {
      const host = buildShell().querySelector('[data-emoji-host]');
      host.innerHTML = `
        <div class="raku-emoji-error">
          <b>Emoji-Bibliothek konnte nicht geladen werden.</b>
          <span>Du kannst das Emoji-Feld weiterhin direkt per Tastatur oder Copy & Paste benutzen.</span>
        </div>`;
      return null;
    } finally {
      opening = false;
    }
  }

  async function openPicker(input) {
    activeInput = input;
    const shell = buildShell();
    shell.querySelector('[data-current-emoji]').textContent = currentEmoji();
    shell.classList.add('open');
    document.body.classList.add('raku-emoji-open');
    await ensurePicker();

    requestAnimationFrame(() => {
      const search = picker?.shadowRoot?.querySelector('input[type="search"], input');
      search?.focus();
    });
  }

  document.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const input = event.target.closest('input[data-role-emoji]');
    if (!input) return;

    if (event.shiftKey) return;

    event.preventDefault();
    openPicker(input);
  }, true);

  document.addEventListener('focusin', event => {
    const input = event.target.closest?.('input[data-role-emoji]');
    if (input) input.title = 'Klicken für Emoji-Auswahl · Shift+Klick für manuelle Eingabe';
  });
})();