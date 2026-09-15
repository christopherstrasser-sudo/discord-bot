(() => {
  const C = window.RakuCreatorHub = window.RakuCreatorHub || {};
  C.s = { cfg:null, saved:null, meta:null, history:[], ruleId:null, dirty:false, loading:null, check:null, checking:false };
  C.cp = value => JSON.parse(JSON.stringify(value));
  C.esc = value => typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '');
  C.uid = prefix => { const raw=(crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replaceAll('-',''); return `${prefix}_${raw.slice(0,12)}`; };
  C.rule = () => C.s.cfg?.rules?.find(rule => rule.id === C.s.ruleId) || null;
  C.platform = platform => ({ twitch:'Twitch', youtube:'YouTube', tiktok:'TikTok' }[platform] || platform);
  C.eventName = event => ({ live:'Live-Start', upload:'Neuer Upload', title_change:'Titel geändert', category_change:'Kategorie geändert' }[event] || event);
  C.platformClass = platform => `creator-platform-${platform}`;
  C.events = platform => platform === 'twitch'
    ? [['live','Live-Start'],['title_change','Stream-Titel geändert'],['category_change','Kategorie / Spiel geändert']]
    : platform === 'youtube'
      ? [['upload','Neues Video']]
      : [['live','Live-Start'],['upload','Neuer Upload']];
  C.defaults = (platform,event=null) => {
    if (platform === 'youtube') return {
      event:'upload', color:'#FF0000', buttonLabel:'Video ansehen', message:'{creator} hat ein neues Video veröffentlicht!',
      embedTitle:'🎬 {creator} hat ein neues Video', embedDescription:'**{title}**\n\nJetzt auf YouTube ansehen.'
    };
    if (platform === 'tiktok' && event === 'upload') return {
      event:'upload', color:'#FE2C55', buttonLabel:'TikTok ansehen', message:'{creator} hat ein neues TikTok veröffentlicht!',
      embedTitle:'🎵 Neues TikTok von {creator}', embedDescription:'**{title}**\n\nJetzt auf TikTok ansehen.'
    };
    if (platform === 'tiktok') return {
      event:'live', color:'#FE2C55', buttonLabel:'TikTok öffnen', message:'{creator} ist jetzt auf TikTok live!',
      embedTitle:'🔴 {creator} ist jetzt live!', embedDescription:'**{title}**'
    };
    return {
      event:'live', color:'#9146FF', buttonLabel:'Stream ansehen', message:'{creator} ist jetzt live!',
      embedTitle:'🔴 {creator} ist jetzt live!', embedDescription:'**{title}**\n{game}'
    };
  };
  C.makeRule = platform => {
    const d=C.defaults(platform);
    return {
      id:C.uid('rule'), enabled:false, name:`${C.platform(platform)} Creator`, platform, source:'', displayName:'', event:d.event,
      channelId:'', pingRoleId:'', cooldownMinutes:15, announceFirstMatch:false, filterTitle:'', filterGame:'',
      message:d.message, embedTitle:d.embedTitle, embedDescription:d.embedDescription, color:d.color, buttonLabel:d.buttonLabel,
      showThumbnail:true, quietHours:{ enabled:false, start:'22:00', end:'08:00', mode:'no_ping' }
    };
  };
  C.normRule = rule => {
    rule.id ||= C.uid('rule'); rule.enabled = rule.enabled === true; rule.platform ||= 'twitch'; rule.name ||= `${C.platform(rule.platform)} Creator`;
    rule.source ||= ''; rule.displayName ||= ''; rule.event ||= C.defaults(rule.platform).event; rule.channelId ||= ''; rule.pingRoleId ||= '';
    const d=C.defaults(rule.platform,rule.event);
    rule.cooldownMinutes = Math.max(0, Math.min(Number(rule.cooldownMinutes ?? 15) || 0, 1440)); rule.announceFirstMatch = Boolean(rule.announceFirstMatch);
    rule.filterTitle ||= ''; rule.filterGame ||= ''; rule.message ??= d.message; rule.embedTitle ??= d.embedTitle;
    rule.embedDescription ??= d.embedDescription; rule.color ||= d.color; rule.buttonLabel ||= d.buttonLabel;
    rule.showThumbnail = rule.showThumbnail !== false; rule.quietHours ||= {}; rule.quietHours.enabled = Boolean(rule.quietHours.enabled);
    rule.quietHours.start ||= '22:00'; rule.quietHours.end ||= '08:00'; rule.quietHours.mode = rule.quietHours.mode === 'suppress' ? 'suppress' : 'no_ping'; return rule;
  };
  C.load = async (force=false) => {
    const s=C.s; if(!activeGuildData?.guild?.id)return; if(s.cfg&&s.meta&&!force)return; if(s.loading&&!force)return s.loading;
    s.loading=api(`/api/guilds/${activeGuildData.guild.id}/creator-hub`).then(result=>{
      s.cfg=result.config||{enabled:false,timezone:'Europe/Berlin',rules:[]}; s.cfg.rules=(s.cfg.rules||[]).map(C.normRule); s.saved=C.cp(s.cfg);
      s.meta=result.meta||{}; s.history=result.history||[]; s.dirty=false; s.ruleId=s.cfg.rules.some(r=>r.id===s.ruleId)?s.ruleId:(s.cfg.rules[0]?.id||null);
      C.chrome?.();
    }).finally(()=>s.loading=null); return s.loading;
  };
  C.mark=()=>{C.s.dirty=JSON.stringify(C.s.cfg)!==JSON.stringify(C.s.saved); C.chrome?.();};
  C.channels=(selected='')=>'<option value="">Zielkanal auswählen</option>'+((C.s.meta?.channels)||[]).map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${C.esc(c.parent?`${c.parent} / #${c.name}`:`#${c.name}`)}</option>`).join('');
  C.roles=(selected='')=>'<option value="">Kein Rollen-Ping</option>'+((C.s.meta?.roles)||[]).map(r=>`<option value="${r.id}" ${r.id===selected?'selected':''}>@${C.esc(r.name)}</option>`).join('');
  C.vars=['{creator}','{title}','{game}','{url}','{platform}','{source}','{viewers}','{event}'];
  C.previewVars=rule=>({
    creator:rule.displayName||rule.source||'Creator',
    title:rule.platform==='youtube'?'Mein neues Video ist da!':rule.platform==='tiktok'&&rule.event==='upload'?'Neues TikTok ist online ✨':'Ranked Grind mit der Community',
    game:rule.platform==='twitch'?'VALORANT':'', url:'#', platform:C.platform(rule.platform), source:rule.source||'creator',
    viewers:rule.event==='upload'?'0':'128', event:C.eventName(rule.event)
  });
  C.renderTemplate=(text,vars)=>{let value=String(text||'');Object.entries(vars).forEach(([k,v])=>value=value.replaceAll(`{${k}}`,String(v||'')));return value;};
  C.providerHealth=platform=>C.s.meta?.runtime?.providers?.[platform]||{};
})();
