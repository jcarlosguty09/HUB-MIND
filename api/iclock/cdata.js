// api/iclock/cdata.js
// ZKTeco ADMS endpoint - receives check-ins from SpeedFace-V5L
// Vercel serverless function

export default async function handler(req, res) {
  const { SN, table, Stamp } = req.query;

  // Device heartbeat - GET request
  if (req.method === 'GET') {
    console.log(`[ADMS] Heartbeat from ${SN}`);
    // Return server time and empty commands
    const now = new Date();
    const serverTime = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(`GET OPTION FROM: ${SN}\nServerTime=${serverTime}\n`);
  }

  // Device sending attendance data - POST request
  if (req.method === 'POST' && table === 'ATTLOG') {
    let body = '';
    await new Promise((resolve) => {
      req.on('data', chunk => body += chunk);
      req.on('end', resolve);
    });

    console.log(`[ADMS] ATTLOG from ${SN}:`, body);

    // Forward to Supabase Edge Function
    try {
      const supabaseUrl = process.env.SUPABASE_URL || 'https://lvygabtezorvdcbmclxn.supabase.co';
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

      const response = await fetch(`${supabaseUrl}/functions/v1/zkteco-adms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ sn: SN, table, body, timestamp: new Date().toISOString() }),
      });

      console.log('[ADMS] Supabase response:', response.status);
    } catch(e) {
      console.error('[ADMS] Error forwarding to Supabase:', e);
    }

    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send('OK');
  }

  // Default response
  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send('OK');
}
