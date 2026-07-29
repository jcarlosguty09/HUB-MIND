// api/iclock/cdata.js
// ZKTeco SpeedFace-V5L ADMS endpoint — handshake + realtime check-in ingestion
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
  if (req.method === 'POST' && (table === 'rtlog' || table === 'ATTLOG')) {
    try {
      const rows = [];
      const lines = body.trim().split('\n').filter(l => l.trim());

      for (const line of lines) {
        const fields = {};
        for (const part of line.split('\t')) {
          const idx = part.indexOf('=');
          if (idx > -1) fields[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
        }

        const pin = fields.pin;
        const t = fields.time;
        if (!pin || pin === '0' || !t) continue;

        const verifyMap = { '1': 'fingerprint', '4': 'card', '15': 'face' };

        rows.push({
          zk_user_id: pin,
          timestamp: new Date(t.replace(' ', 'T') + '-06:00').toISOString(),
          verify_type: verifyMap[fields.verifytype] || fields.verifytype || 'unknown',
          device_sn: sn,
          raw_data: fields,
        });
      }

     if (rows.length > 0) {
        const headers = {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        };

        // Resolver user_id desde zk_user_map para cada zk_user_id único
        const pins = [...new Set(rows.map(r => r.zk_user_id))];
        const mapResp = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/zk_user_map?zk_user_id=in.(${pins.join(',')})&select=zk_user_id,user_id`,
          { headers }
        );
        const mappings = mapResp.ok ? await mapResp.json() : [];
        const pinToUser = {};
        for (const m of mappings) pinToUser[m.zk_user_id] = m.user_id;

        // Asignar user_id (null si no está mapeado todavía)
        for (const r of rows) r.user_id = pinToUser[r.zk_user_id] || null;

        const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/checkins`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal,resolution=ignore-duplicates' },

          body: JSON.stringify(rows),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          console.error('[checkins insert error]', resp.status, errText);
        } else {
          console.log(`[checkins] inserted ${rows.length} row(s)`);
        }
      }
    } catch (e) {
      console.error('[rtlog parse error]', e.message);
    }
    return res.status(200).send('OK\n');
  }

  // 4. Otros heartbeats
  return res.status(200).send('OK\n');
}
