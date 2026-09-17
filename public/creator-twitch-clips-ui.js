(() => {
  const C = window.RakuCreatorHub;
  if (!C) return;

  const previousEvents = C.events;
  const previousDefaults = C.defaults;
  const previousEventName = C.eventName;
  const previousPreviewVars = C.previewVars;

  C.events = platform => {
    if (platform === 'twitch') {
      return [
        ['live', 'Live-Start'],
        ['clip', 'Neuer Clip'],
        ['title_change', 'Stream-Titel geändert'],
        ['category_change', 'Kategorie / Spiel geändert']
      ];
    }
    return previousEvents(platform);
  };

  C.eventName = event => event === 'clip' ? 'Neuer Clip' : previousEventName(event);

  C.defaults = (platform, event = null) => {
    if (platform === 'twitch' && event === 'clip') {
      return {
        event: 'clip',
        color: '#9146FF',
        buttonLabel: 'Clip ansehen',
        message: '{creator} hat einen neuen Twitch-Clip!',
        embedTitle: '✂️ Neuer Clip von {creator}',
        embedDescription: '**{title}**\n\nClip erstellt von **{clipper}**.'
      };
    }
    return previousDefaults(platform, event);
  };

  C.previewVars = rule => {
    if (rule?.platform === 'twitch' && rule?.event === 'clip') {
      return {
        creator: rule.displayName || rule.source || 'Creator',
        clipper: 'CommunityMember',
        title: 'Was war DAS denn?!',
        game: 'VALORANT',
        url: '#',
        platform: 'Twitch',
        source: rule.source || 'creator',
        viewers: '0',
        event: 'Neuer Clip'
      };
    }
    return previousPreviewVars(rule);
  };

  if (!C.vars.includes('{clipper}')) C.vars.push('{clipper}');

  const previousProviderCard = C.providerCard;
  if (typeof previousProviderCard === 'function') {
    C.providerCard = platform => {
      const html = previousProviderCard(platform);
      return platform === 'twitch' ? html.replace('HELIX LIVE', 'HELIX LIVE + CLIPS') : html;
    };
  }

  const previousWire = C.wire;
  if (typeof previousWire === 'function') {
    C.wire = () => {
      previousWire();
      const select = document.querySelector('[data-cr-event]');
      select?.addEventListener('change', () => {
        const rule = C.rule();
        if (!rule || rule.platform !== 'twitch' || rule.event !== 'clip') return;
        if (Number(rule.cooldownMinutes) === 15) {
          rule.cooldownMinutes = 0;
          C.mark?.();
          C.render?.();
        }
      });
    };
  }
})();
