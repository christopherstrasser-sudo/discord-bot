(() => {
  const C = window.RakuCreatorHub;
  if (!C) return;
  const S = C.s;
  const E = C.esc;

  const SOCIAL = ['instagram', 'bluesky', 'x'];
  const PLATFORM_NAMES = { instagram: 'Instagram', bluesky: 'Bluesky', x: 'X' };
  const MARKS = { twitch: 'TW', youtube: 'YT', tiktok: 'TT', instagram: 'IG', bluesky: 'BS', x: 'X' };
  const SUBTITLES = {
    twitch: 'HELIX LIVE', youtube: 'UPLOAD FEED', tiktok: 'LIVE / UPLOAD',
    instagram: 'BROWSERLESS HTTP', bluesky: 'ATPROTO FEED', x: 'X.MD RELAY'
  };

  const originalPlatform = C.platform;
  const originalEventName = C.eventName;
  const originalEvents = C.events;
  const originalDefaults = C.defaults;
  const originalPreviewVars = C.previewVars;
  const originalRender = C.render;

  C.platform = platform => PLATFORM_NAMES[platform] || originalPlatform(platform);
  C.eventName = event => event === 'post' ? 'Neuer Post' : originalEventName(event);
  C.events = platform => SOCIAL.includes(platform) ? [['post', 'Neuer Post']] : originalEvents(platform);

  C.defaults = (platform, event = null) => {
    if (platform === 'instagram') return {
      event: 'post', color: '#E1306C', buttonLabel: 'Post ansehen', message: '{creator} hat einen neuen Instagram-Post veröffentlicht!',
      embedTitle: '📸 Neuer Instagram-Post von {creator}', embedDescription: '**{title}**\n\nJetzt auf Instagram ansehen.'
    };
    if (platform === 'bluesky') return {
      event: 'post', color: '#1185FE', buttonLabel: 'Post ansehen', message: '{creator} hat einen neuen Bluesky-Post veröffentlicht!',
      embedTitle: '🦋 Neuer Bluesky-Post von {creator}', embedDescription: '**{title}**\n\nJetzt auf Bluesky ansehen.'
    };
    if (platform === 'x') return {
      event: 'post', color: '#E7E9EA', buttonLabel: 'Post ansehen', message: '{creator} hat einen neuen Post auf X veröffentlicht!',
      embedTitle: '✦ Neuer Post von {creator}', embedDescription: '**{title}**\n\nJetzt auf X ansehen.'
    };
    return originalDefaults(platform, event);
  };

  C.previewVars = rule => {
    const vars = originalPreviewVars(rule);
    if (rule.platform === 'instagram') Object.assign(vars, { title: 'Heute gibt es etwas Neues aus der Community ✨', game: '', viewers: '0', platform: 'Instagram' });
    if (rule.platform === 'bluesky') Object.assign(vars, { title: 'Kleines Update direkt aus Bluesky – schaut mal rein.', game: '', viewers: '0', platform: 'Bluesky' });
    if (rule.platform === 'x') Object.assign(vars, { title: 'Ein neuer Post ist gerade auf X erschienen.', game: '', viewers: '0', platform: 'X' });
    return vars;
  };

  function providerState(platform) {
    const health = C.providerHealth(platform);
    if (!health.configured) {
      if (platform === 'twitch') return { cls: 'missing', label: 'CREDENTIALS FEHLEN', copy: 'Twitch App-Zugangsdaten hinterlegen.' };
      if (platform === 'tiktok') return { cls: 'missing', label: 'ADAPTER FEHLT', copy: 'Kein zuverlässiger TikTok-Provider verbunden.' };
      return { cls: 'missing', label: 'NICHT KONFIGURIERT', copy: 'Provider-Zugangsdaten fehlen.' };
    }

    if (platform === 'instagram' && health.tlsImpersonation !== true && health.serverProviderConfigured === false) {
      return {
        cls: 'missing',
        label: 'BACKEND PROVIDER FEHLT',
        copy: 'Der zentrale RAKU Instagram-Provider ist noch nicht verbunden. Nutzer brauchen später trotzdem nur den Handle – keine eigenen API-Keys.'
      };
    }

    if (health.lastError && !health.ok) return { cls: 'bad', label: 'DEGRADED', copy: health.lastError };
    if (!health.lastCheckedAt) {
      if (platform === 'instagram') return { cls: 'ready', label: 'READY', copy: 'Browserloser TLS-HTTP-Abruf · kein Chrome-Prozess, Login oder eigener API-Key nötig.' };
      if (platform === 'bluesky') return { cls: 'ready', label: 'READY', copy: 'Public AppView · kein API-Key nötig.' };
      if (platform === 'x') return { cls: 'ready', label: 'READY', copy: 'Serverseitiger X-Read-Relay · kein X-Login oder API-Key nötig.' };
    }
    if (health.ok) return {
      cls: 'ok', label: 'HEALTHY',
      copy: health.lastSuccessAt ? `Letzter Erfolg ${new Date(health.lastSuccessAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Provider bereit.'
    };
    if (platform === 'youtube') return { cls: 'ready', label: 'READY', copy: 'RSS Feed · kein API-Key nötig.' };
    return { cls: 'ready', label: 'READY', copy: 'Wartet auf den ersten Provider-Check.' };
  }

  C.providerCard = platform => {
    const state = providerState(platform);
    const health = C.providerHealth(platform);
    return `<article class="creator-provider ${C.platformClass(platform)} ${state.cls}" data-provider="${platform}">
      <div class="creator-provider-top"><span class="creator-platform-mark">${MARKS[platform] || '?'}</span><div><b>${C.platform(platform)}</b><small>${SUBTITLES[platform] || 'CREATOR FEED'}</small></div><i></i></div>
      <strong>${state.label}</strong><p>${E(state.copy)}</p>
      <footer><span>${state.cls === 'missing' ? 'SETUP REQUIRED' : 'READY'}</span><span>${health.lastCheckedAt ? new Date(health.lastCheckedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'NO CHECK'}</span></footer>
    </article>`;
  };

  C.ruleList = () => S.cfg.rules.map((rule, index) => `<button class="creator-rule-item ${rule.id === S.ruleId ? 'on' : ''}" data-creator-rule="${rule.id}">
    <span class="creator-source-icon ${C.platformClass(rule.platform)}">${MARKS[rule.platform] || '?'}</span>
    <div><b>${E(rule.name)}</b><small>${E(rule.source || 'Noch nicht verbunden')} · ${E(C.eventName(rule.event))}</small></div>
    <i class="${rule.enabled ? 'on' : ''}"></i><em>${String(index + 1).padStart(2, '0')}</em>
  </button>`).join('');

  function addPlatformOptions() {
    const select = document.querySelector('[data-cr-platform]');
    const rule = C.rule();
    if (!select || !rule) return;
    for (const platform of SOCIAL) {
      if (!select.querySelector(`option[value="${platform}"]`)) {
        const option = document.createElement('option');
        option.value = platform;
        option.textContent = C.platform(platform);
        select.appendChild(option);
      }
    }
    select.value = rule.platform;
  }

  function patchSourceField() {
    const rule = C.rule();
    const input = document.querySelector('[data-cr-source]');
    const label = input?.closest('label');
    if (!rule || !input || !label || !SOCIAL.includes(rule.platform)) return;
    const title = label.querySelector(':scope > span');
    const help = label.querySelector(':scope > small');
    const data = {
      instagram: {
        title: 'Instagram Handle', placeholder: 'rakulein',
        help: 'Öffentliches Profil. Browserloser HTTP-Abruf mit Chrome-kompatiblem Netzwerk-Fingerprint; kein lokaler Browser, Instagram-Login oder eigener API-Key nötig.'
      },
      bluesky: {
        title: 'Bluesky Handle', placeholder: 'rakulein.bsky.social',
        help: 'Handle wie name.bsky.social oder bsky.app/profile/... URL. Kein API-Key nötig.'
      },
      x: {
        title: 'X Handle', placeholder: 'rakulein',
        help: 'Öffentliches Profil. @Handle oder x.com/handle URL. Der Abruf läuft serverseitig; kein X-Login oder eigener API-Key nötig.'
      }
    }[rule.platform];
    if (title) title.textContent = data.title;
    if (help) help.textContent = data.help;
    input.placeholder = data.placeholder;
  }

  function addRule(platform) {
    if (S.cfg.rules.length >= 30) return toast('Maximal 30 Creator-Regeln pro Server.', 'error');
    const rule = C.makeRule(platform);
    S.cfg.rules.push(rule);
    S.ruleId = rule.id;
    S.check = null;
    C.mark();
    C.render();
  }

  function appendSocialButtons() {
    const footer = document.querySelector('.creator-rules > footer');
    if (footer) {
      for (const platform of SOCIAL) {
        if (footer.querySelector(`[data-cr-social-add="${platform}"]`)) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.crSocialAdd = platform;
        button.textContent = `+ ${C.platform(platform)}`;
        button.addEventListener('click', () => addRule(platform));
        footer.appendChild(button);
      }
    }
    const onboard = document.querySelector('.creator-onboard > div');
    if (onboard) {
      for (const platform of SOCIAL) {
        if (onboard.querySelector(`[data-cr-social-add="${platform}"]`)) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.crSocialAdd = platform;
        button.textContent = `${C.platform(platform)} Post`;
        button.addEventListener('click', () => addRule(platform));
        onboard.appendChild(button);
      }
    }
  }

  function appendProviderCards() {
    const grid = document.querySelector('.creator-provider-grid');
    if (!grid) return;
    for (const platform of SOCIAL) {
      if (!grid.querySelector(`[data-provider="${platform}"]`)) grid.insertAdjacentHTML('beforeend', C.providerCard(platform));
    }
  }

  function decorateSocialUi() {
    appendProviderCards();
    addPlatformOptions();
    patchSourceField();
    appendSocialButtons();
  }

  C.render = function renderCreatorHubWithSocialProviders() {
    originalRender();
    decorateSocialUi();
  };

  if (typeof activeTab !== 'undefined' && activeTab === 'creators') requestAnimationFrame(decorateSocialUi);
})();