// Authenticated WhatsApp image proxy. Never expose Meta tokens or public image URLs.
const ORIGIN = 'https://wod.hubmind.shop';
const json = (body: unknown, status=200, cors: Record<string,string>={}) =>
  new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}});
const obj = (v: unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
Deno.serve(async request => {
  const allowed = request.headers.get('origin') === ORIGIN;
  const cors = allowed ? {'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS'} : {};
  const reply=(body:unknown,status=200)=>json(body,status,cors);
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if(request.headers.get('origin')&&!allowed) return reply({error:'origin_not_allowed'},403);
  if(request.method!=='POST') return reply({error:'method_not_allowed'},405);
  const base=Deno.env.get('SUPABASE_URL'), anon=Deno.env.get('SUPABASE_ANON_KEY');
  const token=Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const version=Deno.env.get('WHATSAPP_GRAPH_API_VERSION')||'v22.0';
  if(!base||!anon||!token||!/^v\d+\.\d+$/.test(version)) return reply({error:'server_not_configured'},503);
  const authorization=request.headers.get('authorization');
  if(!authorization||!/^Bearer\s+\S+$/i.test(authorization)) return reply({error:'unauthorized'},401);
  let input:unknown;
  try {input=await request.json();} catch {return reply({error:'invalid_json'},400);}
  if(!obj(input)||typeof input.message_id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.message_id)) return reply({error:'invalid_input'},400);
  const headers={apikey:anon,Authorization:authorization};
  try {
    const user=await fetch(base+'/auth/v1/user',{headers});
    if(!user.ok) return reply({error:'unauthorized'},401);
    // Query with the caller's JWT; RLS must permit this message.
    const msg=await fetch(base+'/rest/v1/crm_whatsapp_messages?select=id,message_type,raw_payload&message_type=eq.image&id=eq.'+encodeURIComponent(input.message_id)+'&limit=1',{headers});
    if(!msg.ok) return reply({error:'message_access_failed'},403);
    const rows:unknown=await msg.json();
    const record=Array.isArray(rows)?rows[0]:null;
    if(!obj(record)) return reply({error:'image_not_found'},404);
    const raw=obj(record.raw_payload)?record.raw_payload:{};
    const payload=obj(raw.message)?raw.message:raw;
    const image=obj(payload.image)?payload.image:null;
    const mediaId=typeof raw.media_id==='string'?raw.media_id:typeof image?.id==='string'?image.id:null;
    if(!mediaId||!/^[a-zA-Z0-9_-]{1,256}$/.test(mediaId)) return reply({error:'media_id_unavailable'},404);
    const media=await fetch('https://graph.facebook.com/'+version+'/'+encodeURIComponent(mediaId),{headers:{Authorization:'Bearer '+token}});
    if(!media.ok) return reply({error:'meta_media_lookup_failed',status:media.status},502);
    const metadata:unknown=await media.json();
    if(!obj(metadata)||typeof metadata.url!=='string') return reply({error:'meta_media_url_missing'},502);
    const mediaUrl=new URL(metadata.url);
    // Meta's short-lived download URLs must remain on Meta-owned hosts.
    if(mediaUrl.protocol!=='https:'||!(mediaUrl.hostname==='lookaside.fbsbx.com'||mediaUrl.hostname.endsWith('.fbcdn.net')||mediaUrl.hostname==='fbcdn.net')) return reply({error:'unexpected_media_host'},502);
    const file=await fetch(mediaUrl.href,{headers:{Authorization:'Bearer '+token}});
    if(!file.ok) return reply({error:'meta_media_download_failed',status:file.status},502);
    const type=(file.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(type!=='image/jpeg'&&type!=='image/png'&&type!=='image/webp') return reply({error:'unsupported_media_type'},502);
    const bytes=await file.arrayBuffer();
    if(bytes.byteLength>6_000_000) return reply({error:'media_too_large'},502);
    return new Response(bytes,{status:200,headers:{...cors,'content-type':type,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  } catch(e) {
    console.error('whatsapp_media_proxy_error',e instanceof Error?e.message:'unknown');
    return reply({error:'media_unavailable'},503);
  }
});
