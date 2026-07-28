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
  const t =
