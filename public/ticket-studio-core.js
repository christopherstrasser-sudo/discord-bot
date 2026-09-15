(() => {
  const T = window.RakuTicketStudio = window.RakuTicketStudio || {};
  T.s = { cfg:null, saved:null, meta:null, dirty:false, panelId:null, typeId:null, loading:null };
  T.cp = v => JSON.parse(JSON.stringify(v));
  T.esc = v => typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '');
  T.uid = p => { const raw=(crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll('-',''); return `${p}_${raw.slice(0,12)}`; };
  T.pSel = () => T.s.cfg?.panels?.find(x => x.id === T.s.panelId) || null;
  T.tSel = () => T.pSel()?.types?.find(x => x.id === T.s.typeId) || null;
  T.pub = p => Boolean(p?.messageId && p?.publishedChannelId);

  T.normQ = (q, i) => {
    q.id ||= T.uid('q');
    q.label ||= `Frage ${i + 1}`;
    q.placeholder ||= '';
    q.style = q.style === 'paragraph' ? 'paragraph' : 'short';
    q.required = q.required !== false;
    return q;
  };
  T.normT = t => {
    t.id ||= T.uid('type'); t.enabled = t.enabled !== false; t.label ||= 'Support'; t.emoji ||= '🎫';
    t.description ||= ''; t.priority = ['low','normal','high','urgent'].includes(t.priority) ? t.priority : 'normal';
    t.modalTitle ||= t.label; t.questions = Array.isArray(t.questions) ? t.questions : []; t.questions.forEach(T.normQ); return t;
  };
  T.normP = p => {
    p.id ||= T.uid('panel'); p.enabled = p.enabled !== false; p.name ||= 'Support Center'; p.channelId ||= ''; p.categoryId ||= '';
    p.archiveCategoryId ||= ''; p.logChannelId ||= ''; p.staffRoleIds = Array.isArray(p.staffRoleIds) ? p.staffRoleIds : [];
    p.maxOpenPerUser = Math.max(1, Math.min(+p.maxOpenPerUser || 1, 5)); p.userCanClose = p.userCanClose !== false;
    p.title ||= 'Wie können wir dir helfen?'; p.description ||= 'Öffne ein privates Ticket und unser Team kümmert sich um dein Anliegen.';
    p.color ||= '#5865F2'; p.types = Array.isArray(p.types) ? p.types : []; p.types.forEach(T.normT); return p;
  };

  T.makeType = (kind='support') => {
    const m = {
      support:['Support','🎫','Allgemeine Hilfe und Fragen','normal',[['Worum geht es?','Beschreibe dein Anliegen.','paragraph',true],['Was hast du versucht?','Optionaler Kontext','paragraph',false]]],
      report:['Report','🚨','Spieler oder Verhalten melden','high',[['Wen meldest du?','Username / Discord-Name','short',true],['Was ist passiert?','Beschreibe den Vorfall.','paragraph',true],['Beweise / Links','Screenshots, Clips oder Links','paragraph',false]]],
      application:['Bewerbung','📝','Bewerbung für das Team','normal',[['Warum möchtest du ins Team?','Motivation','paragraph',true],['Erfahrung','Was bringst du mit?','paragraph',true],['Verfügbarkeit','Wann bist du verfügbar?','short',true]]],
      partner:['Partnerschaft','🤝','Kooperation oder Partnerschaft','low',[['Projekt / Community','Name und Link','short',true],['Deine Idee','Wie soll die Zusammenarbeit aussehen?','paragraph',true]]]
    }[kind];
    return T.normT({ id:T.uid('type'), label:m[0], emoji:m[1], description:m[2], priority:m[3], modalTitle:m[0],
      questions:m[4].map(x => ({ id:T.uid('q'), label:x[0], placeholder:x[1], style:x[2], required:x[3] })) });
  };
  T.makePanel = full => T.normP({ id:T.uid('panel'), enabled:true, name:full?'Community Desk':'Support Center',
    title:full?'Community Desk':'Wie können wir dir helfen?',
    description:full?'Wähle den passenden Bereich. Dein Anliegen landet direkt beim richtigen Team.':'Öffne ein privates Ticket. Unser Team kümmert sich dort direkt um dein Anliegen.',
    color:'#5865F2', types:full?[T.makeType('support'),T.makeType('report'),T.makeType('application'),T.makeType('partner')]:[T.makeType()] });

  T.load = async (force=false) => {
    const s=T.s; if(!activeGuildData?.guild?.id) return; if(s.cfg&&s.meta&&!force) return; if(s.loading&&!force) return s.loading;
    s.loading = api(`/api/guilds/${activeGuildData.guild.id}/ticket-studio`).then(r => {
      s.cfg=r.config||{enabled:false,panels:[]}; s.cfg.panels=(s.cfg.panels||[]).map(T.normP); s.saved=T.cp(s.cfg); s.meta=r.meta||{}; s.dirty=false;
      s.panelId=s.cfg.panels.some(p=>p.id===s.panelId)?s.panelId:(s.cfg.panels[0]?.id||null); s.typeId=null; T.chrome?.();
    }).finally(()=>s.loading=null); return s.loading;
  };
  T.mark = () => { T.s.dirty = JSON.stringify(T.s.cfg) !== JSON.stringify(T.s.saved); T.chrome?.(); };
  T.chan = (v='',empty='Kanal auswählen') => `<option value="">${empty}</option>${(T.s.meta?.channels||[]).map(c=>`<option value="${c.id}" ${c.id===v?'selected':''}>${T.esc(c.parent?`${c.parent} / #${c.name}`:`#${c.name}`)}</option>`).join('')}`;
  T.cat = (v='',empty='Kategorie auswählen') => `<option value="">${empty}</option>${(T.s.meta?.categories||[]).map(c=>`<option value="${c.id}" ${c.id===v?'selected':''}>${T.esc(c.name)}</option>`).join('')}`;
  T.roles = p => { const selected=new Set(p.staffRoleIds||[]); return (T.s.meta?.staffRoles||[]).map(r=>`<label class="ticket-role ${selected.has(r.id)?'on':''}"><input type="checkbox" data-staff="${r.id}" ${selected.has(r.id)?'checked':''}><i style="--c:${r.color||'#99AAB5'}"></i>@${T.esc(r.name)}</label>`).join('') || '<small>Keine Rollen verfügbar.</small>'; };
  T.ready = p => Boolean(T.s.cfg?.enabled && T.s.meta?.capabilities?.canManageChannels && p.channelId && p.categoryId && p.staffRoleIds?.length && p.types?.length);
})();
