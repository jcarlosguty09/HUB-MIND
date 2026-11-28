const assert=require('node:assert/strict');
const {pair,plan,score,leaderboard}=require('../competition-engine.js');
const events=[1,2,3].map(id=>({id,capacity:4}));
for(const count of [12,24,36,48,60,61]){
 const athletes=Array.from({length:count},(_,i)=>({id:i+1}));
 const p=pair(athletes);assert.equal(p.pairs.length,Math.floor(count/2));assert.equal(new Set(p.pairs.flat()).size,p.pairs.length*2);assert.equal(p.waiting.length,count%2);
 const teams=p.pairs.map((_,i)=>({id:i+1,status:'active',activated_at:String(i).padStart(3,'0')}));
 const history=[];let heat=1;
 while(history.length<teams.length*3&&heat<100){
 const next=plan(teams,events,history,{heat});assert(next.length);assert.equal(new Set(next.map(x=>x.team_id)).size,next.length);
 for(const e of events)assert(next.filter(x=>x.event_id===e.id).length<=4);
 for(const x of next){assert(!history.some(h=>h.team_id===x.team_id&&h.event_id===x.event_id));history.push({...x,status:'confirmed'});}
 heat++;
 }
 assert.equal(history.length,teams.length*3);if(count===24)assert.equal(heat,4);
}
assert.equal(score({rounds:10,partial:0,bonus:10},{roundValue:20,bonusValue:5}),250);
assert.throws(()=>score({rounds:1,partial:20,bonus:0},{roundValue:20,bonusValue:5}));
assert.equal(plan([{id:1,status:'active'}],events,[{team_id:1,event_id:1,status:'running'}]).length,0);
const ranked=leaderboard([{id:1},{id:2},{id:3,status:'disqualified'}],[{id:1}],[{team_id:1,event_id:1,status:'confirmed',score:10},{team_id:2,event_id:1,status:'confirmed',score:20},{team_id:3,event_id:1,status:'confirmed',score:30}]);assert.equal(ranked[0].team_id,2);assert.equal(ranked[2].team_id,3);
console.log('Competition engine tests passed');

const queue=Array.from({length:24},(_,i)=>({id:i+1,status:'active',activated_at:String(i).padStart(3,'0')}));
const prior=queue.slice(0,12).flatMap(t=>[{team_id:t.id,event_id:1,status:'confirmed',heat:1},{team_id:t.id,event_id:2,status:'confirmed',heat:2}]);
const saturated=plan(queue,events,prior,{heat:3});
assert.equal(saturated.length,12);
assert(saturated.every(a=>a.team_id>12),'First-time teams must take priority over returning teams');
const ready=plan([{id:1,status:'active'}],events,[{team_id:1,event_id:1,status:'ready'}]);assert.equal(ready.length,0);
const mixed=plan(queue.slice(0,20),events,prior,{heat:3});
assert(mixed.filter(a=>a.team_id>12).length===8);
assert.equal(mixed.length,12);
