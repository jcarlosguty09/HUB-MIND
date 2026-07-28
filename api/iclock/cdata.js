// api/iclock/cdata.js
// MIRROR MODE: logs everything the device sends, raw, for protocol capture
export default async function handler(req, res) {
  const q = req.query;
  let body = '';
  await new Promise((resolve) => {
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', resolve);
  });

  console.log(`===== [MIRROR cdata] ${req.method} =====`);
  console.log(`QUERY: ${JSON.stringify(q)}`);
  console.log(`HEADERS: ${JSON.stringify(req.headers)}`);
  console.log(`BODY: ${body}`);
  console.log(`===== END =====`);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  const sn = q.SN || '';
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
 const t = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  if (req.method === 'GET') {
    return res.status(200).send(`GET OPTION FROM: ${sn}\nStamp=9999\nOpStamp=9999\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111111111\nRealtime=1\nServerVer=2.2.14\nTimeZone=-6\n`);
  }
  return res.status(200).send('OK\n');
}
