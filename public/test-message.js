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
    node.textContent = message;
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add('visible'));
    setTimeout(() => {
      node.classList.remove('visible');
      setTimeout(() => node.remove(), 220);
    }, 3000);
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
      card.className = 'module-card';
      card.id = 'module-test-message';
      card.innerHTML = `
        <div class="module-head">
          <div class="module-title-wrap">
            <div class="module-icon">🧪</div>
            <div>
              <div class="module-kicker">Bot-Test</div>
              <h3>Testnachricht senden</h3>
              <p>Prüfe sofort, ob der Bot in einem bestimmten Kanal schreiben kann.</p>
            </div>
          </div>
        </div>
        <div class="module-body">
          <div class="form-grid two">
            <label class="field">
              <span>Zielkanal</span>
              <select id="testMessageChannel">${channelOptions(channels)}</select>
              <small>Es werden nur Kanäle angezeigt, in denen der Bot schreiben darf.</small>
            </label>
            <div class="field hint-field">
              <span>Status</span>
              <div id="testMessageStatus" class="module-placeholder">
                <strong>Bereit zum Testen</strong>
                <span>Es werden keine Einstellungen gespeichert.</span>
              </div>
            </div>
          </div>
          <button id="sendTestMessage" class="button secondary" ${channels.length ? '' : 'disabled'}>
            Testnachricht senden
          </button>
        </div>`;

      stack.prepend(card);

      const link = document.createElement('a');
      link.href = '#module-test-message';
      link.innerHTML = '<span>🧪</span> Testnachricht';
      const firstModuleLink = sidebar.querySelector('a');
      if (firstModuleLink) sidebar.insertBefore(link, firstModuleLink);
      else sidebar.appendChild(link);

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
        button.textContent = 'Wird gesendet …';
        status.innerHTML = '<strong>Sendet …</strong><span>Der Bot prüft gerade den ausgewählten Kanal.</span>';

        try {
          const result = await request(`/api/guilds/${guildId}/test-message`, {
            method: 'POST',
            body: JSON.stringify({ channelId })
          });

          status.innerHTML = `<strong>Erfolgreich gesendet</strong><span>Nachricht wurde in #${escapeHtml(result.channelName)} gepostet.</span>`;
          notify(`Testnachricht in #${result.channelName} gesendet.`);
        } catch (error) {
          status.innerHTML = `<strong>Senden fehlgeschlagen</strong><span>${escapeHtml(error.message)}</span>`;
          notify(error.message, 'error');
        } finally {
          button.disabled = false;
          button.textContent = 'Testnachricht senden';
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
