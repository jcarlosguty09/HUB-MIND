// api/iclock/cdata.js
// ZKTeco SpeedFace-V5L ADMS endpoint — handshake + realtime check-in ingestion
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const q = req.query;
  let body = '';
  await new Promise((resolve) => {
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', resolve);
  });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  const sn = q.SN || '';
  const path = q.path || '';
  const table = q.table || '';

  // 1. Registro del dispositivo
  if (path === 'registry' || req.url.includes('registry')) {
    return res.status(200).send(`RegistryCode=OK\n`);
  }

  // 2. GET de opciones (arranque)
  if (req.method === 'GET') {
    return res.status(200).send(`GET OPTION FROM: ${sn}\nStamp=9999\nOpStamp=9999\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111111111\nRealtime=1\nServerVer=2.2.14\nTimeZone=-6\n`);
  }

  // 3. Check-in en tiempo real (rtlog) o histórico (ATTLOG)
  if (req.method === 'POST' && (table === 'rtlog' || table
