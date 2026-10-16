/* HUB MIND Race Control v1. Server-validated timestamps via RPC. */
const RaceControl = (() => {
  const stations = ['SkiErg','Sled Push','Sled Pull','Burpee Broad Jumps','Row','Farmers Carry','Sandbag Lunges','Wall Balls'];
  const stageNames = ['SkiErg','Sled Push','Sled Pull','Burpee Broad Jumps','Row','Farmers Carry','Sandbag Lunges','Wall Balls'];
  const admin = () => ['master_admin','admin','coach'].includes(state.role);
  const esc = v => escHtml(v ?? '');
  const time = ms => { if(ms == null) return '—'; const s=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
  const dt = x => x ? new Date(x).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'}) : '—';
  let selected = null, tick = null, refresh = null, container = null;
  let lastSnapshot = null, loading = false, generation = 0;
  async function api(path, method='GET', data=null) { return sbReq(method,path,data); }
  async function rpc(name,args) { const rows=await api(`rpc/${name}`,'POST',args); return rows; }
  async function events(){return api('race_events?select=*&order=event_date.desc');}
  async function heats(event){return api(`race_heats?select=*&event_id=eq.${encodeURIComponent(event)}&order=starts_at.asc`);}
  async function visits(ids){if(!ids.length)return [];return api('race_station_visits?select=*&entry_id=in.('+ids.join(',')+')&order=station_no.asc');}
  async function entries(event){return api(`race_entries?select=*&event_id=eq.${encodeURIComponent(event)}&order=created_at.asc`);}
  function notice(msg){ if(typeof showToast==='function')showToast(msg);else alert(msg); }
  async function action(fn){try{await fn();await render(container);}catch(e){notice('Race Control: '+e.message);}}
  async function render(id, silent=false){
    container=id || container; const root=el(container); if(!root)return;
    if(loading) return;
    loading = true;
    const requestGeneration = ++generation;
    // Never clear a visible race dashboard during background synchronization.
    if(!silent && !root.querySelector('.race-header')) root.innerHTML='<div class="race-panel">Cargando Race Control…</div>';
    try{
      const all=await events();if(!selected || !all.some(e=>e.id===selected))selected=all[0]?.id||null;
      const event=all.find(e=>e.id===selected);
      const [hs,es]=event?await Promise.all([heats(event.id),entries(event.id)]):[[],[]];
      const vs=await visits(es.map(e=>e.id));
      es.forEach(e=>{e.visits=vs.filter(v=>v.entry_id===e.id);e.heat_name=hs.find(h=>h.id===e.heat_id)?.name||null;});
      const me=Auth.getUser()?.id;
      // Exclude elapsed display time; clocks update in place, not by rebuilding the DOM.
      const snapshot = JSON.stringify({all, selected, hs, es});
      if(silent && lastSnapshot === snapshot) return;
      if(requestGeneration !== generation) return;
      lastSnapshot = snapshot;
      root.innerHTML=`<div class="race-header"><div><div class="race-kicker">HUB MIND / COMPETITION</div><h2>HYROX <span>RACE CONTROL</span></h2><p>Individual + heats · cronometraje en vivo</p></div>${admin()?'<button class="race-primary" data-act="create">+ Nuevo evento</button>':''}</div>
      <div class="race-toolbar"><select id="race-event-select">${all.map(e=>`<option value="${e.id}" ${e.id===selected?'selected':''}>${esc(e.name)} · ${esc(e.event_date)}</option>`).join('')}</select><span>${event?esc(event.status.toUpperCase()):'SIN EVENTOS'}</span></div>
      ${!event?'<div class="race-panel">No hay eventos todavía. Un administrador puede crear el primero.</div>':`
      <div class="race-metrics"><div><strong>${es.length}</strong><small>Inscritos</small></div><div><strong>${es.filter(e=>e.started_at&&!e.finished_at).length}</strong><small>En carrera</small></div><div><strong>${es.filter(e=>e.finished_at).length}</strong><small>Finalizados</small></div><div><strong>${hs.length}</strong><small>Heats</small></div></div>
      <div class="race-grid"><section class="race-panel"><h3>${esc(event.name)}</h3><p>${esc(event.description||'Simulación HYROX')} · ${esc(event.event_date)}</p><div class="race-actions">${admin()?'<button data-act="heat">+ Crear heat</button><button data-act="register">+ Inscribir atleta</button>':`<button data-act="join">${es.some(e=>e.user_id===me)?'Ya estás inscrito':'Inscribirme'}</button>`}</div>
      <h3>Salidas</h3>${hs.length?hs.map(h=>`<div class="race-heat"><div><b>${esc(h.name)}</b><small>${dt(h.starts_at)} · ${esc(h.status)}</small></div>${admin()&&h.status==='scheduled'?`<button data-act="startheat" data-id="${h.id}">Iniciar heat</button>`:''}</div>`).join(''):'<p>Aún no hay heats. También puedes iniciar atletas individualmente.</p>'}</section>
      <section class="race-panel"><h3>Race Director · Live</h3><div class="race-live">${es.filter(e=>e.started_at&&!e.finished_at).map(e=>`<div class="race-live-row"><div><b>${esc(e.display_name)}</b><small>${esc(e.division)} · ${esc(e.heat_name||'Individual')} · ${stationStatus(e)}</small></div><strong class="race-clock" data-start="${esc(e.started_at)}">${time(Date.now()-new Date(e.started_at).getTime())}</strong>${admin()?`${stationButton(e)}<button data-act="finish" data-id="${e.id}">Meta</button>`:''}</div>`).join('')||'<p>Sin atletas en carrera.</p>'}</div></section></div>
      <section class="race-panel"><h3>Parciales por estación</h3>${es.map(e=>stationHistory(e)).join('')}</section>
      <section class="race-panel"><h3>Atletas y clasificación</h3><div class="race-table-wrap"><table class="race-table"><thead><tr><th>#</th><th>Atleta</th><th>División</th><th>Heat</th><th>Estado</th><th>Tiempo</th><th>Acciones</th></tr></thead><tbody>${[...es].sort((a,b)=>a.finished_at&&b.finished_at?(a.elapsed_ms??Infinity)-(b.elapsed_ms??Infinity):a.finished_at?-1:b.finished_at?1:0).map((e,i)=>`<tr><td>${e.finished_at?i+1:'—'}</td><td><b>${esc(e.display_name)}</b><small class="race-profile-tag">${e.user_id?'● Perfil HUB MIND':'○ Invitado'}</small></td><td>${esc(e.division)}</td><td>${esc(e.heat_name||'Individual')}</td><td>${e.finished_at?'Finalizado':e.started_at?'EN VIVO':'Pendiente'}</td><td>${e.finished_at?time(e.elapsed_ms):e.started_at?`<span class="race-clock" data-start="${esc(e.started_at)}"></span>`:'—'}</td><td>${admin()&&!e.started_at?`<button data-act="start" data-id="${e.id}">Start</button>`:''}${admin()&&e.started_at&&!e.finished_at?`<button data-act="finish" data-id="${e.id}">Finish</button>`:''}</td></tr>`).join('')}</tbody></table></div></section>`}`;
      root.querySelector('#race-event-select')?.addEventListener('change',e=>{selected=e.target.value;render(container);});
      root.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>handle(b.dataset.act,b.dataset.id,event,hs,es,b.dataset.station));
      if(tick) clearInterval(tick);
      const updateClocks=()=>root.querySelectorAll('.race-clock[data-start]').forEach(n=>{const ms=Date.now()-new Date(n.dataset.start).getTime();const label=time(ms);if(n.textContent!==label)n.textContent=label;});
      updateClocks();
      tick=setInterval(updateClocks,250);
      if(refresh) clearInterval(refresh);
      refresh=setInterval(()=>{if(root.offsetParent!==null && !loading)render(container,true);},12000);
    }catch(e){
      if(!silent) root.innerHTML=`<div class="race-panel">No se pudo cargar Race Control: ${esc(e.message)}. Verifica la conexión con Supabase.</div>`;
      else console.warn('Race Control: sincronización fallida',e);
    }finally{loading=false;}
  }
  function stationStatus(e){
    const v=e.visits||[];const open=v.find(x=>!x.exited_at);
    if(open)return `EN ${stageNames[open.station_no-1]} · estación ${open.station_no}/8`;
    if(v.length===8)return '8/8 estaciones completadas · rumbo a meta';
    return `Carrera ${v.length+1}/8 · próxima: ${stageNames[v.length]}`;
  }
  function stationButton(e){
    const v=e.visits||[],open=v.find(x=>!x.exited_at);
    if(open)return `<button class="race-stage-button" data-act="station-exit" data-id="${e.id}" data-station="${open.station_no}">Salir de ${esc(stageNames[open.station_no-1])}</button>`;
    if(v.length>=8)return '<span class="race-stage-done">Estaciones completas</span>';
    return `<button class="race-stage-button" data-act="station-enter" data-id="${e.id}" data-station="${v.length+1}">Entrar a ${esc(stageNames[v.length])}</button>`;
  }
  function stationHistory(e){
    const v=e.visits||[];
    return `<details class="race-stage-history" ${e.started_at&&!e.finished_at?'open':''}><summary><b>${esc(e.display_name)}</b> · ${v.filter(x=>x.exited_at).length}/8 completadas</summary><div class="race-stage-list">${stageNames.map((name,i)=>{
      const r=v.find(x=>x.station_no===i+1);
      const elapsed=r&&r.exited_at?time(new Date(r.exited_at)-new Date(r.entered_at)):r?'En estación':'—';
      const sinceStart=r?time(new Date(r.entered_at)-new Date(e.started_at)):'—';
      return `<div class="race-stage-line"><span>${i+1}. ${esc(name)}</span><span>Entrada ${sinceStart}</span><strong>${elapsed}</strong></div>`;
    }).join('')}</div></details>`;
  }
  // Race Director owns the registration workflow. A linked athlete is a real auth user;
  // guests are race-only entries and do not create Supabase Auth accounts.
  async function registerAthlete(event,hs,es){
    if(!admin())return notice('Solo el Race Director puede registrar atletas');
    let athletes=[];
    try { athletes=await AthleteAPI.list(); }
    catch(e){return notice('No se pudo cargar el directorio de HUB MIND: '+e.message);}
    const root=document.createElement('div');root.className='race-modal-backdrop';
    root.innerHTML=`<section class="race-modal" role="dialog" aria-modal="true" aria-label="Inscribir atleta"><h3>Inscribir atleta</h3><p>Vincula un perfil de HUB MIND o registra un invitado externo.</p><div class="race-mode-tabs"><button type="button" data-mode="linked" class="selected">Perfil existente</button><button type="button" data-mode="guest">Invitado / externo</button></div><label class="race-form-label" id="race-search-label">Buscar atleta</label><input id="race-athlete-search" autocomplete="off" placeholder="Nombre o correo"/><div id="race-athlete-results" class="race-athlete-results"></div><label class="race-form-label">Nombre en clasificación</label><input id="race-athlete-name" maxlength="120" placeholder="Nombre del atleta"/><label class="race-form-label">División</label><input id="race-athlete-division" value="Open" maxlength="80"/><label class="race-form-label">Salida</label><select id="race-athlete-heat"><option value="">Individual / sin heat</option>${hs.map(h=>`<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('')}</select><p class="race-form-error" aria-live="polite"></p><div class="race-form-actions"><button type="button" data-cancel>Cancelar</button><button type="button" data-save class="race-primary">Inscribir atleta</button></div></section>`;
    document.body.appendChild(root);
    let mode='linked',picked=null;
    const q=s=>root.querySelector(s), name=q('#race-athlete-name'), search=q('#race-athlete-search'), results=q('#race-athlete-results');
    const error=q('.race-form-error');
    const close=()=>root.remove();
    q('[data-cancel]').onclick=close;
    root.addEventListener('click',e=>{if(e.target===root)close();});
    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
      mode=b.dataset.mode;picked=null;root.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));
      search.hidden=mode==='guest';results.hidden=mode==='guest';q('#race-search-label').hidden=mode==='guest';
      name.value='';name.readOnly=mode==='linked';error.textContent='';renderMatches();
      if(mode==='guest')name.focus();else search.focus();
    });
    name.readOnly=true;
    function renderMatches(){
      if(mode!=='linked')return;
      const term=search.value.trim().toLocaleLowerCase();
      if(!term){results.innerHTML='<p>Escribe para buscar entre los atletas registrados.</p>';return;}
      const matches=athletes.filter(a=>[a.display_name,a.email].some(v=>String(v||'').toLocaleLowerCase().includes(term))).slice(0,12);
      results.innerHTML=matches.length?matches.map(a=>`<button type="button" data-user="${esc(a.id)}">${esc(a.display_name||a.email||'Atleta')} <small>${esc(a.email||'')}</small></button>`).join(''):'<p>No encontramos perfiles. Puedes cambiar a Invitado / externo.</p>';
      results.querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>{
        picked=athletes.find(a=>a.id===b.dataset.user);name.value=picked?.display_name||picked?.email||'';
        search.value=name.value;results.innerHTML=`<p>Perfil vinculado: <b>${esc(name.value)}</b></p>`;error.textContent='';
      });
    }
    search.addEventListener('input',()=>{picked=null;name.value='';renderMatches();});renderMatches();
    q('[data-save]').onclick=async()=>{
      const display_name=name.value.trim(),division=q('#race-athlete-division').value.trim()||'Open';
      const heat_id=q('#race-athlete-heat').value||null;
      if(mode==='linked'&&!picked){error.textContent='Selecciona un perfil de la lista.';return;}
      if(!display_name){error.textContent='Escribe el nombre del atleta.';return;}
      if(mode==='linked'&&es.some(e=>e.user_id===picked.id)){error.textContent='Este perfil ya está inscrito en el evento.';return;}
      if(heat_id&&hs.find(h=>h.id===heat_id)?.status!=='scheduled'){error.textContent='No se puede inscribir en un heat que ya comenzó.';return;}
      const save=q('[data-save]');save.disabled=true;error.textContent='';
      try{
        await api('race_entries','POST',{event_id:event.id,display_name,division,heat_id,user_id:mode==='linked'?picked.id:null});
        close();await render(container);
      }catch(e){error.textContent=e.message||'No se pudo inscribir al atleta';save.disabled=false;}
    };
    search.focus();
  }
  function ask(label,def=''){const v=prompt(label,def);return v===null?null:v.trim();}
  async function handle(act,id,event,hs,es,station){
    if(act==='create'){const name=ask('Nombre del evento','HUB MIND HYROX SIMULATION');if(!name)return;const date=ask('Fecha (AAAA-MM-DD)','2026-10-18');if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return notice('Fecha inválida');return action(async()=>{const rows=await api('race_events','POST',{name,event_date:date,created_by:Auth.getUser().id});selected=rows[0]?.id;});}
    if(!event)return;
    if(act==='heat'){const name=ask('Nombre del heat','Heat '+(hs.length+1));if(!name)return;const when=ask('Inicio (AAAA-MM-DDTHH:MM, horario CDMX)',event.event_date+'T08:00');if(!when)return;return action(async()=>{await api('race_heats','POST',{event_id:event.id,name,starts_at:when+':00-06:00'});});}
    if(act==='join'){if(es.some(e=>e.user_id===Auth.getUser()?.id))return notice('Ya estás inscrito');const name=ask('Nombre para el ranking',state.profile?.full_name||'');if(!name)return;const division=ask('División (Open / Pro / Doubles)','Open')||'Open';return action(async()=>{await api('race_entries','POST',{event_id:event.id,user_id:Auth.getUser().id,display_name:name,division});});}
    if(act==='register')return registerAthlete(event,hs,es);
    if(['station-enter','station-exit'].includes(act))return action(async()=>{
      const entry=es.find(e=>e.id===id);const label=stageNames[Number(station)-1];
      if(!confirm(`${act==='station-enter'?'Registrar ENTRADA a':'Registrar SALIDA de'} ${label} para ${entry?.display_name}?`))return;
      await rpc('race_station_mark',{p_entry:id,p_station:Number(station),p_action:act==='station-enter'?'enter':'exit'});
    });
    if(['start','finish','checkpoint','startheat'].includes(act))return action(async()=>{
      if(act==='startheat'){if(!confirm('¿Iniciar simultáneamente este heat?'))return;await rpc('race_start_heat',{p_heat:id});}
      if(act==='start'){if(!confirm('¿Iniciar cronómetro individual?'))return;await rpc('race_start_entry',{p_entry:id});}
      if(act==='finish'){if(!confirm('¿Confirmar llegada a meta?'))return;await rpc('race_finish_entry',{p_entry:id});}
      if(act==='checkpoint'){const entry=es.find(e=>e.id===id);const n=(entry?.checkpoint_count||0)+1;if(n>16)return notice('Todos los checkpoints registrados');if(!confirm(`Registrar checkpoint ${n}/16: ${n%2?`Run ${Math.ceil(n/2)}`:stations[n/2-1]}?`))return;await rpc('race_add_checkpoint',{p_entry:id});}
    });
  }
  return {render};
})();
