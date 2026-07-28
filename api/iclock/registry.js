// api/iclock/registry.js
// ZKTeco Push SDK v3: device registration handshake
export default async function handler(req, res) {
  const { SN } = req.query;
  let body = '';
  await new Promise((resolve) => {
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', resolve);
  });
  console.log(`[ADMS] REGISTRY from SN=${SN}: ${body.substring(0, 300)}`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send('RegistryCode=HUBMIND2026\n');
}
