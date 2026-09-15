(() => {
  const serverCopy = 'Wähle einen Discord-Server. Verbundene Server öffnen direkt das Control Deck; bei allen anderen kannst du RAKU mit einem Klick hinzufügen.';

  function login() {
    const screen = document.querySelector('#loggedOut');
    if (!screen || screen.dataset.uxLoginReady === '1') return;
    screen.dataset.uxLoginReady = '1';
    screen.classList.add('ux-login-v2');
    const copy = screen.querySelector('.login-copy');
    if (copy) copy.innerHTML = `
      <div class="ux-login-eyebrow"><i></i><span>RAKU CONTROL DECK · SERVER MANAGEMENT</span></div>
      <h1>Dein Bot.<br>Dein System.</h1>
      <p>Steuere Community, Automationen, Creator-Alerts, Tickets und temporäre Voice-Räume in einem einzigen Control Center – mit klaren Workflows statt Discord-Fummelei.</p>
      <div class="ux-login-cta-row"><a class="button button-primary button-large ux-primary-action" href="/auth/discord">Mit Discord anmelden</a><span class="ux-login-note"><i>✓</i><span>Du siehst nur Server, die du verwalten darfst.</span></span></div>
      <div class="ux-login-steps"><div class="ux-login-step"><span>01</span><div><b>Discord verbinden</b><small>Ein Login für deine verwaltbaren Server.</small></div></div><div class="ux-login-step"><span>02</span><div><b>Server auswählen</b><small>RAKU zeigt dir den Zustand direkt im Control Deck.</small></div></div><div class="ux-login-step"><span>03</span><div><b>Module aktivieren</b><small>Konfigurieren, prüfen, speichern – fertig.</small></div></div></div>`;

    const old = screen.querySelector('.login-console');
    if (!old) return;
    const stage = document.createElement('div');
    stage.className = 'ux-product-stage';
    stage.setAttribute('aria-hidden','true');
    stage.innerHTML = `<div class="ux-product-window"><div class="ux-product-top"><span>RAKU / CONTROL NODE</span><b>● ONLINE</b></div><div class="ux-product-body"><div class="ux-product-pulse"><article><span>SERVER PULSE</span><b>READY</b><small>Live Control</small></article><article><span>MODULES</span><b>9</b><small>Control Deck</small></article><article><span>PROVIDERS</span><b>3</b><small>Creator Hub</small></article><article><span>VOICE</span><b>LIVE</b><small>Join-to-Create</small></article></div><div class="ux-feature-stack"><div class="ux-feature-row"><span>TK</span><div><b>Ticket Studio</b><small>Formulare · Routing · Claims · Transcripts</small></div><em>READY</em></div><div class="ux-feature-row"><span>CR</span><div><b>Creator Hub</b><small>Twitch · YouTube · TikTok</small></div><em>LIVE</em></div><div class="ux-feature-row"><span>RL</span><div><b>Role Studio</b><small>Buttons · Dropdowns · Reactions</small></div><em>READY</em></div><div class="ux-feature-row"><span>VC</span><div><b>Voice Studio</b><small>Join · Create · Move · Cleanup</small></div><em>LIVE</em></div></div></div><div class="ux-product-foot"><span>ONE CONTROL DECK</span><span>v0.12.0 · UX v2</span></div></div>`;
    old.replaceWith(stage);
  }

  function server() {
    const root = document.querySelector('#serverList');
    const h1 = root?.querySelector('.page-head h1');
    const p = root?.querySelector('.page-head p');
    const search = root?.querySelector('#guildSearch');
    if (h1 && h1.textContent.trim() === 'Server auswählen') h1.textContent = 'Welchen Server steuerst du?';
    if (p && p.textContent !== serverCopy) p.textContent = serverCopy;
    if (search && search.placeholder !== 'Server nach Namen suchen') search.placeholder = 'Server nach Namen suchen';
  }

  function run() { login(); server(); }
  run();
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; run(); });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
