// api/iclock/cdata.js
// ZKTeco ADMS/Push SDK endpoint for SpeedFace-V5L firmware ZAM230 Push v3.1.6S
export default async function handler(req, res) {
  const { SN, table, Stamp, options, pushver } = req.query;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // Device heartbeat / options request - GET
  if (req.method === 'GET') {
    const sn = SN || '';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const serverTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    console.log(`[ADMS] GET heartbeat from SN=${sn} pushver=${pushver} options=${options}`);

    return res.status(200).send([
      `GET OPTION FROM: ${sn}`,
      `ATTLOGStamp=9999`,
      `OPERLOGStamp=9999`,
      `ATTPHOTOStamp=9999`,
      `ErrorDelay=30`,
      `Delay=10`,
      `TransTimes=00:00;14:05`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog\tOpLog\tEnrollUser\tChgUser`,
      `TimeZone=-6`,
      `Realtime=1`,
      `Encrypt=0`,
      `ServerVer=3.1.6 ${serverTime}`,
      ``,
    ].join('\n'));
  }

  // Device sending data - POST
  if (req.method === 'POST') {
    let body = '';
    await new Promise((resolve) => {
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', resolve);
    });
    console.log(`[ADMS] POST SN=${SN} table=${table} Stamp=${Stamp}`);
    console.log(`[ADMS] Body: ${body.substring(0, 500)}`);

    let lineCount = 0;

    if (table === 'ATTLOG' && body.trim()) {
      lineCount = body.trim().split('\n').filter(l => l.trim()).length;
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
        if (supabaseUrl && supabaseKey) {
          await fetch(`${supabaseUrl}/functions/v1/zkteco-adms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ sn: SN, table, body, timestamp: new Date().toISOString() }),
          });
        } else {
          console.error('[ADMS] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
        }
      } catch(e) {
        console.error('[ADMS] Forward error:', e.message);
      }
      // ADMS protocol: acknowledge with number of records processed
      return res.status(200).send(`OK: ${lineCount}\n`);
    }

    return res.status(200).send('OK\n');
  }

  return res.status(200).send('OK\n');
}
