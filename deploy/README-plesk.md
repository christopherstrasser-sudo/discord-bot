# ORBIT von Windows auf Plesk + Docker umziehen

Stand: Oktober 2026. Repository: `christopherstrasser-sudo/discord-bot`.

## Architektur

- Ein Linux-Container (Node.js, Discord-Bot, Express-Web-Dashboard, Creator Alerts).
- Debian Chromium im Image für TikTok; Docker läuft als unprivilegierter Benutzer `node` (UID 1000). Die Browser laufen mit `--no-sandbox` in der Docker-Umgebung; den Host und Docker aktuell halten.
- Plesk/nginx leitet `https://orbit.raku.systems` auf **nur lokal** `127.0.0.1:3100` weiter (Container-Port 3000). Port 3100 darf nicht öffentlich freigegeben werden.
- Persistente Ordner `/opt/orbit/data` und `/opt/orbit/logs` sind Bind-Mounts. Keine separate Datenbank notwendig.
- Container-Restart-Policy `unless-stopped`; Healthcheck prüft HTTP am internen Dashboard.

## 1. Linux vorbereiten (Windows-Bot läuft noch)

Docker mit Compose v2 und Plesk Docker-Erweiterung vorausgesetzt. Einmal über SSH:

```bash
sudo git clone https://github.com/christopherstrasser-sudo/discord-bot.git /opt/orbit
cd /opt/orbit
# Sobald der Docker-PR nach main gemergt wurde:
sudo git pull --ff-only
sudo mkdir -p data logs
sudo chown -R 1000:1000 data logs
docker compose build
```

Wird der Change nur auf dem Branch getestet, nach dem Klonen `git checkout feature/orbit-linux-docker-plesk` vor `docker compose build` ausführen. Ein Compose-Stack in der Plesk-Oberfläche benötigt die lokalen Build-Dateien (nicht bloß den YAML-Text); CLI über SSH ist hier der eindeutigere Weg. Plesk kann Docker-Container anschließend verwalten.

Docker-Image erst vorproduzieren; **nicht** starten, solange die Windows-Instanz aktiv ist.

## 2. Windows-Daten und Geheimnisse sichern

Auf Windows im **aktiven** ORBIT-Projektordner (dort, wo `start.cmd` liegt) notieren, wie der Dienst gestartet wird. Danach zum Umschaltzeitpunkt die Windows-Instanz vollständig beenden und erst dann ein finales Backup ziehen.

PowerShell im ORBIT-Ordner:

```powershell
Compress-Archive -Path .\data -DestinationPath .\orbit-data.zip -Force
Copy-Item .\.env .\orbit.env.backup
```

Wichtig:
- Der gesamte Ordner `data/` muss übertragen werden, nicht nur `guild-settings.json`. Er enthält u.a. Creator-Alert-Regeln, State/Ledger, Custom Bots, Ticket- und Analyse-Daten.
- Der **identische** `SESSION_SECRET` aus der Windows-`.env` ist nötig, um gespeicherte individuelle Bot-Tokens zu entschlüsseln.
- `.env` und Backups enthalten Zugangsdaten und gehören **niemals ins öffentliche GitHub-Repository** oder ins Webroot.
- Windows nur dann als gestoppt betrachten, wenn kein `node.exe`-Prozess ORBIT mehr ausführt (auch Autostart oder Dienste prüfen).

Die Dateien `orbit-data.zip` und `orbit.env.backup` z.B. mit WinSCP/SFTP auf den Linux-Server nach `/tmp` hochladen (nicht öffentlich). Zugangsdaten niemals im Chat posten.

## 3. Daten auf Linux einspielen

```bash
cd /opt/orbit
sudo unzip -o /tmp/orbit-data.zip -d /opt/orbit
sudo install -o root -g root -m 600 /tmp/orbit.env.backup /opt/orbit/.env
sudo mkdir -p data logs
sudo chown -R 1000:1000 data logs
sudo chmod -R u+rwX data logs
sudo nano /opt/orbit/.env
```

Im Editor:
- `PUBLIC_BASE_URL=https://orbit.raku.systems`
- `PORT=3000`
- Discord-Client-ID, Client-Secret, Bot-Token, Twitch-Keys und **SESSION_SECRET unverändert** lassen.
- Keine zusätzlichen Secrets ins Compose-File schreiben.

Vertrauliche temporäre Sicherungen nach erfolgreicher Migration sicher vom Linux-Server entfernen, z.B. `sudo rm -f /tmp/orbit-data.zip /tmp/orbit.env.backup`. Backups an einem sicheren, getrennten Ort aufbewahren.

