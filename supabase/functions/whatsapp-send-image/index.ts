// WhatsApp Cloud API JPG image sender for HUB MIND CRM.
// Configure WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
// WHATSAPP_GRAPH_API_VERSION, SUPABASE_URL, SUPABASE_ANON_KEY.
const origin = 'https://wod.hubmind.shop';
Deno.serve(async request => {
  const allowed = request.headers.get('origin') === origin;
  const cors = allowed ? {'access-control-allow-origin':origin,'access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS'} : {};
  const reply = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{...cors,'content-type':'application/json'}});
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method !== 'POST') return reply({error:'method_not_allowed'},405);
  if (request.headers.get('origin') && !allowed) return reply({error:'origin_not_allowed'},403);
  const base=Deno.env.get('SUPABASE_URL');
  const anon=Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token=Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneId=Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const version=Deno.env.get('WHATSAPP_GRAPH_API_VERSION')||'v22.0';
  if (!base||!anon||!serviceKey||!token||!phoneId||!/^v[0-9]+\.[0-9]+$/.test(version)) return reply({error:'server_not_configured'},503);
  const authorization=request.headers.get('authorization');
  if (!authorization||!/^Bearer\s+\S+$/i.test(authorization)) return reply({error:'unauthorized'},401);
  let input;
  try { input=await request.json(); } catch { return reply({error:'invalid_json'},400); }
  if (!input||typeof input.conversation_id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.conversation_id)||typeof input.image_base64!=='string'||input.image_base64.length>7000000) return reply({error:'invalid_input'},400);
  try {
    const headers={apikey:anon,Authorization:authorization};
    const user=await fetch(base+'/auth/v1/user',{headers});
    if (!user.ok) return reply({error:'unauthorized'},401);
    const currentUser=await user.json();
    if (!currentUser?.id) return reply({error:'unauthorized'},401);
    const convRes=await fetch(base+'/rest/v1/crm_whatsapp_conversations?select=*&id=eq.'+encodeURIComponent(input.conversation_id)+'&limit=1',{headers});
    if (!convRes.ok) return reply({error:'conversation_access_failed'},403);
    const rows=await convRes.json();
    const conv=Array.isArray(rows)?rows[0]:null;
    if (!conv||conv.status!=='open') return reply({error:'conversation_not_available'},404);
    const recipient=String(conv.contact_phone||'').replace(/\D/g,'');
    if (!/^\d{8,15}$/.test(recipient)) return reply({error:'invalid_recipient'},400);
    const msgRes=await fetch(base+'/rest/v1/crm_whatsapp_messages?select=whatsapp_timestamp,created_at&conversation_id=eq.'+encodeURIComponent(input.conversation_id)+'&direction=eq.inbound&order=whatsapp_timestamp.desc.nullslast,created_at.desc&limit=1',{headers});
    if (!msgRes.ok) return reply({error:'service_window_check_failed'},403);
    const messages=await msgRes.json();
    const last=messages?.[0];
    const lastAt=Date.parse(last?.whatsapp_timestamp||last?.created_at||'');
    if (!Number.isFinite(lastAt)||Date.now()-lastAt>=86400000||lastAt>Date.now()+60000) return reply({error:'service_window_closed'},403);
    let bytes;
    try { bytes=Uint8Array.from(atob(input.image_base64),c=>c.charCodeAt(0)); } catch { return reply({error:'invalid_base64'},400); }
    if (bytes.length<4||bytes.length>5000000||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217) return reply({error:'invalid_jpeg_max_5mb'},400);
    const form=new FormData();
    form.set('messaging_product','whatsapp');
    form.set('type','image/jpeg');
    form.set('file',new Blob([bytes],{type:'image/jpeg'}),'image.jpg');
    const media=await fetch('https://graph.facebook.com/'+version+'/'+encodeURIComponent(phoneId)+'/media',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
    if (!media.ok) { console.error('wa_media_upload_failed',{status:media.status});return reply({error:'meta_media_upload_failed',status:media.status},502); }
    const mediaData=await media.json();
    if (typeof mediaData.id!=='string') return reply({error:'media_id_missing'},502);
    const send=await fetch('https://graph.facebook.com/'+version+'/'+encodeURIComponent(phoneId)+'/messages',{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:recipient,type:'image',image:{id:mediaData.id}})});
    if (!send.ok) { const data=await send.json().catch(()=>null);console.error('wa_image_send_failed',{status:send.status,code:data?.error?.code});return reply({error:'meta_image_send_failed',status:send.status,meta_code:typeof data?.error?.code==='number'?data.error.code:null},502); }
    const sent=await send.json();
    const wamid=sent?.messages?.[0]?.id;
    if (typeof wamid !== 'string' || !wamid) return reply({sent:true,persisted:false,error:'meta_message_id_missing'});
    // Persist after Meta accepts the message. Match by wamid to avoid a second
    // record when a webhook has already inserted the same outbound message.
    const serviceHeaders={apikey:serviceKey,Authorization:'Bearer '+serviceKey};
    const existing=await fetch(base+'/rest/v1/crm_whatsapp_messages?select=id&wamid=eq.'+encodeURIComponent(wamid)+'&limit=1',{headers:serviceHeaders});
    if (!existing.ok) {
      console.error('wa_image_history_lookup_failed',{status:existing.status});
      return reply({sent:true,persisted:false,message_id:wamid,error:'history_lookup_failed'});
    }
    const matches=await existing.json();
    if (Array.isArray(matches) && matches.length) return reply({sent:true,persisted:true,message_id:wamid});
    const record={
      organization_id:conv.organization_id,conversation_id:conv.id,wamid,
      direction:'outbound',message_type:'image',body:'[Imagen enviada]',
      status:'sent',whatsapp_timestamp:new Date().toISOString(),sent_by:currentUser.id,
      raw_payload:{messaging_product:'whatsapp',messages:sent.messages,media_id:mediaData.id,type:'image'}
    };
    const saved=await fetch(base+'/rest/v1/crm_whatsapp_messages',{
      method:'POST',
      headers:{...serviceHeaders,'content-type':'application/json',Prefer:'return=minimal,resolution=ignore-duplicates'},
      body:JSON.stringify(record)
    });
    if (!saved.ok) {
      console.error('wa_image_history_insert_failed',{status:saved.status});
      return reply({sent:true,persisted:false,message_id:wamid,error:'history_insert_failed'});
    }
    return reply({sent:true,persisted:true,message_id:wamid});
  } catch (e) { console.error('wa_image_send_unavailable',e instanceof Error?e.message:'unknown');return reply({error:'send_unavailable'},503); }
});
