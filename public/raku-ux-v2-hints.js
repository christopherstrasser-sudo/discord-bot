(() => {
  window.RakuUxV2Data = window.RakuUxV2Data || {};
  window.RakuUxV2Data.fieldHints = {
    welcome: [[/^NACHRICHT$/,'Diese Nachricht wird automatisch gesendet, wenn ein neues Mitglied beitritt. Discord-Markdown und die Variablen darunter werden unterstützt.']],
    autorole: [[/^ZIELROLLE$/,'Diese Rolle bekommt jedes neue Mitglied. Sie muss in Discord unterhalb der höchsten Bot-Rolle liegen.']],
    logging: [[/^LOG-KANAL$/,'Hier landen die strukturierten Server- und Moderations-Logs. Für Staff empfiehlt sich ein nicht öffentlicher Kanal.']],
    commands: [
      [/^TEXT$/,'Freier Nachrichtentext. Variablen wie {user}, {server} und {args} werden beim Ausführen ersetzt.'],
      [/^TITEL$/,'Überschrift des Discord-Embeds.'],[/^BESCHREIBUNG$/,'Hauptinhalt des Embeds. Markdown und Variablen sind möglich.'],
      [/^FARBE$/,'Akzentfarbe des Discord-Embeds.'],[/^FOOTER$/,'Optionaler kleiner Text am unteren Rand des Embeds.'],
      [/^BILD-URL$/,'Öffentlich erreichbare HTTPS-Adresse eines Bildes für das Embed.'],[/^BUTTON-TEXT$/,'Beschriftung des klickbaren Link-Buttons.'],
      [/^LINK$/,'Zieladresse des Buttons.'],[/COOLDOWN/,'Mindestzeit, bevor derselbe Nutzer den Command erneut auslösen kann.']
    ],
    roles: [
      [/^ZIELKANAL$/,'In diesem Discord-Kanal wird das veröffentlichte Rollen-Panel angezeigt.'],[/^DISCORD-ROLLE$/,'Die echte Serverrolle, die bei dieser Auswahl vergeben oder entfernt wird.'],
      [/^LABEL$/,'Text, den Mitglieder auf dem Button oder im Dropdown sehen.'],[/^EMOJI$/,'Optionales Emoji zur schnelleren Zuordnung. Im Reaction-Modus ist es erforderlich.'],
      [/^STYLE$/,'Bestimmt nur die Discord-Buttonfarbe, nicht die Rollenfarbe.'],[/^TITEL$/,'Überschrift der öffentlichen Discord-Nachricht.'],
      [/^BESCHREIBUNG$/,'Erkläre kurz, welche Rollen Mitglieder hier auswählen können.']
    ],
    tickets: [
      [/^PANEL-KANAL$/,'Hier wird die öffentliche Nachricht mit den Ticket-Buttons veröffentlicht.'],[/^NEUE TICKETS$/,'In dieser Kategorie legt RAKU neue private Ticket-Kanäle an.'],
      [/^ARCHIV$/,'Optionales Ziel für geschlossene Tickets. Ohne Auswahl wird kein Auto-Archiv verwendet.'],[/^TRANSCRIPT-LOG$/,'Optionaler Textkanal für Hinweise zu gespeicherten Gesprächsprotokollen.'],
      [/MAX\. OFFEN/,'Begrenzt, wie viele Tickets ein einzelnes Mitglied gleichzeitig offen haben darf.'],[/^PRIORITÄT$/,'Hilft dem Support-Team, dringende Ticket-Typen schneller zu erkennen.'],
      [/^FORMULAR-TITEL$/,'Titel des Discord-Formulars, das vor dem Öffnen eines Tickets erscheint.'],[/^PLATZHALTER$/,'Beispieltext im Formularfeld; er wird nicht als Antwort gespeichert.']
    ],
    creators: [
      [/^PLATTFORM$/,'Wähle den Dienst, den RAKU überwachen soll.'],[/^EVENT$/,'Das Ereignis, das diese Automation auslöst, zum Beispiel Live-Start oder neuer Upload.'],
      [/TIKTOK HANDLE|TWITCH KANALNAME|YOUTUBE CHANNEL-ID/,'Identifiziert den Creator eindeutig für den Provider-Check.'],[/ANZEIGENAME/,'Optionaler Name für die Darstellung. Leer lassen, wenn der Provider ihn automatisch liefern soll.'],
      [/^ZIELKANAL$/,'Dorthin sendet RAKU eine Discord-Nachricht, wenn das Event erkannt wird.'],[/^PING-ROLLE$/,'Optional. Diese Rolle wird bei echten Events erwähnt; Testnachrichten pingen sie absichtlich nicht.'],
      [/^COOLDOWN$/,'Verhindert doppelte oder zu dicht aufeinanderfolgende Meldungen derselben Regel.'],[/AKTUELLEN STATUS/,'Ein = der bereits aktuelle Fund darf sofort angekündigt werden. Aus = er wird nur als Ausgangspunkt gespeichert.'],
      [/TITEL ENTHÄLT/,'Optionaler Filter. Nur Events, deren Titel diesen Text enthält, werden weiterverarbeitet.'],[/KATEGORIE.*SPIEL/,'Optionaler Twitch-Filter für Kategorie oder Spiel.'],
      [/^VERHALTEN$/,'Bestimmt, ob Events während der Ruhezeit komplett entfallen oder nur ohne Rollen-Ping gesendet werden.'],[/TEXT ÜBER DEM EMBED/,'Normaler Nachrichtentext oberhalb des gestalteten Discord-Embeds.'],
      [/EMBED-TITEL/,'Große Überschrift innerhalb des Discord-Embeds.'],[/EMBED-BESCHREIBUNG/,'Haupttext des Discord-Embeds. Variablen aus der Leiste können eingesetzt werden.'],[/AKZENTFARBE/,'Farbiger Seitenstreifen des Discord-Embeds.']
    ],
    voice: [
      [/CREATOR-KANAL/,'Der Eingang des Systems. Ein Join in diesen Voice-Kanal erzeugt einen neuen temporären Raum.'],[/ZIELKATEGORIE/,'Bestimmt, unter welcher Discord-Kategorie neue temporäre Räume erscheinen.'],
      [/NAMENSSCHEMA/,'Legt den automatischen Raumnamen fest. Die Variablen werden beim Erstellen ersetzt.'],[/MAXIMALE NUTZERZAHL/,'Maximale gleichzeitige Belegung des erzeugten Raums. 0 bedeutet unbegrenzt.'],
      [/BITRATE/,'Audioqualität des neuen Raums. 0 verwendet den Discord-Standard.'],[/CLEANUP DELAY/,'Wartezeit nach dem letzten Nutzer, bevor ein leerer temporärer Raum gelöscht wird.']
    ],
    diagnostics: [[/^TESTKANAL$/,'In diesen Kanal wird genau eine Diagnose-Nachricht geschickt. Es werden keine Servereinstellungen verändert.']]
  };
  window.RakuUxV2Data.sectionCaptions = {
    tickets: {'ROUTING':'Bestimmt, wo Tickets entstehen, landen und später archiviert werden.','SUPPORT TEAM':'Diese Rollen erhalten Zugriff auf Tickets und können sie übernehmen.','PANEL MESSAGE':'Das ist die öffentliche Startnachricht, die Mitglieder in Discord sehen.','TICKET TYPES':'Jeder Typ kann eigene Priorität, Beschreibung und Formularfragen besitzen.'},
    creators: {'SOURCE':'Auslöser dieser Automation: Dienst, Creator und Ereignis.','ROUTING':'Bestimmt, wohin das erkannte Event in Discord geschickt wird.','SMART FILTERS':'Optional: Lass nur Events durch, die wirklich zu deinen Kriterien passen.','QUIET HOURS':'Optional: Reduziere oder unterdrücke Benachrichtigungen in einem Zeitfenster.','MESSAGE DESIGNER':'Gestalte exakt, wie die Benachrichtigung später in Discord aussieht.'},
    voice: {'01 / ENTRY NODE':'Definiert den Eingang, der das automatische Erstellen eines Raums auslöst.','02 / ROOM BLUEPRINT':'Diese Werte werden auf jeden neu erzeugten Voice-Raum angewendet.'}
  };
})();
