/* Hub Mind competitions: authenticated operator console. */
(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=(t,q='')=>sbReq('GET',t+'?select=*'+q);
const rpc=(n,b)=>sbReq('POST','rpc/comp_'+n,b);
let root, eventId, mode='board', data={}, busy=false, poll, clock, generation=0;
const button=(label,action,extra='')=>'<button type="button" data-action="'+action+'" '+extra+'>'+esc(label)+'</button>';
const opt=(id,name)=>'<option value="'+esc(id)+'">'+esc(name)+'</option>';
const team=id=>data.teams.find(t=>t.id===id)?.name||'Pending team';
const workout=id=>data.workouts.find(w=>w.id===id);
const master=()=>state.role==='master_admin';
const staff=()=>['master_admin','admin','coach'].includes(state.role);
async function load(){
 const g=++generation;
 const events=await get('comp_events','&order=event_date.desc');
 if(!events.some(e=>e.id===eventId))eventId=events[0]?.id;
 if(!eventId){if(g===generation){data={events};draw();}return;}
 const f='&event_id=eq.'+eventId;
 const tables=['workouts','athletes','teams','team_members','judges','heats','heat_assignments','scores'];
 const values=await Promise.all(tables.map(t=>get('comp_'+t,f)));
 if(g!==generation)return;
 data={events};tables.forEach((t,i)=>data[t]=values[i]);data.workouts.sort((a,b)=>a.workout_no-b.workout_no);
 draw();
}
function draw(){
 if(!root?.isConnected)return;
 const active=document.activeElement;
 if(root.contains(active)&&['INPUT','SELECT','TEXTAREA'].includes(active.tagName))return;
 const tabs=[['board','Leaderboard'],['tv1','TV 1'],['tv2','TV 2'],...(staff()?[['desk','Front Desk'],['judge','Judge Control']]:[]),...(master()?[['master','Game Master']]:[])];
 if(!tabs.some(t=>t[0]===mode)&&!data.workouts?.some(w=>mode==='brief-'+w.id))mode='board';
 root.innerHTML='<div class="comp-shell"><h2>HUB MIND COMPETITIONS</h2><select data-event>'+data.events.map(e=>opt(e.id,e.name)).join('')+'</select><nav>'+tabs.map(t=>button(t[1],'mode:'+t[0],mode===t[0]?'aria-current="page"':'')).join('')+'</nav><div class="comp-brief-nav">'+(data.workouts||[]).map(w=>button('WOD '+w.workout_no+' · '+w.name,'mode:brief-'+w.id,mode==='brief-'+w.id?'aria-current="page"':'')).join('')+'</div><div data-error role="alert"></div><div data-panel></div></div>';
 root.querySelector('[data-event]').value=eventId||'';
 const p=root.querySelector('[data-panel]');if(!eventId){p.textContent='No competitions';return;}
 const heat=data.heats.filter(h=>!['completed','cancelled'].includes(h.status)).sort((a,b)=>b.heat_no-a.heat_no)[0];
 const assignments=data.heat_assignments.filter(a=>a.heat_id===heat?.id&&a.status!=='cancelled');
 const score=a=>data.scores.find(s=>s.assignment_id===a.id);
 const timer=heat?'<h3>HEAT '+heat.heat_no+' · '+esc(heat.status)+'</h3><div class="comp-clock" data-clock>--:--</div>':'<h3>No active heat</h3>';
 if(mode.startsWith('brief-')){const w=workout(mode.slice(6));const official=eventId==='6016d3a2-6cf5-4036-91c8-abeafc9b5e88';const details=official?({1:'10 Burpees over the line (sync)\n12 Bumper Alt. Lunges (sync)\n10 KB Swings (sync)\n\nEvery 2:30: 5 Bottle Flip attempts',2:'A: 350m Row\n\nB: 10 Alt. DB Power Clean\n10 DB Goblet Squats\nMax Ball Throw (5 attempts)',3:'A: 20 Echo Bike Cals\n\nB: 10 WBS\nMax Lemon Shuttle runs (max 5 laps)\nB begins the skill after wall balls while A bikes.'})[w.workout_no]:null;p.innerHTML='<article class="comp-brief"><p>EVENT '+w.workout_no+' · '+esc(w.rules?.judge_name||'')+'</p><h2>'+esc(w.name)+'</h2><h3>AMRAP '+(w.duration_seconds/60)+' MIN</h3><div class="comp-brief-body">'+esc(details||w.description||'').replace(/\n/g,'<br>')+'</div><h3>SCORING</h3><p>'+esc(w.score_unit)+' + '+w.bonus_value+' '+esc(w.score_unit)+' per successful bonus</p>'+button('Back to leaderboard','mode:board')+'</article>'; }else if(mode==='desk'){
 const waiting=data.athletes.filter(a=>!data.team_members.some(m=>m.athlete_id===a.id));
 p.innerHTML='<h3>Register athlete</h3><input data-search placeholder="Search name"><button data-action="search">Search</button><select data-person></select><select data-level>'+['beginner','intermediate','rx'].map(x=>opt(x,x)).join('')+'</select>'+button('Register','register')+button('Create new athlete','new')+'<h3>Waiting ('+waiting.length+')</h3>'+waiting.map(a=>'<div>'+esc(a.display_name)+' · '+esc(a.skill_level)+'</div>').join('')+button('Random pairing','pair')+'<article><h3>Manual pairing</h3><p>Select two unpaired athletes.</p><select data-pair-a>'+opt('','Athlete A')+waiting.map(a=>opt(a.id,a.display_name+' · '+a.skill_level)).join('')+'</select><select data-pair-b>'+opt('','Athlete B')+waiting.map(a=>opt(a.id,a.display_name+' · '+a.skill_level)).join('')+'</select>'+button('Create manual pair','manualpair',waiting.length<2?'disabled':'')+'</article>'+'<h3>Teams</h3>'+data.teams.map(t=>'<article><strong>'+esc(t.name||'Pending team')+'</strong><p>'+data.team_members.filter(m=>m.team_id===t.id).map(m=>esc(data.athletes.find(a=>a.id===m.athlete_id)?.display_name)).join(' + ')+'</p>'+ (t.status==='pending'?'<input data-name="'+t.id+'" placeholder="Team name">'+button('Activate','activate:'+t.id):esc(t.status))+'</article>').join('');
 }else if(mode==='master'){
 p.innerHTML=timer+(!heat?button('Prepare next heat','prepare'):heat.status==='scheduled'?button('Mark ready','ready:'+heat.id):heat.status==='ready'?button('START HEAT','start:'+heat.id):heat.status==='running'?button('Finish heat','finish:'+heat.id):button('Confirm heat','confirm:'+heat.id))+ (heat?button('Cancel heat','cancel:'+heat.id):'')+assignments.map(a=>'<article>'+esc(workout(a.workout_id)?.name)+' · Lane '+a.lane+' · '+esc(team(a.team_id))+' · '+esc(score(a)?.status||a.status)+'</article>').join('');
 p.innerHTML+='<article class="comp-danger"><h3>Zona de emergencia</h3><p>Acciones irreversibles sobre esta competencia.</p>'+button('Reiniciar resultados','reset:results')+button('Reiniciar competencia','reset:registration')+button('Eliminar competencia','reset:delete')+'</article>';
 }else if(mode==='judge'){
 const mine=data.judges.filter(j=>j.user_id===Auth.getUser()?.id).map(j=>j.workout_id);
 p.innerHTML=timer+assignments.filter(a=>mine.includes(a.workout_id)).map(a=>{const s=score(a),w=workout(a.workout_id);return '<article><h3>'+esc(team(a.team_id))+' · Lane '+a.lane+'</h3><p>'+esc(w.name)+'</p><strong class="comp-total">'+(s?.total_score??0)+' '+esc(w.score_unit)+'</strong>'+ (s&&s.status==='live'?['rounds','partial','bonus_successes'].map(k=>'<div class="comp-counter">'+esc(k)+button('−','delta:'+a.id+':'+k+':-1')+'<b>'+s[k]+'</b>'+button('+','delta:'+a.id+':'+k+':1')+'</div>').join('')+(heat.status==='review'?button('Submit final','submit:'+a.id):''):esc(s?.status||'Waiting for start'))+'</article>';}).join('');
 }else if(mode==='tv1'||mode==='tv2'){
 p.innerHTML=timer+'<div class="comp-arenas">'+data.workouts.filter(w=>mode==='tv1'?w.workout_no===2:w.workout_no!==2).map(w=>'<article><h2>'+esc(w.name)+'</h2>'+assignments.filter(a=>a.workout_id===w.id).sort((a,b)=>(score(b)?.total_score||0)-(score(a)?.total_score||0)).map(a=>'<p>'+esc(team(a.team_id))+' · <strong>'+ (score(a)?.total_score??0)+'</strong> '+esc(w.score_unit)+' · Bonus '+(score(a)?.bonus_successes??0)+'</p>').join('')+'</article>').join('')+'</div>';
 }else{
 const rows=CompetitionEngine.leaderboard(data.teams.filter(t=>t.status!=='pending'&&t.status!=='withdrawn'),data.workouts,data.scores.map(s=>{const a=data.heat_assignments.find(a=>a.id===s.assignment_id);return {team_id:a?.team_id,event_id:a?.workout_id,status:s.status,score:Number(s.total_score)};}));
 p.innerHTML='<h3>Provisional leaderboard</h3>'+rows.map((r,i)=>'<article>'+ (r.disqualified?'DQ':i+1)+' · '+esc(team(r.team_id))+' · '+r.completed+'/'+data.workouts.length+' · '+r.total+' pts'+(master()?data.scores.filter(s=>s.status==='confirmed'&&data.heat_assignments.some(a=>a.id===s.assignment_id&&a.team_id===r.team_id)).map(s=>button('Correct '+(workout(data.heat_assignments.find(a=>a.id===s.assignment_id).workout_id)?.name||'score'),'correct:'+s.id)).join('')+button('Disqualify','dq:'+r.team_id):'')+'</article>').join('');
 }
 tick();
}
function tick(){const e=root?.querySelector('[data-clock]');if(!e)return;const h=data.heats?.find(h=>['running','review','ready','scheduled'].includes(h.status));if(!h)return;const duration=Math.max(0,...data.workouts.map(w=>w.duration_seconds));const seconds=h.status==='review'?0:h.status==='running'?Math.max(0,Math.ceil(duration-(Date.now()-Date.parse(h.started_at))/1000)):duration;e.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
async function action(a){
 const [cmd,id,k,d]=a.split(':');const q=s=>root.querySelector(s);
 if(cmd==='mode'){mode=id;draw();return;}
 if(cmd==='reset'){if(!master())throw Error('Unauthorized');const event=data.events.find(e=>e.id===eventId);const phrase={results:'REINICIAR RESULTADOS',registration:'REINICIAR COMPETENCIA',delete:'ELIMINAR COMPETENCIA'}[id];if(!phrase)return;const typed=prompt(event.name+' — acción irreversible. Escribe '+phrase+' para continuar.');if(typed!==phrase)return;await rpc('reset_event',{p_event_id:event.id,p_mode:id,p_confirmation:typed});mode='board';eventId=id==='delete'?null:event.id;root.querySelector(':focus')?.blur();await load();return;}
 if(cmd==='search'){const term=q('[data-search]').value.toLowerCase();const event=data.events.find(e=>e.id===eventId);const members=await get('organization_members','&organization_id=eq.'+event.organization_id+'&is_active=eq.true');const ids=new Set(members.map(m=>m.user_id));const people=await get('profiles');q('[data-person]').innerHTML=people.filter(p=>ids.has(p.id)&&String(p.full_name).toLowerCase().includes(term)).slice(0,50).map(p=>opt(p.id,p.full_name)).join('');return;}
 if(cmd==='new'){const name=prompt('Full name');if(!name?.trim())return;const email=prompt('Email');if(!email?.trim())return;const password=prompt('Unique initial password (12+ characters)');if(!password||password.length<12)throw Error('Password must have at least 12 characters');const level=q('[data-level]').value;const created=await AdminAPI.createUser(email.trim(),password,'atleta',name.trim());if(!created?.id)throw Error('Account created: search for the athlete before registering');try{await rpc('register_athlete',{p_event_id:eventId,p_user_id:created.id,p_skill_level:level});}catch(e){throw Error('Account created. Search and register existing athlete: '+e.message);}}
 if(cmd==='register')await rpc('register_athlete',{p_event_id:eventId,p_user_id:q('[data-person]').value,p_skill_level:q('[data-level]').value});
 if(cmd==='manualpair'){if(!staff())throw Error('Unauthorized');const a=q('[data-pair-a]').value,b=q('[data-pair-b]').value;if(!a||!b||a===b)throw Error('Select two different athletes');const members=await get('comp_team_members','&event_id=eq.'+eventId);if(members.some(m=>m.athlete_id===a||m.athlete_id===b))throw Error('An athlete is already paired. Refresh and try again.');if(!data.athletes.some(x=>x.id===a)||!data.athletes.some(x=>x.id===b))throw Error('Athletes must be registered in this event');await rpc('pair_athletes',{p_event_id:eventId,p_athlete_a:a,p_athlete_b:b});}
 if(cmd==='pair'){const pool=data.athletes.map(a=>({...a,team_id:data.team_members.find(m=>m.athlete_id===a.id)?.team_id}));for(const [a,b] of CompetitionEngine.pair(pool).pairs)await rpc('pair_athletes',{p_event_id:eventId,p_athlete_a:a,p_athlete_b:b});}
 if(cmd==='activate')await rpc('activate_team',{p_team_id:id,p_name:q('[data-name="'+id+'"]').value});
 if(cmd==='prepare'){const n=Math.max(0,...data.heats.map(h=>h.heat_no))+1;const history=data.heat_assignments.map(a=>({...a,event_id:a.workout_id,heat:data.heats.find(h=>h.id===a.heat_id)?.heat_no}));const plan=CompetitionEngine.plan(data.teams,data.workouts,history,{heat:n});if(!plan.length)throw Error('No eligible teams');await rpc('create_heat',{p_event_id:eventId,p_assignments:plan.map(a=>({team_id:a.team_id,workout_id:a.event_id,lane:a.lane}))});}
 if(cmd==='correct'){const s=data.scores.find(s=>s.id===id);const raw=prompt('Rounds, partial, bonus (comma separated)',[s.rounds,s.partial,s.bonus_successes].join(','));if(raw===null)return;const v=raw.split(',').map(Number);if(v.length!==3||v.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Invalid score');const reason=prompt('Correction reason');if(!reason)return;await rpc('correct_score',{p_score_id:id,p_rounds:v[0],p_partial:v[1],p_bonus:v[2],p_reason:reason});}
 if(cmd==='dq'){const reason=prompt('Disqualification reason');if(!reason||!confirm('Disqualify this team?'))return;await rpc('disqualify_team',{p_team_id:id,p_reason:reason});}
 if(cmd==='cancel'){const reason=prompt('Cancellation reason');if(!reason||!confirm('Cancel this heat? All its scores will be invalidated.'))return;await rpc('cancel_heat',{p_heat_id:id,p_reason:reason});}
 if(['ready','start','finish','confirm'].includes(cmd))await rpc(cmd+'_heat',{p_heat_id:id});
 if(cmd==='delta'||cmd==='submit'){const latest=await get('comp_scores','&assignment_id=eq.'+id);const s=latest[0];if(!s||s.status!=='live')throw Error('Score no longer editable');const a=data.heat_assignments.find(a=>a.id===id);const w=workout(a.workout_id);const v={rounds:s.rounds,partial:s.partial,bonus_successes:s.bonus_successes};if(cmd==='delta')v[k]=Math.max(0,Math.min(k==='partial'?w.round_value-1:99999,v[k]+Number(d)));await rpc('update_score',{p_assignment_id:id,p_rounds:v.rounds,p_partial:v.partial,p_bonus:v.bonus_successes,p_submit:cmd==='submit'});}
 root.querySelector(':focus')?.blur();await load();
}
function error(e){const el=root?.querySelector('[data-error]');if(el)el.textContent=e.message;else if(root)root.textContent=e.message;}
window.CompetitionControl={render(id){clearInterval(poll);clearInterval(clock);root=document.getElementById(id);if(!root)return;root.innerHTML='Loading competitions…';root.onclick=async e=>{const b=e.target.closest('[data-action]');if(!b||busy)return;busy=true;b.disabled=true;try{await action(b.dataset.action);}catch(e){error(e);}finally{busy=false;b.disabled=false;}};root.onchange=e=>{if(e.target.matches('[data-event]')){eventId=e.target.value;e.target.blur();load().catch(error);}};load().catch(error);poll=setInterval(()=>{if(!root?.isConnected||!root.getClientRects().length){clearInterval(poll);clearInterval(clock);return;}if(!busy&&mode!=='desk')load().catch(error);},3000);clock=setInterval(tick,250);}};
})();
