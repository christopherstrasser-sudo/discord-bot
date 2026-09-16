(() => {
  const VERSION = '0.14.0';
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  document.body.classList.add('raku-visual-v140');

  function decorateLogin() {
    const screen = document.querySelector('#loggedOut');
    if (!screen || screen.dataset.rakuVisual140 === '1') return;
    screen.dataset.rakuVisual140 = '1';
    screen.classList.add('raku-login-v140');
    screen.innerHTML = `
      <div class="raku-login-copy-v140">
        <span class="raku-login-kicker-v140"><i></i>RAKU DISCORD CONTROL</span>
        <h1>Dein Server.<br><span>Ein Control Deck.</span></h1>
        <p>Community, Automationen, Creator-Alerts, Tickets, Voice und Server-Intelligence in einer Oberfläche – klar gegliedert und direkt über Discord verbunden.</p>
        <div class="raku-login-actions-v140">
          <a class="button button-primary" href="/auth/discord">Mit Discord starten <span>→</span></a>
          <small>Discord-Login verbindet nur die Server, die du selbst verwalten darfst.</small>
        </div>
        <div class="raku-login-proof-v140">
          <article><span>01 / CONNECT</span><b>Discord verbinden</b><small>Ein Login. Mehrere verwaltbare Server.</small></article>
          <article><span>02 / CONTROL</span><b>Module steuern</b><small>Einheitliche Workflows statt einzelner Bot-Menüs.</small></article>
          <article><span>03 / UNDERSTAND</span><b>Server verstehen</b><small>Status, Aktivität und Analytics direkt im Deck.</small></article>
        </div>
      </div>
      <aside class="raku-login-stage-v140" aria-label="RAKU Control Deck Vorschau">
        <header class="raku-login-stage-head-v140"><span>RAKU / CONTROL STACK</span><b>READY</b></header>
        <div class="raku-login-matrix-v140">
          <article><span>CONTROL DECK</span><b>ONE</b><small>Eine Oberfläche für deine Server-Tools.</small></article>
          <article><span>PLATFORMS</span><b>3</b><small>Twitch · YouTube · TikTok</small></article>
          <article><span>ANALYTICS</span><b>LIVE</b><small>Opt-in Server Intelligence</small></article>
        </div>
        <div class="raku-login-stack-v140">
          <article><i>RS</i><div><b>Role Studio</b><small>Self-Service Rollen & Panels</small></div><em>MODULE</em></article>
          <article><i>TS</i><div><b>Ticket Studio</b><small>Support-Flows & Transcripts</small></div><em>MODULE</em></article>
          <article><i>VS</i><div><b>Voice Studio</b><small>Join-to-Create & Ownership</small></div><em>MODULE</em></article>
          <article><i>CH</i><div><b>Creator Hub</b><small>Live- und Upload-Automationen</small></div><em>MODULE</em></article>
        </div>
        <footer class="raku-login-stage-foot-v140"><span>CONTROL NODE / MULTI-SERVER</span><span>v${VERSION}</span></footer>
      </aside>`;
  }

  function decorateServerPicker() {
    const screen = document.querySelector('#serverList');
    if (!screen) return;
    screen.classList.add('raku-server-picker-v140');

    const head = screen.querySelector('.page-head');
    const headCopy = head?.querySelector(':scope > div:first-child');
    if (headCopy && !headCopy.querySelector('.raku-picker-kicker-v140')) {
      const current = headCopy.querySelector('.overline');
      if (current) {
        current.className = 'raku-picker-kicker-v140';
        current.textContent = 'SERVER NETWORK / CONTROL DECK';
      } else {
        headCopy.insertAdjacentHTML('afterbegin', '<span class="raku-picker-kicker-v140">SERVER NETWORK / CONTROL DECK</span>');
      }
      const text = headCopy.querySelector('p');
      if (text) text.textContent = 'Wähle einen Discord-Server und öffne direkt sein Control Deck. Verbindung, Module und Systemzustand bleiben serverbezogen getrennt.';
    }

    screen.querySelectorAll('.server-card').forEach(card => {
      card.classList.add('raku-server-card-v140');
      const connected = card.dataset.installed === 'true';
      if (!card.querySelector('.raku-server-status-v140')) {
        const status = document.createElement('div');
        status.className = 'raku-server-status-v140';
        status.innerHTML = connected
          ? '<span>RAKU ist verbunden und das Control Deck ist verfügbar.</span><b>CONTROL READY</b>'
          : '<span>RAKU muss einmalig auf diesem Server installiert werden.</span><b>INSTALL REQUIRED</b>';
        card.querySelector('.server-card-actions')?.insertAdjacentElement('beforebegin', status);
      }
    });
  }

  const heroSelectors = [
    '.workspace-head',
    '.flow-studio-toolbar',
    '.role-studio-toolbar',
    '.ticket-head',
    '.creator-head',
    '.voice-head',
    '.analytics-head'
  ].join(',');

  const moduleRoots = [
    '.flow-studio',
    '.role-studio',
    '.ticket-shell',
    '.creator-shell',
    '.voice-shell',
    '.analytics-shell'
  ].join(',');

  function decorateWorkspace() {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.classList.add('raku-visual-workspace-v140');
    if (typeof activeTab !== 'undefined' && activeTab) root.dataset.rakuVisualTab = activeTab;

    root.querySelectorAll(moduleRoots).forEach(module => module.classList.add('raku-module-v140'));
    root.querySelectorAll(heroSelectors).forEach(hero => hero.classList.add('raku-unified-hero'));

    const guide = root.querySelector('.ux-module-guide');
    if (guide) guide.classList.add('raku-guide-v140');
  }

  function decorateNavigation() {
    const nav = document.querySelector('.deck-nav');
    if (!nav) return;
    nav.classList.add('raku-nav-v140');
  }

  let queued = false;
  function queueDecorate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      decorateLogin();
      decorateServerPicker();
      decorateNavigation();
      decorateWorkspace();
    });
  }

  queueDecorate();
  window.addEventListener('load', queueDecorate, { once: true });

  const observer = new MutationObserver(queueDecorate);
  observer.observe(document.body, { childList: true, subtree: true });
})();
