(() => {
  const match = window.location.pathname.match(/^\/guild\/(\d+)\/?$/);
  if (!match) return;

  const guildId = match[1];
  let mounted = false;

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function notify(message, type = 'ok') {
    const host = document.querySelector('#toastHost');
    if (!host) return;

    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.innerHTML = `
      <div class="toast-icon">${type === 'error' ? '!' : '✓'}</div>
      <div><strong>${type === 'error' ? 'Fehler' : 'Erledigt'}</strong><span>${escapeHtml(message)}</span></div>`;
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add('visible'));
    setTimeout(() => {
      node.classList.remove('visible');
      setTimeout(() => node.remove(), 220);
    }, 3200);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || 'Die Anfrage ist fehlgeschlagen.');
    }
    return payload;
  }

  function channelOptions(channels) {
    if (!channels.length) return '<option value="">Kein beschreibbarer Kanal verfügbar</option>';

    return '<option value="">Kanal auswählen …</option>' + channels.map(channel => {
      const label = channel.parent ? `${channel.parent} / #${channel.name}` : `#${channel.name}`;
      return `<option value="${channel.id}">${escapeHtml(label)}</option>`;
    }).join('');
  }

  async function mount() {
    if (mounted) return;

    const stack = document.querySelector('.module-stack');
    const sidebar = document.querySelector('.module-sidebar');
    if (!stack || !sidebar) return;

    mounted = true;

    try {
      const data = await request(`/api/guilds/${guildId}/dashboard`);
      const channels = data.channels || [];

      const card = document.createElement('article');
      card.className = 'module-card is-enabled';
      card.id = 'module-test-message';
      card.innerHTML = `
        <div class="module-head">
          <div class="module-title-wrap">
            <div class="module-glyph">T</div>
            <div>
              <div class="module-eyebrow">DIAGNOSE</div>
              <div class="module-heading-line">
                <h3>Testnachricht</h3>
                <span class="module-state enabled">Tool</span>
              </div>
              <p>Prüfe den kompletten Weg vom Dashboard bis in einen Discord-Kanal.</p>
            </div>
          </div>
        </div>
        <div class="module-body">
          <div class="config-split compact-split">
            <label class="field">
              <span class="field-label">Zielkanal</span>
              <select id="testMessageChannel">${channelOptions(channels)}</select>
              <small>Es erscheinen nur Kanäle, in denen der Bot schreiben darf.</small>
            </label>

            <div id="testMessageStatus" class="test-result">
              <div class="test-result-icon">→</div>
              <div>
                <strong>Bereit zum Test</strong>
                <span>Die Aktion speichert keine Konfiguration.</span>
              </div>
            </div>
          </div>

          <div class="test-action-row">
            <span>5 Sekunden Cooldown gegen versehentliches Spam-Klicken.</span>
            <button id="sendTestMessage" class="button secondary compact" type="button" ${channels.length ? '' : 'disabled'}>Test senden</button>
          </div>
        </div>`;

      stack.prepend(card);

      const link = document.createElement('a');
      link.href = '#module-test-message';
      link.innerHTML = '<span class="nav-glyph">T</span><span>Testnachricht</span><i class="nav-state on"></i>';
      const labels = sidebar.querySelectorAll('.sidebar-label');
      const moduleLabel = labels.length > 1 ? labels[1] : null;
      if (moduleLabel?.nextSibling) sidebar.insertBefore(link, moduleLabel.nextSibling);
      else sidebar.appendChild(link);

      link.addEventListener('click', () => {
        sidebar.querySelectorAll('a').forEach(item => item.classList.remove('active'));
        link.classList.add('active');
      });

      const button = card.querySelector('#sendTestMessage');
      const select = card.querySelector('#testMessageChannel');
      const status = card.querySelector('#testMessageStatus');

      button?.addEventListener('click', async () => {
        const channelId = select.value;
        if (!channelId) {
          notify('Bitte zuerst einen Kanal auswählen.', 'error');
          return;
        }

        button.disabled = true;
        button.textContent = 'Sendet …';
        status.innerHTML = '<div class="test-result-icon">…</div><div><strong>Nachricht wird gesendet</strong><span>Discord-Verbindung und Kanalrechte werden geprüft.</span></div>';

        try {
          const result = await request(`/api/guilds/${guildId}/test-message`, {
            method: 'POST',
            body: JSON.stringify({ channelId })
          });

          status.innerHTML = `<div class="test-result-icon">✓</div><div><strong>Erfolgreich</strong><span>Nachricht wurde in #${escapeHtml(result.channelName)} gepostet.</span></div>`;
          notify(`Testnachricht in #${result.channelName} gesendet.`);
        } catch (error) {
          status.innerHTML = `<div class="test-result-icon">!</div><div><strong>Fehlgeschlagen</strong><span>${escapeHtml(error.message)}</span></div>`;
          notify(error.message, 'error');
        } finally {
          setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Test senden';
          }, 5000);
        }
      });
    } catch (error) {
      mounted = false;
      console.error('[TEST MESSAGE UI]', error);
    }
  }

  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
