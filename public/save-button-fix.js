(() => {
  function saveLabel(button) {
    if (!button) return null;
    return Array.from(button.children).find(child =>
      child.tagName === 'SPAN' && !child.classList.contains('icon')
    ) || null;
  }

  markDirty = function markDirtyFixed() {
    dirty = JSON.stringify(workingSettings) !== JSON.stringify(savedSettings);
    const save = $('#saveSettings');
    if (save) {
      save.disabled = !dirty;
      save.classList.toggle('dirty', dirty);
      const label = saveLabel(save);
      if (label) label.textContent = dirty ? 'Änderungen speichern' : 'Gespeichert';
    }
    $('#unsavedFlag')?.classList.toggle('visible', dirty);
  };

  saveSettings = async function saveSettingsFixed() {
    const button = $('#saveSettings');
    if (!button) return;
    const label = saveLabel(button);
    button.disabled = true;
    if (label) label.textContent = 'Speichert …';
    try {
      const result = await api(`/api/guilds/${activeGuildData.guild.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(workingSettings)
      });
      workingSettings = clone(result.settings);
      savedSettings = clone(result.settings);
      dirty = false;
      toast('Server-Einstellungen gespeichert.');
      renderGuildShell();
    } catch (error) {
      toast(error.message, 'error');
      markDirty();
    }
  };

  function appendAsset(tag, attrs) {
    return new Promise((resolve, reject) => {
      const node = document.createElement(tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      node.addEventListener('load', resolve, { once: true });
      node.addEventListener('error', reject, { once: true });
      document.head.appendChild(node);
    });
  }

  window.addEventListener('load', async () => {
    if (window.__rakuUxV2Loaded) return;
    window.__rakuUxV2Loaded = true;
    try {
      await appendAsset('link', { rel: 'stylesheet', href: '/raku-ux-v2.css?v=0121' });
      await appendAsset('link', { rel: 'stylesheet', href: '/raku-ux-v2-login.css?v=0121' });
      await appendAsset('link', { rel: 'stylesheet', href: '/raku-readability-v121.css?v=0121' });
      await appendAsset('script', { src: '/raku-ux-v2-guides.js?v=0121' });
      await appendAsset('script', { src: '/raku-ux-v2-hints.js?v=0121' });
      await appendAsset('script', { src: '/raku-ux-v2.js?v=0121' });
    } catch (error) {
      console.warn('[UX V2] Optional UI layer could not be loaded:', error);
    }
  }, { once: true });
})();
