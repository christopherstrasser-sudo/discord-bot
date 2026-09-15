(() => {
  const C = window.RakuCreatorHub;
  if (!C) return;

  if (typeof C.providerCard === 'function') {
    const originalProviderCard = C.providerCard;
    C.providerCard = platform => {
      let html = originalProviderCard(platform);
      if (platform !== 'tiktok') return html;
      html = html
        .replace('LIVE ADAPTER', 'LOCAL LIVE + UPLOAD')
        .replace('Kein zuverlässiger TikTok-Provider verbunden.', 'Lokaler TikTok-Provider wird direkt vom Bot betrieben.')
        .replace('Wartet auf ersten Provider-Check.', 'Lokaler Provider bereit · keine API-Keys oder Cookies nötig.');
      return html;
    };
  }

  if (typeof C.ruleEditor === 'function') {
    const originalRuleEditor = C.ruleEditor;
    C.ruleEditor = rule => {
      let html = originalRuleEditor(rule);
      if (rule?.platform !== 'tiktok') return html;
      return html
        .replace('TikTok Handle', 'TikTok @Handle')
        .replace('placeholder="rakulein"', 'placeholder="@rakulein"')
        .replace(
          'Ohne @ oder URL. TikTok wird nur aktiv, wenn ein zuverlässiger Adapter verbunden ist.',
          'Einfach @Handle oder eine tiktok.com/@handle URL einfügen. Der Bot erkennt Live-Starts und neue Uploads lokal.'
        );
    };
  }

  if (typeof C.readiness === 'function') {
    const originalReadiness = C.readiness;
    C.readiness = rule => {
      let html = originalReadiness(rule);
      if (rule?.platform !== 'tiktok') return html;
      const caps = C.providerHealth('tiktok')?.capabilities || {};
      const capability = rule.event === 'upload' ? caps.upload : caps.live;
      if (capability === null || capability === undefined) return html;
      const label = rule.event === 'upload' ? 'Upload-Erkennung' : 'Live-Erkennung';
      html += `<div class="creator-check ${capability?'ok':''}"><i>${capability?'✓':'!'}</i><span>${label}</span></div>`;
      return html;
    };
  }

  if (typeof C.render === 'function') {
    const originalRender = C.render;
    C.render = (...args) => {
      const result = originalRender(...args);
      document.querySelectorAll('.creator-onboard [data-cr-add="tiktok"]').forEach(button => {
        button.textContent = 'TikTok';
      });
      return result;
    };
  }
})();
