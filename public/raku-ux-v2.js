(() => {
  document.body.classList.add('raku-ux-v2');
  const D = window.RakuUxV2Data || {};

  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const tabNow = () => typeof activeTab !== 'undefined' ? activeTab : null;

  function guideMarkup(tab) {
    const g = D.guides?.[tab];
    if (!g) return '';
    return `<section class="ux-module-guide" data-ux-guide="${esc(tab)}">
      <div class="ux-guide-top">
        <div class="ux-guide-copy"><span>${esc(g.kicker)}</span><b>${esc(g.title)}</b><small>${esc(g.copy)}</small></div>
        <div class="ux-guide-steps">${g.steps.map(([title,copy],i)=>`<div class="ux-guide-step"><i>${String(i+1).padStart(2,'0')}</i><div><b>${esc(title)}</b><small>${esc(copy)}</small></div></div>`).join('')}</div>
      </div>
      ${g.glossary?.length ? `<div class="ux-guide-glossary"><span>KURZ ERKLÄRT</span>${g.glossary.map(x=>`<em>${esc(x)}</em>`).join('')}</div>` : ''}
      ${g.note ? `<div class="ux-context-note"><i>i</i><span>${esc(g.note)}</span></div>` : ''}
    </section>`;
  }

  function decorateLogin() {
    document.querySelector('#loggedOut')?.classList.add('ux-login-v2');
  }

  function decorateServerList() {
    const screen = document.querySelector('#serverList');
    const head = screen?.querySelector('.page-head');
    if (screen && head && !screen.querySelector('.ux-server-path')) {
      const node = document.createElement('section');
      node.className = 'ux-server-path';
      node.innerHTML = `
        <article><i>01</i><div><b>Server auswählen</b><small>Du siehst nur Discord-Server, die du verwalten darfst.</small></div></article>
        <article><i>02</i><div><b>Control Deck öffnen</b><small>Module sind nach Aufgabe statt nach Technik sortiert.</small></div></article>
        <article><i>03</i><div><b>Konfigurieren & speichern</b><small>Previews und Readiness-Checks zeigen dir vorab, ob alles passt.</small></div></article>`;
      head.insertAdjacentElement('afterend', node);
    }

    document.querySelectorAll('.server-card').forEach(card => {
      const connected = card.dataset.installed === 'true';
      if (!card.querySelector('.ux-server-card-help')) {
        const help = document.createElement('div');
        help.className = 'ux-server-card-help';
        help.textContent = connected
          ? 'Öffne das Control Deck, um Module zu konfigurieren, Status zu prüfen und Änderungen zu speichern.'
          : 'Füge RAKU einmalig zu diesem Server hinzu. Danach steht das komplette Control Deck zur Verfügung.';
        card.querySelector('.server-card-actions')?.insertAdjacentElement('beforebegin', help);
      }
      card.querySelectorAll('.card-action span').forEach(span => {
        const text = span.textContent.trim();
        if (text === 'Dashboard') span.textContent = 'Server verwalten';
        else if (text === 'Module') span.textContent = 'Module öffnen';
        else if (text === 'Test') span.textContent = 'Diagnose';
      });
      card.querySelector('.card-action.primary')?.classList.add('ux-primary-action');
    });
  }

  function decorateNav() {
    document.querySelectorAll('.deck-nav-item[data-tab]').forEach(item => {
      const help = D.navHelp?.[item.dataset.tab];
      if (help && item.title !== help) item.title = help;
    });
  }

  function labelKey(label) {
    const span = label.querySelector(':scope > span:first-child');
    if (span) return span.textContent.trim().replace(/\s+/g,' ').toUpperCase();
    const clone = label.cloneNode(true);
    clone.querySelectorAll('input,select,textarea,button,small,i,b,em').forEach(n=>n.remove());
    return clone.textContent.trim().replace(/\s+/g,' ').toUpperCase();
  }

  function addHints(root, tab) {
    const rules = D.fieldHints?.[tab] || [];
    if (!rules.length) return;
    root.querySelectorAll('label').forEach(label => {
      if (label.dataset.uxHint === '1') return;
      const key = labelKey(label);
      const match = rules.find(([rx]) => rx.test(key));
      if (!match) return;
      label.dataset.uxHint = '1';
      const directSmall = [...label.children].find(node => node.tagName === 'SMALL');
      if (directSmall?.textContent.trim()) return;
      const small = document.createElement('small');
      small.className = 'ux-field-help';
      small.textContent = match[1];
      label.appendChild(small);
    });
  }

  function addSectionCaptions(root, tab) {
    const captions = D.sectionCaptions?.[tab];
    if (!captions) return;
    root.querySelectorAll('section header').forEach(header => {
      if (header.querySelector('.ux-section-caption')) return;
      const tokens = [...header.querySelectorAll('span')].map(x=>x.textContent.trim().toUpperCase());
      const key = Object.keys(captions).find(k=>tokens.some(t=>t===k || t.startsWith(k)));
      if (!key) return;
      const target = header.querySelector('div') || header;
      const p = document.createElement('p');
      p.className = 'ux-section-caption';
      p.textContent = captions[key];
      target.appendChild(p);
    });
  }

  function markPrimary(root, tab) {
    const phrases = {
      roles:['Panel veröffentlichen','Panel aktualisieren','Aktivieren & veröffentlichen','+ Neues Panel'],
      tickets:['Panel veröffentlichen','Panel aktualisieren','+ Neues Panel'],
      voice:['Änderungen speichern','Creator-Kanal automatisch anlegen'],
      commands:['Neuer Command'],
      creators:['Quelle prüfen','Testnachricht senden','+ Twitch','+ YouTube','+ TikTok'],
      diagnostics:['Testnachricht senden']
    }[tab] || [];
    if (!phrases.length) return;
    root.querySelectorAll('button,a').forEach(control => {
      const text = control.textContent.replace(/\s+/g,' ').trim();
      if (phrases.some(x=>text.includes(x))) control.classList.add('ux-primary-action');
    });
  }

  function ensureGuide(root, tab) {
    if (!D.guides?.[tab] || root.querySelector(`[data-ux-guide="${CSS.escape(tab)}"]`)) return;
    const holder = document.createElement('div');
    holder.innerHTML = guideMarkup(tab).trim();
    const guide = holder.firstElementChild;
    if (!guide) return;
    const hero = root.querySelector('.workspace-head,.role-studio-toolbar,.ticket-head,.creator-head,.voice-head');
    if (hero) hero.insertAdjacentElement('afterend', guide);
    else root.insertAdjacentElement('afterbegin', guide);
  }

  function decorateWorkspace() {
    const root = document.querySelector('#guildWorkspace');
    const tab = tabNow();
    if (!root || !tab) return;
    root.classList.add('ux-workspace-v2');
    root.dataset.uxTab = tab;
    ensureGuide(root, tab);
    addHints(root, tab);
    addSectionCaptions(root, tab);
    markPrimary(root, tab);
    decorateNav();
  }

  let queued = false;
  function queueDecorate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      decorateLogin();
      decorateServerList();
      decorateWorkspace();
    });
  }

  if (typeof renderServerList === 'function') {
    const previous = renderServerList;
    renderServerList = async function renderServerListUxV2(...args) {
      const result = await previous(...args);
      decorateServerList();
      return result;
    };
  }
  if (typeof renderGuildShell === 'function') {
    const previous = renderGuildShell;
    renderGuildShell = function renderGuildShellUxV2(...args) {
      const result = previous(...args);
      queueDecorate();
      return result;
    };
  }
  if (typeof renderGuildWorkspace === 'function') {
    const previous = renderGuildWorkspace;
    renderGuildWorkspace = function renderGuildWorkspaceUxV2(...args) {
      const result = previous(...args);
      queueDecorate();
      return result;
    };
  }

  decorateLogin();
  queueDecorate();
  const observer = new MutationObserver(queueDecorate);
  observer.observe(document.body, { childList: true, subtree: true });
})();
