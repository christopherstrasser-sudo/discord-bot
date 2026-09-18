(() => {
  const GUIDES = {
    welcome: {
      title: 'Willkommen',
      copy: 'Begrüßt neue Mitglieder automatisch im richtigen Kanal und gibt ihnen direkt Orientierung.',
      steps: ['Zielkanal wählen', 'Nachricht formulieren', 'Modul aktivieren'],
      hint: 'Variablen wie {user} und {server} machen die Begrüßung persönlich.',
      icon: '<path d="M5 4.5h9v15H5z"/><path d="M14 8h4.5v8H14M8.5 12h.01"/><path d="M18.5 4.5v2M17.5 5.5h2"/>'
    },
    autorole: {
      title: 'Auto-Roles',
      copy: 'Vergibt beim Join automatisch eine definierte Rolle und hält deine Basis-Berechtigungen konsistent.',
      steps: ['Rolle auswählen', 'Bot-Rechte prüfen', 'Aktivieren'],
      hint: 'Die Zielrolle muss unterhalb der Bot-Rolle liegen.',
      icon: '<circle cx="8.5" cy="8" r="3"/><path d="M3.5 19c.4-3.3 2.1-5 5-5 1.6 0 2.9.5 3.8 1.4"/><path d="m14.5 17 2 2 4-5"/>'
    },
    roles: {
      title: 'Rollen',
      copy: 'Baut Self-Service-Panels, über die Mitglieder Rollen selbst auswählen und wieder entfernen können.',
      steps: ['Panel anlegen', 'Rollen hinzufügen', 'Vorschau prüfen & veröffentlichen'],
      hint: 'Nutze getrennte Panels für Games, Pings, Regionen oder Interessen.',
      icon: '<path d="M4 5h7.5L20 13.5 13.5 20 5 11.5z"/><circle cx="8.5" cy="8.5" r="1"/>'
    },
    tickets: {
      title: 'Tickets',
      copy: 'Verwandelt Support, Bewerbungen und Reports in klar geführte Workflows mit Formularen und Routing.',
      steps: ['Panel anlegen', 'Routing & Workflows konfigurieren', 'Vorschau prüfen & veröffentlichen'],
      hint: 'Baue erst Routing und Support-Team, danach die einzelnen Ticket-Typen.',
      icon: '<path d="M4 7.5h16v4a2.5 2.5 0 0 0 0 5v4H4v-4a2.5 2.5 0 0 0 0-5z"/><path d="M12 7.5v13" stroke-dasharray="2 2"/>'
    },
    voice: {
      title: 'Voice',
      copy: 'Erstellt temporäre Sprachkanäle automatisch und räumt sie wieder auf, sobald niemand sie mehr nutzt.',
      steps: ['Lobby festlegen', 'Namens- und Raumregeln setzen', 'Aktivieren & testen'],
      hint: 'Eine klar benannte Lobby macht das System für Mitglieder selbsterklärend.',
      icon: '<path d="M5 13a7 7 0 0 1 14 0v4"/><path d="M5 13h2.5v6H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-1.7M19 13h-2.5v6H18a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-1.7"/>'
    },
    commands: {
      title: 'Commands',
      copy: 'Erstellt eigene Chat-Befehle und Antworten, ohne dass du dafür Code anfassen musst.',
      steps: ['Command anlegen', 'Trigger & Antwort bauen', 'Speichern & im Chat testen'],
      hint: 'Kurze, eindeutige Trigger halten Commands wartbar.',
      icon: '<path d="m5 7 4 5-4 5M11.5 17H19"/>'
    },
    creators: {
      title: 'Creator Alerts',
      copy: 'Beobachtet deine Creator-Quellen und veröffentlicht neue Lives, Uploads oder Clips im passenden Discord-Kanal.',
      steps: ['Quelle hinzufügen', 'Ereignis & Zielkanal wählen', 'Regel testen & aktivieren'],
      hint: 'Manuelle Tests senden absichtlich keinen Rollen-Ping.',
      icon: '<circle cx="12" cy="8" r="2.5"/><path d="M8 19v-2.2A4 4 0 0 1 12 13a4 4 0 0 1 4 3.8V19"/><path d="M5.2 6.5a8 8 0 0 0 0 7M18.8 6.5a8 8 0 0 1 0 7"/>'
    },
    logging: {
      title: 'Logs',
      copy: 'Schreibt wichtige Server- und Moderationsereignisse in einen zentralen Kanal.',
      steps: ['Log-Kanal wählen', 'Ereignisse festlegen', 'Aktivieren'],
      hint: 'Ein separater Staff-Kanal hält Logs übersichtlich und geschützt.',
      icon: '<path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>'
    },
    analytics: {
      title: 'Analytics',
      copy: 'Macht Aktivität und Nutzung deines Servers sichtbar, damit Trends und Veränderungen leichter erkennbar werden.',
      steps: ['Zeitraum wählen', 'Aktivität vergleichen', 'Auffälligkeiten prüfen'],
      hint: 'Analytics zeigt echte erfasste Daten und keine erfundenen Telemetrie-Werte.',
      icon: '<path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/>'
    },
    diagnostics: {
      title: 'Diagnose',
      copy: 'Prüft die Verbindung zwischen Dashboard, ORBIT und Discord mit einem echten Nachrichtentest.',
      steps: ['Kanal auswählen', 'Testnachricht senden', 'Ergebnis prüfen'],
      hint: 'Wenn ein Modul nicht reagiert, ist Diagnose der schnellste erste Check.',
      icon: '<circle cx="12" cy="12" r="8.5"/><path d="M5.5 12h3l1.8-4.2 3.2 8.4 2-4.2h3"/>'
    }
  };

  function safe(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(String(value ?? ''));
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  }

  function guideMarkup(tab) {
    const guide = GUIDES[tab];
    if (!guide) return '';
    const steps = guide.steps.map((step, index) => `
      <span class="o7-guide-step"><i>${index + 1}</i><b>${safe(step)}</b></span>
    `).join('');
    return `
      <section class="o7-module-guide" data-o7-guide="${safe(tab)}">
        <div class="o7-guide-main">
          <span class="o7-guide-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${guide.icon}</svg></span>
          <div>
            <span class="o7-section-label">So funktioniert es</span>
            <h1>${safe(guide.title)}</h1>
            <p>${safe(guide.copy)}</p>
          </div>
        </div>
        <div class="o7-guide-steps">${steps}</div>
        <div class="o7-guide-hint"><span>i</span><p>${safe(guide.hint)}</p></div>
      </section>`;
  }

  window.OrbitModuleGuide = guideMarkup;

  function nativeToolbar(root) {
    const head = root.querySelector('.workspace-head,.role-studio-toolbar,.ticket-head,.creator-head,.voice-head,.analytics-head,.flow-studio-toolbar');
    if (!head) return;
    head.classList.add('o6-native-toolbar', 'o7-native-toolbar');

    let titleNode = null;
    if (head.matches('.role-studio-toolbar')) titleNode = head.querySelector(':scope > .role-studio-title');
    else if (head.matches('.flow-studio-toolbar')) titleNode = head.querySelector(':scope > .flow-studio-title');
    else if (head.matches('.voice-head')) titleNode = head.querySelector(':scope > .voice-head-copy');
    else titleNode = head.firstElementChild;

    const usefulChildren = [...head.children].filter(child => child !== titleNode && !child.classList.contains('hidden'));
    head.classList.toggle('o6-native-toolbar-empty', usefulChildren.length === 0);
  }

  function decorate(tab) {
    if (!tab || tab === 'overview' || tab === 'profile') return;
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.classList.add('o6-module-canvas', 'o7-module-canvas');
    root.dataset.module = tab;
    if (!root.querySelector(':scope > .o7-module-guide')) {
      root.insertAdjacentHTML('afterbegin', guideMarkup(tab));
    }
    nativeToolbar(root);
  }

  if (typeof renderGuildWorkspace !== 'function') return;
  const previousRenderGuildWorkspace = renderGuildWorkspace;
  renderGuildWorkspace = function renderGuildWorkspaceWithModuleShell(tab) {
    previousRenderGuildWorkspace(tab);
    requestAnimationFrame(() => decorate(tab));
  };

  let guideSyncQueued = false;
  function queueGuideSync() {
    if (guideSyncQueued) return;
    guideSyncQueued = true;
    requestAnimationFrame(() => {
      guideSyncQueued = false;
      if (typeof activeTab === 'undefined' || activeTab === 'overview' || activeTab === 'profile') return;
      const root = document.querySelector('#guildWorkspace');
      if (!root || root.querySelector(':scope > .o7-module-guide')) return;
      decorate(activeTab);
    });
  }

  /* Observe the stable dashboard host instead of the current #guildWorkspace.
     Orbit rebuilds #guildWorkspace when the guild shell is rendered, and async
     modules (Creator Alerts in particular) replace its contents after loading.
     An observer attached to the old workspace therefore becomes stale and the
     guide can disappear on the first module load. */
  const dashboardHost = document.querySelector('#guildDashboardContent');
  if (dashboardHost && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (typeof activeTab === 'undefined' || activeTab === 'overview' || activeTab === 'profile') return;
      const currentWorkspace = document.querySelector('#guildWorkspace');
      if (!currentWorkspace || currentWorkspace.querySelector(':scope > .o7-module-guide')) return;
      queueGuideSync();
    });
    observer.observe(dashboardHost, { childList: true, subtree: true });
  }

  requestAnimationFrame(() => {
    const dashboardVisible = !document.querySelector('#guildDashboard')?.classList.contains('hidden');
    if (dashboardVisible && typeof activeTab !== 'undefined') decorate(activeTab);
  });
})();