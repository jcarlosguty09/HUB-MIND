// api/iclock/cdata.js
// ZKTeco ADMS/Push SDK endpoint for SpeedFace-V5L firmware ZAM230 Push v3.1.6S

export default async function handler(req, res) {
  const { SN, table, Stamp, options, pushver, timestamp } = req.query;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // Device heartbeat / options request - GET
  if (req.method === 'GET') {
    const sn = SN || '';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const serverTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    console.log(`[ADMS] GET heartbeat from SN=${sn} pushver=${pushver} options=${options}`);

    // Push SDK v3 response format
    if (pushver) {
      return res.status(200).send([
        `GET OPTION FROM: ${sn}`,
        `ServerTime=${serverTime}`,
        `Realtime=1`,
        `TransInterval=1`,
        `ATTLOGStamp=None`,
        `OPERLOGStamp=None`,
        `ATTPHOTOStamp=None`,
        `ErrorDelay=30`,
        `Delay=10`,
        `TransFlag=TransData AttLog OpLog AttPhoto EnrollUser ChkUser`,
        `TimeZone=0`,
        `Realtime=1`,
        `Encrypt=None`,
      ].join('\n'));
    }

    // Standard ADMS response
    return res.status(200).send(`GET OPTION FROM: ${sn}\nServerTime=${serverTime}\n`);
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

    if (table === 'ATTLOG' && body.trim()) {
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
        }
      } catch(e) {
        console.error('[ADMS] Forward error:', e.message);
      }
    }

    // Push SDK expects specific response
    return res.status(200).send('OK');
  }

  return res.status(200).send('OK');
}
