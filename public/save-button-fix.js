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
})();
