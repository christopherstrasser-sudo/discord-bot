(() => {
  window.RakuUxV2Data = window.RakuUxV2Data || {};
  window.RakuUxV2Data.guides = {
    welcome: {
      kicker: 'SCHNELLSTART / WILLKOMMEN', title: 'Neue Mitglieder automatisch begrüßen.',
      copy: 'Du wählst einen Textkanal, formulierst die Nachricht und aktivierst das Modul. Ab dann reagiert RAKU bei jedem neuen Mitglied automatisch.',
      steps: [['Kanal wählen','Dorthin sendet RAKU die Begrüßung.'],['Nachricht bauen','Variablen setzen Namen und Serverdaten automatisch ein.'],['Aktivieren & speichern','Danach läuft die Begrüßung ohne weiteren Klick.']],
      glossary: ['{user} = echte Discord-Erwähnung','Preview = wird nicht gesendet'],
      note: 'Tipp: Nutze {user}, damit das neue Mitglied direkt angesprochen und benachrichtigt wird.'
    },
    autorole: {
      kicker: 'SCHNELLSTART / AUTO-ROLES', title: 'Eine Rolle direkt beim Beitritt vergeben.',
      copy: 'Zielrolle auswählen, Modul einschalten und speichern. RAKU übernimmt den Rest bei jedem neuen Join.',
      steps: [['Rolle wählen','Nur Rollen, die der Bot wirklich verwalten darf, werden angeboten.'],['Status prüfen','Der Berechtigungscheck muss grün sein.'],['Aktivieren','Jedes neue Mitglied bekommt die Rolle automatisch.']],
      glossary: ['Rollen-Hierarchie = Bot-Rolle muss darüber liegen'],
      note: 'Bestehende Mitglieder werden nicht rückwirkend verändert. Auto-Role greift bei neuen Beitritten.'
    },
    roles: {
      kicker: 'SCHNELLSTART / ROLE STUDIO', title: 'Self-Service-Rollen als echtes Discord-Panel.',
      copy: 'Baue zuerst die Nachricht, wähle dann die Interaktionsart und ordne echte Discord-Rollen zu. Die Live-Preview zeigt dir vor dem Publish das Ergebnis.',
      steps: [['Panel gestalten','Titel, Text und Buttons, Dropdown oder Reactions festlegen.'],['Rollen zuordnen','Jeder Eintrag wird mit einer echten Serverrolle verbunden.'],['Publish','Erst Veröffentlichen macht das Panel in Discord sichtbar.']],
      glossary: ['Multi = mehrere Rollen möglich','Exklusiv = nur eine Rolle','Publish = Discord-Nachricht erstellen oder aktualisieren'],
      note: 'Speichern sichert den Entwurf. „Panel veröffentlichen“ beziehungsweise „Panel aktualisieren“ überträgt ihn anschließend nach Discord.'
    },
    tickets: {
      kicker: 'SCHNELLSTART / TICKET STUDIO', title: 'Support als klarer Workflow statt Kanal-Chaos.',
      copy: 'Ein Panel enthält mehrere Ticket-Typen. Jeder Typ kann eigene Fragen haben; Routing, Staff-Zugriff und Transcripts gelten für den gesamten Ablauf.',
      steps: [['Routing setzen','Panel-Kanal, Ticket-Kategorie und Support-Team wählen.'],['Workflows bauen','Support, Report, Bewerbung oder eigene Abläufe konfigurieren.'],['Panel publishen','Nutzer können Tickets danach direkt in Discord öffnen.']],
      glossary: ['Claim = Staff übernimmt Ticket','Transcript = Gesprächsprotokoll','Archiv = Ziel für geschlossene Tickets'],
      note: 'Der Publish Check rechts zeigt dir sofort, was noch fehlt. Grün bedeutet: Das Panel kann sicher veröffentlicht werden.'
    },
    voice: {
      kicker: 'SCHNELLSTART / VOICE STUDIO', title: 'Ein Join erzeugt automatisch einen persönlichen Voice-Raum.',
      copy: 'Der Creator-Kanal ist nur der Eingang. RAKU erstellt beim Join einen neuen Raum, verschiebt den Nutzer hinein und löscht den Raum später automatisch.',
      steps: [['Creator-Kanal','Eingang wählen oder direkt automatisch anlegen lassen.'],['Raumregeln','Name, Nutzerlimit und optional Bitrate festlegen.'],['System aktivieren','Join → Create → Move → Cleanup läuft danach automatisch.']],
      glossary: ['0 Nutzer = unbegrenzt','Cleanup Delay = Wartezeit vor dem Löschen','Owner = Ersteller des Raums'],
      note: 'Im Bereich „Live Rooms“ siehst du jederzeit, welche temporären Räume RAKU aktuell verwaltet.'
    },
    commands: {
      kicker: 'SCHNELLSTART / COMMAND BUILDER', title: 'Chat-Befehle aus Bausteinen zusammensetzen.',
      copy: 'Ein Command besteht aus Trigger und Flow. Text, Embeds, Link-Buttons und Zufallsantworten können kombiniert und per Drag & Drop sortiert werden.',
      steps: [['Trigger definieren','Zum Beispiel !lurk oder !socials.'],['Flow bauen','Bausteine anklicken oder in den Ablauf ziehen.'],['Preview & speichern','Rechts prüfen, dann Änderungen global speichern.']],
      glossary: ['Trigger = Chat-Befehl','Cooldown = Spam-Schutz','{args} = Text hinter dem Command'],
      note: 'Die Reihenfolge der Bausteine entspricht der späteren Ausgabe in Discord. Die Preview rechts wird live aktualisiert.'
    },
    creators: {
      kicker: 'SCHNELLSTART / CREATOR HUB', title: 'Social Events automatisch in Discord verteilen.',
      copy: 'Eine Automation verbindet genau eine Quelle und ein Event mit einem Discord-Ziel. Provider-Check, Filter und Preview helfen dir, die Regel vor der Aktivierung sicher zu prüfen.',
      steps: [['Quelle verbinden','Plattform, Event und Creator festlegen und „Quelle prüfen“.'],['Discord-Ausgabe','Zielkanal, optional Ping-Rolle und Nachricht konfigurieren.'],['Test & aktivieren','Testnachricht senden, danach Regel einschalten.']],
      glossary: ['Baseline = aktuellen Stand nur merken','Cooldown = Mindestabstand','Quiet Hours = Ruhezeit'],
      note: '„Quelle prüfen“ testet nur den Provider. „Testnachricht senden“ prüft die Darstellung in Discord und pingt absichtlich keine Rollen.'
    },
    logging: {
      kicker: 'SCHNELLSTART / SERVER-LOGS', title: 'Wichtige Server-Ereignisse an einem Ort nachvollziehen.',
      copy: 'Wähle einen Log-Kanal und aktiviere das Modul. RAKU schreibt relevante Join-, Nachrichten-, Rollen-, Kanal- und Moderationsereignisse dorthin.',
      steps: [['Log-Kanal wählen','Am besten ein nur für Staff sichtbarer Textkanal.'],['Modul aktivieren','Der Status wechselt in der Navigation auf Aktiv.'],['Speichern','Neue Ereignisse werden ab dann automatisch protokolliert.']],
      glossary: ['Logs = Ereignisprotokoll','Moderation = Ban, Unban und ähnliche Aktionen'],
      note: 'Der Bot protokolliert nur neue Ereignisse ab Aktivierung; ältere Serverereignisse werden nicht nachträglich importiert.'
    },
    diagnostics: {
      kicker: 'SCHNELLSTART / DIAGNOSE', title: 'Dashboard, Bot und Discord in einem Schritt testen.',
      copy: 'Die Testnachricht prüft die komplette Kette vom Dashboard über den Bot bis in einen echten Discord-Kanal. So erkennst du Rechte- oder Verbindungsprobleme sofort.',
      steps: [['Kanal wählen','Nur Kanäle mit vorhandenen Schreibrechten werden angeboten.'],['Test senden','RAKU sendet eine harmlose Diagnose-Nachricht.'],['Ergebnis lesen','Grün bedeutet: Verbindung und Schreibrechte funktionieren.']],
      glossary: ['Diagnose = keine Konfiguration wird verändert'],
      note: 'Der Test verändert keine Module und kann gefahrlos jederzeit erneut ausgeführt werden.'
    }
  };
  window.RakuUxV2Data.navHelp = {
    overview:'Live-Zustand, aktive Systeme und offene Punkte auf einen Blick.', welcome:'Automatische Begrüßungen für neue Servermitglieder.', autorole:'Vergibt beim Join automatisch eine definierte Rolle.', roles:'Self-Service-Rollen mit Buttons, Dropdowns oder Reactions.', tickets:'Support-Workflows mit Formularen, Staff und Transcripts.', voice:'Temporäre Voice-Räume automatisch erstellen und aufräumen.', commands:'Eigene Chat-Befehle als visuellen Flow bauen.', creators:'Twitch-, YouTube- und TikTok-Events nach Discord senden.', logging:'Server- und Moderationsereignisse protokollieren.', diagnostics:'Bot-Verbindung und Discord-Schreibrechte testen.'
  };
})();
