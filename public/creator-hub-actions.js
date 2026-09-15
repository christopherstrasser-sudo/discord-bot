(() => {
  const C=window.RakuCreatorHub,S=C.s;

  function saveLabel(button){return button?Array.from(button.children).find(child=>child.tagName==='SPAN'&&!child.classList.contains('icon')):null}
  C.chrome=()=>{
    const nav=document.querySelector('.deck-nav-item[data-tab="creators"] small');
    if(nav)nav.innerHTML=`<span class="state-dot ${S.cfg?.enabled?'on':''}"></span><span>${S.cfg?.enabled?'Aktiv':'Aus'}</span>`;
    const meta=document.querySelector('.command-meta');if(meta?.children?.[1])meta.children[1].textContent=`${activeModuleCount(workingSettings)}/7 Module aktiv`;
    if(activeTab==='creators'){
      const button=document.querySelector('#saveSettings');if(button){button.disabled=!S.dirty;button.classList.toggle('dirty',S.dirty);const label=saveLabel(button);if(label)label.textContent=S.dirty?'Creator Hub speichern':'Gespeichert'}
      document.querySelector('#unsavedFlag')?.classList.toggle('visible',S.dirty);
    }
  };

  function bind(selector,event,fn,rerender=false){document.querySelector(selector)?.addEventListener(event,e=>{fn(e.target,e);C.mark();if(rerender)C.render()})}
  function updateRulePlatform(rule,platform){const d=C.defaults(platform);rule.platform=platform;rule.source='';rule.event=d.event;rule.color=d.color;rule.buttonLabel=d.buttonLabel;rule.message=d.message;rule.embedTitle=d.embedTitle;rule.embedDescription=d.embedDescription;rule.filterTitle='';rule.filterGame='';rule.enabled=false;S.check=null}

  C.wire=()=>{
    document.querySelector('[data-cr-master]')?.addEventListener('change',e=>{S.cfg.enabled=e.target.checked;C.mark();C.render()});
    bind('[data-cr-timezone]','input',x=>S.cfg.timezone=x.value);
    document.querySelectorAll('[data-cr-add]').forEach(button=>button.onclick=()=>{if(S.cfg.rules.length>=30)return toast('Maximal 30 Creator-Regeln pro Server.','error');const rule=C.makeRule(button.dataset.crAdd);S.cfg.rules.push(rule);S.ruleId=rule.id;S.check=null;C.mark();C.render()});
    document.querySelectorAll('[data-creator-rule]').forEach(button=>button.onclick=()=>{S.ruleId=button.dataset.creatorRule;S.check=null;C.render()});
    const rule=C.rule();if(!rule)return;

    bind('[data-cr-name]','input',x=>rule.name=x.value);
    bind('[data-cr-enabled]','change',x=>rule.enabled=x.checked,true);
    bind('[data-cr-platform]','change',x=>updateRulePlatform(rule,x.value),true);
    bind('[data-cr-event]','change',x=>{rule.event=x.value;S.check=null},true);
    bind('[data-cr-source]','input',x=>{rule.source=x.value;S.check=null});
    bind('[data-cr-display]','input',x=>rule.displayName=x.value,true);
    bind('[data-cr-channel]','change',x=>rule.channelId=x.value,true);
    bind('[data-cr-role]','change',x=>rule.pingRoleId=x.value,true);
    bind('[data-cr-cooldown]','input',x=>rule.cooldownMinutes=Math.max(0,Math.min(Number(x.value)||0,1440)));
    bind('[data-cr-first]','change',x=>rule.announceFirstMatch=x.checked);
    bind('[data-cr-filter-title]','input',x=>rule.filterTitle=x.value);
    bind('[data-cr-filter-game]','input',x=>rule.filterGame=x.value);
    bind('[data-cr-quiet]','change',x=>rule.quietHours.enabled=x.checked,true);
    bind('[data-cr-qstart]','change',x=>rule.quietHours.start=x.value,true);
    bind('[data-cr-qend]','change',x=>rule.quietHours.end=x.value,true);
    bind('[data-cr-qmode]','change',x=>rule.quietHours.mode=x.value,true);
    bind('[data-cr-message]','input',x=>rule.message=x.value,true);
    bind('[data-cr-etitle]','input',x=>rule.embedTitle=x.value,true);
    bind('[data-cr-edesc]','input',x=>rule.embedDescription=x.value,true);
    bind('[data-cr-color]','input',x=>rule.color=x.value,true);
    bind('[data-cr-button]','input',x=>rule.buttonLabel=x.value,true);
    bind('[data-cr-thumb]','change',x=>rule.showThumbnail=x.checked,true);

    document.querySelectorAll('[data-cr-var]').forEach(button=>button.onclick=()=>{
      const field=document.activeElement?.matches?.('[data-cr-message],[data-cr-etitle],[data-cr-edesc]')?document.activeElement:document.querySelector('[data-cr-edesc]');
      if(!field)return;const token=button.dataset.crVar,start=field.selectionStart??field.value.length,end=field.selectionEnd??field.value.length;
      field.value=field.value.slice(0,start)+token+field.value.slice(end);field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();field.setSelectionRange?.(start+token.length,start+token.length);
    });

    document.querySelector('[data-cr-duplicate]')?.addEventListener('click',()=>{if(S.cfg.rules.length>=30)return;const copy=C.cp(rule);copy.id=C.uid('rule');copy.name=`${rule.name} Kopie`;copy.enabled=false;S.cfg.rules.push(copy);S.ruleId=copy.id;S.check=null;C.mark();C.render()});
    document.querySelector('[data-cr-delete]')?.addEventListener('click',()=>{S.cfg.rules=S.cfg.rules.filter(item=>item.id!==rule.id);S.ruleId=S.cfg.rules[0]?.id||null;S.check=null;C.mark();C.render()});
    document.querySelector('[data-cr-check]')?.addEventListener('click',C.check);
    document.querySelector('[data-cr-test]')?.addEventListener('click',C.test);
  };

  C.save=async()=>{
    if(!S.cfg||!S.dirty)return;
    const button=document.querySelector('#saveSettings'),label=saveLabel(button);if(button)button.disabled=true;if(label)label.textContent='Speichert …';
    try{
      const result=await api(`/api/guilds/${activeGuildData.guild.id}/creator-hub`,{method:'PATCH',body:JSON.stringify(S.cfg)});
      S.cfg=result.config;S.cfg.rules.forEach(C.normRule);S.saved=C.cp(S.cfg);S.meta=result.meta;S.history=result.history||S.history;S.dirty=false;C.chrome();toast('Creator Hub gespeichert.');if(activeTab==='creators')C.render();
    }catch(error){toast(error.message,'error');C.mark();throw error}
  };

  C.ensureSaved=async()=>{if(S.dirty)await C.save();return C.rule()};
  C.check=async()=>{
    const button=document.querySelector('[data-cr-check]');if(button)button.disabled=true;S.checking=true;C.render();
    try{const rule=await C.ensureSaved();if(!rule)throw new Error('Regel nicht gefunden.');const result=await api(`/api/guilds/${activeGuildData.guild.id}/creator-hub/${rule.id}/check`,{method:'POST'});S.check=result.snapshot;S.meta.runtime=result.runtime||S.meta.runtime;toast('Creator-Quelle erfolgreich geprüft.');}
    catch(error){S.check={error:error.message};toast(error.message,'error')}finally{S.checking=false;if(activeTab==='creators')C.render()}
  };
  C.test=async()=>{
    const button=document.querySelector('[data-cr-test]');if(button)button.disabled=true;
    try{const rule=await C.ensureSaved();if(!rule)throw new Error('Regel nicht gefunden.');const result=await api(`/api/guilds/${activeGuildData.guild.id}/creator-hub/${rule.id}/test`,{method:'POST'});S.history=result.history||S.history;toast('Testnachricht gesendet – ohne Rollen-Ping.');C.render()}
    catch(error){toast(error.message,'error');if(button)button.disabled=false}
  };

  C.nav=()=>{
    const nav=document.querySelector('.deck-nav');if(!nav||nav.querySelector('[data-tab="creators"]'))return;
    const anchor=nav.querySelector('[data-tab="tickets"]')||nav.querySelector('[data-tab="roles"]')||nav.querySelector('[data-tab="commands"]');if(!anchor)return;
    const button=document.createElement('button');button.className=`deck-nav-item${activeTab==='creators'?' active':''}`;button.dataset.tab='creators';button.type='button';button.innerHTML=`${icon('pulse')}<span>Creator Hub</span><small><span class="state-dot ${S.cfg?.enabled?'on':''}"></span><span>${S.cfg?.enabled?'Aktiv':'Aus'}</span></small>`;anchor.insertAdjacentElement('afterend',button);
  };
  C.overview=()=>{
    const list=document.querySelector('#guildWorkspace .module-list');if(list&&!list.querySelector('[data-creator-row]')){const row=document.createElement('div');row.className='module-row';row.dataset.creatorRow='1';row.innerHTML=`<div class="module-row-icon">${icon('pulse')}</div><div><b>Creator Hub</b><span>Twitch, YouTube & TikTok Events mit Filtern und Quality Control</span></div><div class="module-row-state ${S.cfg?.enabled?'on':''}">${S.cfg?.enabled?'AKTIV':'AUS'}</div><button class="mini-button" data-creator-open>Konfigurieren ${icon('arrow')}</button>`;list.appendChild(row);row.querySelector('[data-creator-open]').onclick=()=>switchTab('creators')}
    document.querySelectorAll('#guildWorkspace .telemetry-card small').forEach(node=>{if(/von \d+ konfigurierbar/.test(node.textContent))node.textContent='von 7 konfigurierbar'});
  };

  function hooks(){
    if(typeof getInitialTab==='function'){const original=getInitialTab;getInitialTab=function(){return new URLSearchParams(location.search).get('tab')==='creators'?'creators':original()}}
    if(typeof activeModuleCount==='function'){const original=activeModuleCount;activeModuleCount=function(settings){return original(settings)+(S.cfg?.enabled?1:0)}}
    if(typeof renderGuildWorkspace==='function'){const original=renderGuildWorkspace;renderGuildWorkspace=function(tab){if(tab==='creators')return C.render();original(tab);if(tab==='overview')C.load().then(()=>{if(activeTab==='overview'){C.overview();C.chrome()}})}}
    if(typeof renderGuildShell==='function'){const original=renderGuildShell;renderGuildShell=function(){original();C.nav();C.load().then(()=>{C.nav();C.chrome();if(activeTab==='overview')C.overview()})}}
    if(typeof saveSettings==='function'){const original=saveSettings;saveSettings=async function(){return activeTab==='creators'?C.save():original()}}
  }
  window.addEventListener('beforeunload',event=>{if(S.dirty){event.preventDefault();event.returnValue=''}});
  hooks();
})();
