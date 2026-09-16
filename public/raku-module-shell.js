(() => {
  const HEROES = {
    welcome: {
      kicker: 'ERSTER EINDRUCK',
      headline: 'Neue Mitglieder wissen sofort, wo sie gelandet sind.',
      copy: 'Baue eine Begrüßung, die automatisch im richtigen Kanal erscheint, persönlich wirkt und neuen Leuten direkt Orientierung gibt.',
      purpose: 'Ideal, um Regeln, wichtige Kanäle oder den nächsten Schritt direkt beim Beitritt sichtbar zu machen.',
      steps: ['Kanal wählen', 'Nachricht bauen', 'Aktivieren']
    },
    autorole: {
      kicker: 'AUTOMATISIERUNG',
      headline: 'Die richtige Rolle landet automatisch beim richtigen Mitglied.',
      copy: 'Lege fest, welche Rolle neue Mitglieder direkt beim Beitritt erhalten. Weniger Handarbeit, ein sauberer Start und konsistente Berechtigungen.',
      purpose: 'Nutze Auto-Roles für Basisrollen, Verifizierung oder alles, was jedes neue Mitglied direkt bekommen soll.',
      steps: ['Rolle wählen', 'Berechtigungen prüfen', 'Aktivieren']
    },
    roles: {
      kicker: 'SELF-SERVICE',
      headline: 'Mitglieder wählen ihre Rollen selbst.',
      copy: 'Erstelle übersichtliche Rollen-Panels mit eigenen Texten, Gruppen und Discord-Vorschau. Deine Community bekommt Auswahl, du behältst die Kontrolle.',
      purpose: 'Perfekt für Games, Plattformen, Regionen, Pings oder Interessen – ohne dass ein Mod Rollen von Hand verteilen muss.',
      steps: ['Panel anlegen', 'Rollen hinzufügen', 'Veröffentlichen']
    },
    tickets: {
      kicker: 'SUPPORT SYSTEM',
      headline: 'Aus einer Nachricht wird ein sauberer Support-Workflow.',
      copy: 'Baue Ticket-Panels, Fragen und Abläufe so, dass Nutzer schnell Hilfe bekommen und dein Team sofort die richtigen Informationen vorliegen hat.',
      purpose: 'Von Support über Bewerbungen bis Reports: ein strukturierter Einstieg statt chaotischer Direktnachrichten.',
      steps: ['Panel bauen', 'Workflow definieren', 'Veröffentlichen']
    },
    voice: {
      kicker: 'VOICE AUTOMATION',
      headline: 'Temporäre Voice-Räume entstehen genau dann, wenn sie gebraucht werden.',
      copy: 'Definiere Lobby, Namensschema und Regeln. Der Bot erstellt Räume automatisch und räumt sie wieder auf, wenn niemand mehr drin ist.',
      purpose: 'Ideal für Gaming-Communities, spontane Gruppen und Server, die ohne Voice-Chaos wachsen sollen.',
      steps: ['Lobby wählen', 'Raumregeln setzen', 'Aktivieren']
    },
    commands: {
      kicker: 'CHAT AUTOMATION',
      headline: 'Aus einem Befehl wird eine kleine Automation.',
      copy: 'Erstelle eigene Commands, Antworten und Abläufe. Vom simplen !socials bis zu komplexeren Reaktionen bleibt alles an einem Ort wartbar.',
      purpose: 'Nutze Commands für wiederkehrende Infos, Community-Aktionen oder kleine Self-Service-Funktionen im Chat.',
      steps: ['Trigger festlegen', 'Antwort bauen', 'Testen & aktivieren']
    },
    creators: {
      kicker: 'CREATOR SIGNALS',
      headline: 'Wenn Content live geht, weiß dein Discord sofort Bescheid.',
      copy: 'Verbinde Creator-Quellen mit Discord-Kanälen und lege fest, wann und wie Twitch-, YouTube- oder TikTok-Alerts veröffentlicht werden.',
      purpose: 'Gut für Creator-Server und Communities, die mehrere Plattformen bündeln und Benachrichtigungen gezielt steuern wollen.',
      steps: ['Quelle verbinden', 'Zielkanal wählen', 'Alert testen']
    },
    logging: {
      kicker: 'SERVER TRANSPARENZ',
      headline: 'Wichtige Ereignisse verschwinden nicht mehr im Nirgendwo.',
      copy: 'Leite relevante Server- und Moderationsereignisse in einen festen Log-Kanal und halte nachvollziehbar fest, was auf dem Server passiert.',
      purpose: 'Hilft deinem Team bei Moderation, Fehlersuche und Nachvollziehbarkeit, ohne Discord manuell durchsuchen zu müssen.',
      steps: ['Ereignisse wählen', 'Kanal festlegen', 'Aktivieren']
    },
    analytics: {
      kicker: 'SERVER INSIGHTS',
      headline: 'Zahlen werden erst nützlich, wenn du daraus etwas erkennst.',
      copy: 'Sieh Aktivität, Nutzung und Entwicklungen deines Servers in einem gemeinsamen Bild und finde schneller heraus, wo deine Community wirklich lebt.',
      purpose: 'Nutze Trends nicht als Deko, sondern als Hinweis darauf, welche Bereiche funktionieren und wo sich ein genauerer Blick lohnt.',
      steps: ['Zeitraum wählen', 'Trends lesen', 'Handlungsbedarf prüfen']
    },
    diagnostics: {
      kicker: 'SYSTEM CHECK',
      headline: 'Wenn etwas hakt, findest du hier zuerst heraus warum.',
      copy: 'Prüfe Bot-Verbindung, Discord-Zugriff und kritische Funktionen mit klaren Statusanzeigen und direkten Tests statt blindem Herumprobieren.',
      purpose: 'Der schnellste Startpunkt, wenn ein Modul nicht reagiert, Berechtigungen fehlen oder du eine Verbindung testen willst.',
      steps: ['Verbindung prüfen', 'Rechte kontrollieren', 'Funktion testen']
    }
  };

  const ICONS = {
    welcome: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h9v15H5z"/><path d="M14 8h4.5v8H14M8.5 12h.01"/><path d="M18.5 4.5v2M17.5 5.5h2"/></svg>',
    autorole: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3"/><path d="M3.5 19c.4-3.3 2.1-5 5-5 1.6 0 2.9.5 3.8 1.4"/><path d="m14.5 17 2 2 4-5"/></svg>',
    roles: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7.5L20 13.5 13.5 20 5 11.5z"/><circle cx="8.5" cy="8.5" r="1"/></svg>',
    tickets: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v4a2.5 2.5 0 0 0 0 5v4H4v-4a2.5 2.5 0 0 0 0-5z"/><path d="M12 7.5v13" stroke-dasharray="2 2"/></svg>',
    voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13a7 7 0 0 1 14 0v4"/><path d="M5 13h2.5v6H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-1.7M19 13h-2.5v6H18a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-1.7"/></svg>',
    commands: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 4 5-4 5M11.5 17H19"/></svg>',
    creators: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="2.5"/><path d="M8 19v-2.2A4 4 0 0 1 12 13a4 4 0 0 1 4 3.8V19"/><path d="M5.2 6.5a8 8 0 0 0 0 7M18.8 6.5a8 8 0 0 1 0 7"/></svg>',
    logging: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/></svg>',
    diagnostics: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M5.5 12h3l1.8-4.2 3.2 8.4 2-4.2h3"/></svg>'
  };

  function safe(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(String(value ?? ''));
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  }

  function settings() {
    return typeof workingSettings !== 'undefined' ? workingSettings : {};
  }

  function ticketConfig() {
    return window.RakuTicketStudio?.s?.cfg || null;
  }

  function creatorConfig() {
    return window.RakuCreatorHub?.s?.cfg || null;
  }

  function stateFor(tab) {
    const cfg = settings();
    if (tab === 'welcome') return Boolean(cfg?.welcome?.enabled);
    if (tab === 'autorole') return Boolean(cfg?.autorole?.enabled);
    if (tab === 'roles') return Boolean(cfg?.rolePanels?.enabled);
    if (tab === 'tickets') return Boolean(ticketConfig()?.enabled);
    if (tab === 'voice') return Boolean(cfg?.voiceStudio?.enabled || cfg?.voice?.enabled);
    if (tab === 'commands') return Boolean(cfg?.customCommands?.enabled);
    if (tab === 'creators') return Boolean(creatorConfig()?.enabled);
    if (tab === 'logging') return Boolean(cfg?.logging?.enabled);
    if (tab === 'analytics' || tab === 'diagnostics') return true;
    return null;
  }

  function metaFor(tab) {
    const cfg = settings();
    if (tab === 'roles') return `${cfg?.rolePanels?.panels?.length || 0} Panels`;
    if (tab === 'tickets') return `${ticketConfig()?.panels?.length || 0} Panels`;
    if (tab === 'commands') return `${cfg?.customCommands?.commands?.length || 0} Befehle`;
    if (tab === 'creators') return `${(creatorConfig()?.rules || []).filter(rule => rule.enabled).length} Regeln aktiv`;
    if (tab === 'analytics') return 'Live-Auswertung';
    if (tab === 'diagnostics') return 'Systemcheck';
    return '';
  }

  function statusFor(tab) {
    if (tab === 'analytics') return { on: true, label: 'Bereit', detail: metaFor(tab) };
    if (tab === 'diagnostics') return { on: true, label: 'Bereit', detail: metaFor(tab) };
    const on = Boolean(stateFor(tab));
    return {
      on,
      label: on ? 'Aktiv' : 'Nicht aktiv',
      detail: metaFor(tab) || (on ? 'Läuft' : 'Noch aus')
    };
  }

  function heroMarkup(tab) {
    const hero = HEROES[tab];
    if (!hero) return '';
    const status = statusFor(tab);
    const steps = hero.steps.map((step, index) => `<span class="o6-module-hero-step"><i>${index + 1}</i>${safe(step)}</span>`).join('');
    return `<section class="o6-module-hero o6-island" data-o6-module-hero="${safe(tab)}">
      <div class="o6-module-hero-copy">
        <span class="o6-module-hero-icon">${ICONS[tab] || ''}</span>
        <div>
          <span class="o6-eyebrow">${safe(hero.kicker)}</span>
          <h1>${safe(hero.headline)}</h1>
          <p>${safe(hero.copy)}</p>
        </div>
      </div>
      <aside class="o6-module-hero-side">
        <div class="o6-module-hero-status${status.on ? ' on' : ''}">
          <i aria-hidden="true"></i><span>${safe(status.label)}</span><b>${safe(status.detail)}</b>
        </div>
        <p class="o6-module-hero-purpose">${safe(hero.purpose)}</p>
      </aside>
      <div class="o6-module-hero-flow"><strong>So funktioniert's</strong>${steps}</div>
    </section>`;
  }

  function nativeToolbar(root) {
    const head = root.querySelector('.workspace-head,.role-studio-toolbar,.ticket-head,.creator-head,.voice-head,.analytics-head,.flow-studio-toolbar');
    if (!head) return;
    head.classList.add('o6-native-toolbar');

    let titleNode = null;
    if (head.matches('.role-studio-toolbar')) titleNode = head.querySelector(':scope > .role-studio-title');
    else if (head.matches('.flow-studio-toolbar')) titleNode = head.querySelector(':scope > .flow-studio-title');
    else if (head.matches('.voice-head')) titleNode = head.querySelector(':scope > .voice-head-copy');
    else titleNode = head.firstElementChild;

    const usefulChildren = [...head.children].filter(child => child !== titleNode && !child.classList.contains('hidden'));
    head.classList.toggle('o6-native-toolbar-empty', usefulChildren.length === 0);
  }

  function decorate(tab) {
    if (!tab || tab === 'overview') return;
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;

    root.classList.add('o6-module-canvas');
    root.dataset.module = tab;

    if (!root.querySelector(':scope > .o6-module-hero')) {
      root.insertAdjacentHTML('afterbegin', heroMarkup(tab));
    }
    nativeToolbar(root);
  }

  if (typeof renderGuildWorkspace !== 'function') return;
  const previousRenderGuildWorkspace = renderGuildWorkspace;
  renderGuildWorkspace = function renderGuildWorkspaceWithModuleShell(tab) {
    previousRenderGuildWorkspace(tab);
    requestAnimationFrame(() => decorate(tab));
  };

  requestAnimationFrame(() => {
    const dashboardVisible = !document.querySelector('#guildDashboard')?.classList.contains('hidden');
    if (dashboardVisible && typeof activeTab !== 'undefined') decorate(activeTab);
  });
})();
