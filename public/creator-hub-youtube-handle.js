(() => {
  const C = window.RakuCreatorHub;
  if (!C?.ruleEditor) return;

  const originalRuleEditor = C.ruleEditor;
  C.ruleEditor = rule => {
    let html = originalRuleEditor(rule);
    if (rule?.platform !== 'youtube') return html;

    html = html
      .replace('YouTube Channel-ID', 'YouTube @Handle')
      .replace('placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"', 'placeholder="@rakulein"')
      .replace(
        'Die stabile UC… Channel-ID, nicht @Handle oder URL.',
        'Einfach den öffentlichen @Handle eintragen, z. B. @rakulein. Eine youtube.com/@handle URL funktioniert ebenfalls.'
      );

    return html;
  };
})();
