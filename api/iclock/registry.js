// api/iclock/registry.js
// MIRROR MODE
export default async function handler(req, res) {
  const q = req.query;
  let body = '';
  await new Promise((resolve) => {
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', resolve);
  });
  console.log(`===== [MIRROR registry] ${req.method} =====`);
  console.log(`QUERY: ${JSON.stringify(q)}`);
  console.log(`BODY: ${body}`);
  console.log(`===== END =====`);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  // Respuesta estándar iClock a registry: acepta el registro
  return res.status(200).send(`RegistryCode=${q.SN || 'OK'}\n`);
}
