/* Pure competition planning helpers. No database writes or UI side effects. */
(function(root){
'use strict';
function pair(athletes, random=Math.random){
 const seen=new Set(), pool=athletes.filter(a=>!a.team_id&&a.id&&!seen.has(a.id)&&seen.add(a.id));
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 const pairs=[];while(pool.length>=2)pairs.push([pool.shift().id,pool.shift().id]);
 return {pairs,waiting:pool.map(a=>a.id)};
}
function plan(teams,events,history,{heat=1,restHeats=0}={}){
 const done=new Set(history.filter(h=>h.status==='confirmed').map(h=>JSON.stringify([h.team_id,h.event_id])));
 const blocked=new Set(history.filter(h=>['running','scheduled','ready','review'].includes(h.status)).map(h=>h.team_id));
 const last=new Map();for(const h of history.filter(h=>h.status==='confirmed'))last.set(h.team_id,Math.max(last.get(h.team_id)||0,h.heat||0));
 const completed=new Map();for(const key of done){const [id]=JSON.parse(key);completed.set(id,(completed.get(id)||0)+1);}
 const eligible=teams.filter(t=>t.status==='active'&&!blocked.has(t.id)&&(!last.has(t.id)||heat-last.get(t.id)>restHeats))
 .sort((a,b)=>(completed.get(a.id)||0)-(completed.get(b.id)||0)||(last.get(a.id)||0)-(last.get(b.id)||0)||String(a.activated_at).localeCompare(String(b.activated_at))||String(a.id).localeCompare(String(b.id)));
 const slots=events.flatMap(e=>Array.from({length:e.capacity},(_,i)=>({event_id:e.id,lane:i+1})));
 // Augmenting paths maximize occupied lanes without double-booking a team.
 const assigned=new Map();
 function place(t,visited){for(let i=0;i<slots.length;i++){if(visited.has(i)||done.has(JSON.stringify([t.id,slots[i].event_id])))continue;visited.add(i);const previous=assigned.get(i);if(!previous||place(previous,visited)){assigned.set(i,t);return true;}}return false;}
 for(const t of eligible)place(t,new Set());
 return [...assigned].sort((a,b)=>a[0]-b[0]).map(([i,t])=>({...slots[i],team_id:t.id,heat}));
}
function score({rounds,partial,bonus},event){
 for(const n of [rounds,partial,bonus,event.roundValue,event.bonusValue])if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid score');
 if(event.roundValue===0||partial>=event.roundValue)throw Error('Invalid partial');
 const total=rounds*event.roundValue+partial+bonus*event.bonusValue;
 if(!Number.isSafeInteger(total))throw Error('Score overflow');return total;
}
function leaderboard(teams,events,results){
 const rows=teams.map(t=>({team_id:t.id,disqualified:t.status==='disqualified',positions:{},total:0,completed:0}));
 for(const e of events){
 const valid=results.filter(r=>r.event_id===e.id&&r.status==='confirmed'&&rows.some(t=>t.team_id===r.team_id&&!t.disqualified)).sort((a,b)=>b.score-a.score);
 let rank=0;valid.forEach((r,i)=>{if(i===0||r.score!==valid[i-1].score)rank=i+1;const row=rows.find(t=>t.team_id===r.team_id);row.positions[e.id]=rank;row.total+=rank;row.completed++;});
 }
 return rows.sort((a,b)=>Number(a.disqualified)-Number(b.disqualified)||b.completed-a.completed||a.total-b.total);
}
const api={pair,plan,score,leaderboard};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CompetitionEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
