(() => {
  const S = {
    guildId: null,
    config: null,
    snapshot: null,
    meta: null,
    range: 7,
    loading: null
  };

  window.RakuAnalytics = { s: S };

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function activeGuildId() {
    return typeof activeGuildData !== 'undefined' ? activeGuildData?.guild?.id : null;
  }

  function resetForGuild(guildId) {
    if (S.guildId === guildId) return;
    S.guildId = guildId;
    S.config = null;
    S.snapshot = null;
    S.meta = null;
    S.loading = null;
    S.range = 7;
  }

  async function load() {
    const guildId = activeGuildId();
    if (!guildId) return null;
    resetForGuild(guildId);
    const payload = await api(`/api/guilds/${guildId}/analytics?range=${S.range}`);
    S.config = payload.config;
    S.snapshot = payload.snapshot;
    S.meta = payload.meta;
    return payload;
  }

  async function ensureLoaded() {
    const guildId = activeGuildId();
    resetForGuild(guildId);
    if (S.config && S.snapshot) return;
    if (!S.loading) S.loading = load().finally(() => { S.loading = null; });
    await S.loading;
  }

  function num(value, digits = 0) {
    return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: digits });
  }

  function trend(value) {
    if (value === null || value === undefined) return '<span class="analytics-trend neutral">NEU</span>';
    const n = Number(value || 0);
    if (!n) return '<span class="analytics-trend neutral">±0 %</span>';
    return `<span class="analytics-trend ${n > 0 ? 'up' : 'down'}">${n > 0 ? '↑' : '↓'} ${num(Math.abs(n), 1)} %</span>`;
  }

  function dateLabel(value) {
    try { return new Date(`${value}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); }
    catch { return value; }
  }

  function activityChart() {
    const series = S.snapshot?.series || [];
    const maxMessages = Math.max(1, ...series.map(day => Number(day.messages || 0)));
    return `<div class="analytics-chart-bars">${series.map((day, index) => {
      const pct = Math.max(2, Math.round((Number(day.messages || 0) / maxMessages) * 100));
      const labelEvery = series.length <= 14 || index % Math.ceil(series.length / 10) === 0;
      return `<div class="analytics-day" title="${esc(dateLabel(day.date))}: ${num(day.messages)} Nachrichten · ${num(day.voiceMinutes)} Voice-Minuten">
        <div class="analytics-bar-track"><i style="height:${pct}%"></i></div>
        <span>${labelEvery ? esc(dateLabel(day.date)) : ''}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function hourHeatmap() {
    const hours = S.snapshot?.hours || Array(24).fill(0);
    const max = Math.max(1, ...hours);
    return `<div class="analytics-heatmap">${hours.map((value, hour) => {
      const alpha = value ? (0.16 + (value / max) * 0.72).toFixed(2) : '0.05';
      return `<div style="--heat:${alpha}" title="${String(hour).padStart(2, '0')}:00 · ${num(value)} Nachrichten"><b>${String(hour).padStart(2, '0')}</b><span>${num(value)}</span></div>`;
    }).join('')}</div>`;
  }

  function rankedList(items, unit) {
    const rows = items || [];
    if (!rows.length) return '<div class="analytics-empty-mini">Noch keine Daten für diesen Zeitraum.</div>';
    const max = Math.max(1, ...rows.map(item => Number(item.value || 0)));
    return `<div class="analytics-ranking">${rows.map((item, index) => `<div class="analytics-rank-row">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <div><b>${esc(item.name || item.id)}</b><i><u style="width:${Math.max(3, (Number(item.value || 0) / max) * 100)}%"></u></i></div>
      <strong>${num(item.value, 1)}${unit}</strong>
    </div>`).join('')}</div>`;
  }

  function commandList() {
    const rows = S.snapshot?.topCommands || [];
    if (!rows.length) return '<div class="analytics-empty-mini">Noch keine Custom-Command-Nutzung gemessen.</div>';
    return `<div class="analytics-command-list">${rows.map(item => `<span><b>${esc(item.id)}</b><strong>${num(item.value)}×</strong></span>`).join('')}</div>`;
  }

  function insightCards() {
    const items = S.snapshot?.insights || [];
    return `<div class="analytics-insights">${items.map(item => `<article class="${esc(item.tone || 'info')}"><i></i><div><b>${esc(item.title)}</b><p>${esc(item.text)}</p></div></article>`).join('')}</div>`;
  }

  function timezoneOptions() {
    const current = S.config?.timezone || 'Europe/Berlin';
    const zones = [...new Set([current, ...(S.meta?.timezones || [])])];
    return zones.map(zone => `<option value="${esc(zone)}" ${zone === current ? 'selected' : ''}>${esc(zone)}</option>`).join('');
  }

  function markup() {
    const c = S.config;
    const s = S.snapshot;
    const summary = s.summary;
    const enabled = Boolean(c.enabled);
    const started = c.startedAt ? new Date(c.startedAt).toLocaleDateString('de-DE') : 'Noch nicht gestartet';

    return `<div class="analytics-shell">
      <section class="analytics-head raku-module-hero">
        <div><span>SERVER INTELLIGENCE / ANALYTICS</span><h2>Verstehen statt raten.</h2><p>RAKU misst Server-Aktivität datensparsam als Aggregate und macht daraus Trends, Peaks und konkrete Signale für deinen Serverbetrieb.</p></div>
        <div class="analytics-head-actions">
          <label class="analytics-master"><input type="checkbox" data-a-enabled ${enabled ? 'checked' : ''}><i></i><b>${enabled ? 'TRACKING AKTIV' : 'TRACKING AUS'}</b></label>
          <button type="button" class="button button-ghost" data-a-refresh>Aktualisieren</button>
        </div>
      </section>

      <div class="analytics-toolbar">
        <div class="analytics-range" role="group" aria-label="Zeitraum">
          ${[7,30,90].map(days => `<button type="button" data-a-range="${days}" class="${S.range === days ? 'active' : ''}">${days} Tage</button>`).join('')}
        </div>
        <div class="analytics-live"><i></i><span>${num(s.live?.members)} Mitglieder</span><span>${num(s.live?.voiceUsers)} gerade in Voice</span><em>${esc(s.timezone)}</em></div>
      </div>

      ${enabled ? '' : `<section class="analytics-paused"><i>Ⅱ</i><div><b>Datenerfassung ist pausiert.</b><span>Vorhandene Statistiken bleiben sichtbar. Neue Aktivität wird erst nach Aktivierung erfasst.</span></div><button type="button" data-a-enable-now>Tracking aktivieren</button></section>`}

      <section class="analytics-kpis">
        <article><span>NACHRICHTEN</span><b>${num(summary.messages)}</b>${trend(s.trends.messages)}<small>ohne Bots & Webhooks</small></article>
        <article><span>NETTO-WACHSTUM</span><b class="${summary.netGrowth < 0 ? 'negative' : ''}">${summary.netGrowth > 0 ? '+' : ''}${num(summary.netGrowth)}</b><small>${num(summary.joins)} Joins · ${num(summary.leaves)} Leaves</small></article>
        <article><span>VOICE-ZEIT</span><b>${num(summary.voiceMinutes / 60, 1)}h</b>${trend(s.trends.voiceMinutes)}<small>${num(summary.voiceSessions)} Sessions · Peak ${num(summary.peakVoice)}</small></article>
        <article><span>TICKETS</span><b>${num(summary.ticketsOpened)}</b>${trend(s.trends.ticketsOpened)}<small>${num(summary.ticketsClosed)} geschlossen · Ø ${num(summary.avgTicketMinutes)} Min.</small></article>
        <article><span>COMMANDS</span><b>${num(summary.commands)}</b>${trend(s.trends.commands)}<small>ausgeführte Custom Commands</small></article>
        <article><span>CREATOR EVENTS</span><b>${num(summary.creatorEvents)}</b><small>gesendete Social-Benachrichtigungen</small></article>
      </section>

      <div class="analytics-main-grid">
        <section class="analytics-card analytics-activity">
          <header><div><span>ACTIVITY TREND</span><b>Chat-Aktivität über ${S.range} Tage</b></div><small>Nachrichten pro Tag</small></header>
          ${activityChart()}
        </section>
        <section class="analytics-card analytics-signal-card">
          <header><div><span>SERVER SIGNALS</span><b>Was auffällt</b></div><small>regelbasiert · keine Blackbox</small></header>
          ${insightCards()}
        </section>
      </div>

      <section class="analytics-card analytics-rhythm">
        <header><div><span>ACTIVITY RHYTHM</span><b>Wann dein Server schreibt</b></div><small>Stunden in ${esc(s.timezone)}</small></header>
        ${hourHeatmap()}
      </section>

      <div class="analytics-detail-grid">
        <section class="analytics-card"><header><div><span>TEXT CHANNELS</span><b>Wo Aktivität entsteht</b></div><small>Nachrichten</small></header>${rankedList(s.topMessageChannels, '')}</section>
        <section class="analytics-card"><header><div><span>VOICE CHANNELS</span><b>Wo gesprochen wird</b></div><small>Minuten</small></header>${rankedList(s.topVoiceChannels, ' Min.')}</section>
        <section class="analytics-card"><header><div><span>COMMAND USAGE</span><b>Meistgenutzte Commands</b></div><small>${num(summary.commands)} Aufrufe</small></header>${commandList()}</section>
      </div>

      <section class="analytics-ops">
        <article><span>MODERATION</span><b>${num(summary.moderationActions)}</b><small>Ban/Unban/Timeout-Aktionen</small></article>
        <article><span>TICKET RESOLUTION</span><b>${summary.ticketsClosed ? `${num(summary.avgTicketMinutes)} Min.` : '—'}</b><small>Durchschnitt geschlossener Tickets</small></article>
        <article><span>DATEN SEIT</span><b>${esc(started)}</b><small>nur aggregierte Aktivitätsdaten</small></article>
      </section>

      <details class="analytics-settings">
        <summary><div><span>DATA CONTROL</span><b>Datenerfassung & Aufbewahrung</b><small>Zeitzone, Historie und Reset verwalten.</small></div><strong>Öffnen ↓</strong></summary>
        <div class="analytics-settings-body">
          <label><span>ZEITZONE</span><select data-a-timezone>${timezoneOptions()}</select><small>Bestimmt Tagesgrenzen und das Aktivitätsraster.</small></label>
          <label><span>AUFBEWAHRUNG</span><input type="number" min="30" max="365" data-a-retention value="${Number(c.retentionDays || 90)}"><small>30–365 Tage. Ältere Aggregate werden automatisch entfernt.</small></label>
          <div class="analytics-privacy"><i>✓</i><div><b>Privacy by design</b><span>Keine Nachrichteninhalte und keine Nutzer-IDs werden im Analytics-Datensatz gespeichert. Persistiert werden nur Zähler, Channel-IDs und Zeitaggregate.</span></div></div>
          <button type="button" class="button button-primary" data-a-save-settings>Einstellungen speichern</button>
          <button type="button" class="button button-ghost analytics-reset" data-a-reset>Daten zurücksetzen</button>
        </div>
      </details>
    </div>`;
  }

  async function renderAnalytics() {
    const root = document.querySelector('#guildWorkspace');
    if (!root) return;
    root.dataset.rakuTab = 'analytics';
    root.classList.add('raku-workspace-v1');
    if (!S.config || !S.snapshot) {
      root.innerHTML = '<div class="analytics-loading">Server Intelligence wird geladen …</div>';
      try {
        await ensureLoaded();
        if (typeof activeTab === 'undefined' || activeTab !== 'analytics') return;
      } catch (error) {
        root.innerHTML = `<div class="analytics-loading">${esc(error.message)}</div>`;
        return;
      }
    }
    root.innerHTML = markup();
    wire();
  }

  async function patchConfig(patch) {
    const guildId = activeGuildId();
    if (!guildId) return;
    const payload = await api(`/api/guilds/${guildId}/analytics`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, range: S.range })
    });
    S.config = payload.config;
    S.snapshot = payload.snapshot;
    S.meta = payload.meta;
    ensureAnalyticsNav();
    decorateOverview();
  }

  function wire() {
    document.querySelectorAll('[data-a-range]').forEach(button => button.addEventListener('click', async () => {
      S.range = Number(button.dataset.aRange) || 7;
      S.snapshot = null;
      try { await load(); renderAnalytics(); } catch (error) { toast(error.message, 'error'); }
    }));

    document.querySelector('[data-a-refresh]')?.addEventListener('click', async () => {
      try { await load(); renderAnalytics(); toast('Analytics aktualisiert.'); } catch (error) { toast(error.message, 'error'); }
    });

    document.querySelector('[data-a-enabled]')?.addEventListener('change', async event => {
      const checkbox = event.currentTarget;
      checkbox.disabled = true;
      try {
        await patchConfig({ enabled: checkbox.checked });
        toast(checkbox.checked ? 'Analytics-Tracking aktiviert.' : 'Analytics-Tracking pausiert.');
        renderAnalytics();
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        checkbox.disabled = false;
        toast(error.message, 'error');
      }
    });

    document.querySelector('[data-a-enable-now]')?.addEventListener('click', async () => {
      try { await patchConfig({ enabled: true }); toast('Analytics-Tracking aktiviert.'); renderAnalytics(); } catch (error) { toast(error.message, 'error'); }
    });

    document.querySelector('[data-a-save-settings]')?.addEventListener('click', async () => {
      const timezone = document.querySelector('[data-a-timezone]')?.value || S.config.timezone;
      const retentionDays = Number(document.querySelector('[data-a-retention]')?.value || S.config.retentionDays);
      try { await patchConfig({ timezone, retentionDays }); toast('Analytics-Einstellungen gespeichert.'); renderAnalytics(); } catch (error) { toast(error.message, 'error'); }
    });

    document.querySelector('[data-a-reset]')?.addEventListener('click', async () => {
      if (!confirm('Alle bisher gesammelten Analytics-Daten dieses Servers wirklich löschen?')) return;
      try {
        const payload = await api(`/api/guilds/${activeGuildId()}/analytics/data`, { method: 'DELETE' });
        S.config = payload.config;
        S.snapshot = payload.snapshot;
        S.meta = payload.meta;
        toast('Analytics-Daten wurden zurückgesetzt.');
        renderAnalytics();
      } catch (error) { toast(error.message, 'error'); }
    });
  }

  function navStatus() {
    if (!S.config) return ['', 'Analytics'];
    return S.config.enabled ? ['on', `${S.range}d Tracking`] : ['', 'Pausiert'];
  }

  function ensureAnalyticsNav() {
    const nav = document.querySelector('.deck-nav');
    if (!nav) return;
    const groups = [...nav.querySelectorAll('.raku-nav-group')];
    const system = groups.find(group => group.querySelector('.deck-nav-label')?.textContent.trim() === 'SYSTEM');
    if (!system) return;
    let button = nav.querySelector('.deck-nav-item[data-tab="analytics"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'deck-nav-item';
      button.dataset.tab = 'analytics';
      button.innerHTML = `${typeof icon === 'function' ? icon('activity') : ''}<span>Analytics</span><small></small>`;
      button.addEventListener('click', () => switchTab('analytics'));
      const diagnostics = system.querySelector('[data-tab="diagnostics"]');
      if (diagnostics) diagnostics.insertAdjacentElement('beforebegin', button);
      else system.appendChild(button);
    }
    button.classList.toggle('active', typeof activeTab !== 'undefined' && activeTab === 'analytics');
    const [cls, text] = navStatus();
    const small = button.querySelector('small');
    if (small) small.innerHTML = `<span class="raku-nav-node ${cls}"></span><span>${esc(text)}</span>`;
  }

  function decorateOverview() {
    if (typeof activeTab === 'undefined' || activeTab !== 'overview') return;
    const grid = document.querySelector('.raku-module-grid');
    if (!grid) return;
    let card = grid.querySelector('[data-raku-open="analytics"]');
    const on = Boolean(S.config?.enabled);
    const stat = !S.config ? 'Bereit' : (on ? `${S.range} Tage sichtbar` : 'Tracking pausiert');
    const html = `<div class="raku-card-top"><span>SYSTEM</span><i class="raku-control-node"><u></u></i></div><b>Server Analytics</b><p>Wachstum, Chat, Voice, Tickets und Automationen als echte Server-Trends.</p><footer><span>${on ? 'AKTIV' : 'BEREIT'}</span><em>${esc(stat)}</em><strong>→</strong></footer>`;
    if (!card) {
      card = document.createElement('button');
      card.type = 'button';
      card.className = `raku-module-card ${on ? 'on' : ''}`;
      card.dataset.rakuOpen = 'analytics';
      grid.appendChild(card);
      card.addEventListener('click', () => switchTab('analytics'));
    }
    card.classList.toggle('on', on);
    card.innerHTML = html;
  }

  function installHooks() {
    if (typeof getInitialTab === 'function') {
      const previous = getInitialTab;
      getInitialTab = function getInitialTabWithAnalytics() {
        if (new URLSearchParams(location.search).get('tab') === 'analytics') return 'analytics';
        return previous();
      };
    }

    if (typeof activeModuleCount === 'function') {
      const previous = activeModuleCount;
      activeModuleCount = function activeModuleCountWithAnalytics(settings) {
        return previous(settings) + (S.config?.enabled ? 1 : 0);
      };
    }

    if (typeof renderGuildWorkspace === 'function') {
      const previous = renderGuildWorkspace;
      renderGuildWorkspace = function renderGuildWorkspaceWithAnalytics(tab) {
        if (tab === 'analytics') {
          renderAnalytics();
          ensureAnalyticsNav();
          return;
        }
        previous(tab);
        if (tab === 'overview') decorateOverview();
        ensureAnalyticsNav();
      };
    }

    if (typeof renderGuildShell === 'function') {
      const previous = renderGuildShell;
      renderGuildShell = function renderGuildShellWithAnalytics() {
        previous();
        const guildId = activeGuildId();
        resetForGuild(guildId);
        ensureAnalyticsNav();
        if (!S.config && guildId) {
          ensureLoaded().then(() => {
            ensureAnalyticsNav();
            if (typeof activeTab !== 'undefined' && activeTab === 'overview') decorateOverview();
            if (typeof activeTab !== 'undefined' && activeTab === 'analytics') renderAnalytics();
          }).catch(error => console.warn('[ANALYTICS UI] Load failed:', error));
        }
      };
    }

    setInterval(async () => {
      if (typeof activeTab === 'undefined' || activeTab !== 'analytics' || !activeGuildId()) return;
      try { await load(); renderAnalytics(); } catch {}
    }, 30000);
  }

  installHooks();
})();
