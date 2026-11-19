import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/instagram-send/index.ts', import.meta.url),'utf8'));
async function run(mode) {
  let handler; const calls = [];
  const env = { SUPABASE_URL:'https://db.test', SUPABASE_ANON_KEY:'anon',
    SUPABASE_SERVICE_ROLE_KEY:'server-only', INSTAGRAM_SEND_ACCESS_TOKEN:'meta-token',
    INSTAGRAM_SEND_ACCOUNT_ID:' 17841471148069975 ', INSTAGRAM_SEND_ENABLED:'true',
    INSTAGRAM_GRAPH_API_VERSION:'v26.0' };
  const json = (body,status=200) => new Response(JSON.stringify(body),{status});
  vm.runInNewContext(source, { Request, Response, console:{error(){}},
    Deno:{env:{get:k=>env[k]},serve:h=>handler=h},
    fetch:async (url, options) => {
      calls.push({url,options});
      if(url.includes('/auth/v1/user')) return json({id:'user-1'});
      if(url.includes('/crm_instagram_conversations?')) return json(mode==='denied'?[]:[{id:'c1',account_id:'a1',instagram_sender_id:'contact-1'}]);
      if(url.includes('/organization_instagram_accounts?')) return json([{instagram_user_id:'17841471148069975'}]);
      if(url.includes('graph.instagram.com')) return mode==='meta-fail'?json({},400):json({message_id:'mid-1'});
      if(url.includes('/rpc/')) {
        assert.equal(options.headers.apikey,'server-only');
        const body=JSON.parse(options.body);
        assert.equal(body.p_actor_id,'user-1');
        assert.equal(body.p_message_id,'mid-1');
        assert.equal(body.p_body,'hello');
        if(mode==='db-throw') throw new Error('offline');
        return mode==='db-fail'?json({},500):json({persisted:true});
      }
      throw new Error('Unexpected URL '+url);
    } });
  const response = await handler(new Request('https://function.test',{method:'POST',
    headers:{authorization:'Bearer caller',origin:'https://wod.hubmind.shop','content-type':'application/json'},
    body:JSON.stringify({conversation_id:'c1',text:' hello '})}));
  return {response, body:await response.json(),calls};
}
for (const mode of ['ok','db-fail','db-throw','meta-fail','denied']) {
  const {response,body,calls}=await run(mode);
  if(mode==='ok') assert.deepEqual(body,{sent:true,message_id:'mid-1',persisted:true});
  if(mode.startsWith('db-')) { assert.equal(response.status,200); assert.equal(body.sent,true); assert.equal(body.persisted,false); }
  if(mode==='meta-fail') { assert.equal(response.status,502); assert(!calls.some(c=>c.url.includes('/rpc/'))); }
  if(mode==='denied') { assert.equal(response.status,404); assert(!calls.some(c=>c.url.includes('graph.instagram.com'))); }
  assert(calls.filter(c=>c.url.includes('graph.instagram.com')).length<=1);
  assert(!calls.filter(c=>!c.url.includes('/rpc/')).some(c=>c.options.headers.apikey==='server-only'));
  console.log('PASS',mode);
}
