/* HUB MIND Race Control v1. Server-validated timestamps via RPC. */
const RaceControl = (() => {
  const stations = ['SkiErg','Sled Push','Sled Pull','Burpee Broad Jumps','Row','Farmers Carry','Sandbag Lunges','Wall Balls'];
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
      es.forEach(e=>{e.heat_name=hs.find(h=>h.id===e.heat_id)?.name||null;});
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
      <section class="race-panel"><h3>Race Director · Live</h3><div class="race-live">${es.filter(e=>e.started_at&&!e.finished_at).map(e=>`<div class="race-live-row"><div><b>${esc(e.display_name)}</b><small>${esc(e.division)} · ${esc(e.heat_name||'Individual')} · ${e.checkpoint_count||0}/16 checkpoints</small></div><strong class="race-clock" data-start="${esc(e.started_at)}">${time(Date.now()-new Date(e.started_at).getTime())}</strong>${admin()?`<button data-act="checkpoint" data-id="${e.id}">+ Split</button><button data-act="finish" data-id="${e.id}">Meta</button>`:''}</div>`).join('')||'<p>Sin atletas en carrera.</p>'}</div></section></div>
      <section class="race-panel"><h3>Atletas y clasificación</h3><div class="race-table-wrap"><table class="race-table"><thead><tr><th>#</th><th>Atleta</th><th>División</th><th>Heat</th><th>Estado</th><th>Tiempo</th><th>Acciones</th></tr></thead><tbody>${[...es].sort((a,b)=>a.finished_at&&b.finished_at?(a.elapsed_ms??Infinity)-(b.elapsed_ms??Infinity):a.finished_at?-1:b.finished_at?1:0).map((e,i)=>`<tr><td>${e.finished_at?i+1:'—'}</td><td><b>${esc(e.display_name)}</b></td><td>${esc(e.division)}</td><td>${esc(e.heat_name||'Individual')}</td><td>${e.finished_at?'Finalizado':e.started_at?'EN VIVO':'Pendiente'}</td><td>${e.finished_at?time(e.elapsed_ms):e.started_at?`<span class="race-clock" data-start="${esc(e.started_at)}"></span>`:'—'}</td><td>${admin()&&!e.started_at?`<button data-act="start" data-id="${e.id}">Start</button>`:''}${admin()&&e.started_at&&!e.finished_at?`<button data-act="finish" data-id="${e.id}">Finish</button>`:''}</td></tr>`).join('')}</tbody></table></div></section>`}`;
      root.querySelector('#race-event-select')?.addEventListener('change',e=>{selected=e.target.value;render(container);});
      root.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>handle(b.dataset.act,b.dataset.id,event,hs,es));
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
  function ask(label,def=''){const v=prompt(label,def);return v===null?null:v.trim();}
  async function handle(act,id,event,hs,es){
    if(act==='create'){const name=ask('Nombre del evento','HUB MIND HYROX SIMULATION');if(!name)return;const date=ask('Fecha (AAAA-MM-DD)','2026-10-18');if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return notice('Fecha inválida');return action(async()=>{const rows=await api('race_events','POST',{name,event_date:date,created_by:Auth.getUser().id});selected=rows[0]?.id;});}
    if(!event)return;
    if(act==='heat'){const name=ask('Nombre del heat','Heat '+(hs.length+1));if(!name)return;const when=ask('Inicio (AAAA-MM-DDTHH:MM, horario CDMX)',event.event_date+'T08:00');if(!when)return;return action(async()=>{await api('race_heats','POST',{event_id:event.id,name,starts_at:when+':00-06:00'});});}
    if(act==='join'){if(es.some(e=>e.user_id===Auth.getUser()?.id))return notice('Ya estás inscrito');const name=ask('Nombre para el ranking',state.profile?.full_name||'');if(!name)return;const division=ask('División (Open / Pro / Doubles)','Open')||'Open';return action(async()=>{await api('race_entries','POST',{event_id:event.id,user_id:Auth.getUser().id,display_name:name,division});});}
    if(act==='register'){const name=ask('Nombre del atleta');if(!name)return;const division=ask('División','Open')||'Open';const heat=ask('Heat (número, o vacío para individual)','');const chosen=heat?hs[Number(heat)-1]:null;if(heat&&!chosen)return notice('Heat no encontrado');return action(async()=>{await api('race_entries','POST',{event_id:event.id,display_name:name,division,heat_id:chosen?.id||null});});}
    if(['start','finish','checkpoint','startheat'].includes(act))return action(async()=>{
      if(act==='startheat'){if(!confirm('¿Iniciar simultáneamente este heat?'))return;await rpc('race_start_heat',{p_heat:id});}
      if(act==='start'){if(!confirm('¿Iniciar cronómetro individual?'))return;await rpc('race_start_entry',{p_entry:id});}
      if(act==='finish'){if(!confirm('¿Confirmar llegada a meta?'))return;await rpc('race_finish_entry',{p_entry:id});}
      if(act==='checkpoint'){const entry=es.find(e=>e.id===id);const n=(entry?.checkpoint_count||0)+1;if(n>16)return notice('Todos los checkpoints registrados');if(!confirm(`Registrar checkpoint ${n}/16: ${n%2?`Run ${Math.ceil(n/2)}`:stations[n/2-1]}?`))return;await rpc('race_add_checkpoint',{p_entry:id});}
    });
  }
  return {render};
})();