## 4. Plesk / Domain vorbereiten

1. In Plesk sicherstellen, dass `orbit.raku.systems` als (Sub-)Domain eingerichtet ist, nginx läuft und HTTPS mit einem gültigen Zertifikat aktiviert werden kann.
2. DNS-A/AAAA-Einträge auf den Linux-Server setzen, wenn der Schnitt erfolgt. Ggf. alte AAAA-Einträge prüfen.
3. In **Discord Developer Portal → OAuth2 → Redirects** die exakte URI `https://orbit.raku.systems/auth/discord/callback` ergänzen; erst später den alten Callback entfernen.
4. Für Plesk/nginx die Domain auf den Container-Port **3000**, lokal gebunden an Host-Port **3100**, proxyen. Wenn der Docker-Container in **Websites & Domains → orbit.raku.systems → Docker Proxy Rules** aufgeführt wird, über eine Regel den Hauptpfad `/` mit der manuellen Zuordnung `3000 → 3100` verbinden. Portfreigabe nur an `127.0.0.1`.
5. Falls das Plesk-Menü keinen CLI-gestarteten Compose-Container als Proxy-Ziel anbietet, alternativ in **Apache & nginx-Einstellungen → Zusätzliche nginx-Anweisungen** eine Reverse-Proxy-Regel auf `http://127.0.0.1:3100` erstellen. Vorhandene nginx-Regeln auf Konflikte prüfen. Nicht zwei konkurrierende Proxy-Regeln anlegen.

Beispiel für eine *alternative* manuelle nginx-Regel, sofern keine Docker Proxy Rule gesetzt ist:

```nginx
location ~ ^/.* {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Plesk verwaltet die TLS-Terminierung. Im Container bleibt HTTP auf Port 3000. ORBIT vertraut bei `PUBLIC_BASE_URL=https://...` genau einem Reverse Proxy und setzt sichere Cookies.

## 5. Cutover: Docker erst NACH Windows-Stopp starten

```bash
cd /opt/orbit
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=150 orbit
curl -I http://127.0.0.1:3100/
```

Erwartung: Container läuft, Healthcheck wird `healthy`, HTTP antwortet (200/302/304 sind möglich). Danach `https://orbit.raku.systems` besuchen, Discord-Login prüfen, mindestens eine Server-Konfiguration, eine Creator-Alert-Quelle, TikTok-Browserdiagnostik und einen Custom Bot kontrollieren. Mit echtem Alert-Test bewusst auf Discord-Nachrichten achten.

**Keine zweite ORBIT-Instanz parallel starten.** Mehrfach laufende Bots können doppelte Events/Alerts verursachen; zwei Writer auf getrennten Datenkopien erzeugen zudem divergierenden Zustand.

## Updates, Backups, Rollback

Update:

```bash
cd /opt/orbit
sudo git pull --ff-only
sudo docker compose up -d --build
sudo docker compose logs --tail=100 orbit
```

Vor Updates und regelmäßig nachher `.env` und `data/` sicher offline sichern. `docker compose down -v` und das Löschen des gemounteten `data/` vermeiden. Die Daten bleiben bei normalen Container-Rebuilds erhalten.

Rollback:
1. Docker stoppen: `sudo docker compose down` (ohne `-v`).
2. Domain und Discord OAuth-Redirect auf Windows zurückstellen, wenn erforderlich.
3. Windows-Backup ggf. wiederherstellen und **nur** Windows-ORBIT starten.
4. Während Linux aktiv war entstandene Änderungen/Events sind nicht automatisch zurücksynchronisiert. Bei Bedarf vorher Linux-`data/` sichern und den Zustand bewusst abgleichen.

## Hinweise

- Das aktuelle Projekt hat noch kein versioniertes `package-lock.json`; bei `npm install` kann sich ein transitive Dependency-Stand zwischen Builds ändern. Später einen geprüften Lockfile ergänzen und `npm ci` nutzen.
- Browser-Sessions in `node_modules/tiktok-signature/.chrome-profile` sind temporär und werden nicht migriert. Persistenter Creator-Alert-Verlauf und TikTok-Handle-Cache liegen unter `data/`.
- Der TikTok Signature Engine-Child-Prozess bleibt innerhalb des Containers auf `127.0.0.1`. Öffentliche Freigabe von Port 31887 ist nicht nötig.
- Je nach Hosting-Plan kann Chromium beträchtliche RAM-/CPU-Ressourcen benötigen. Bei TikTok-Problemen zuerst `docker compose logs` und die Plesk Docker-Ressourcen prüfen.
