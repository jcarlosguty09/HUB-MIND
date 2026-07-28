// api/iclock/getrequest.js
// ZKTeco ADMS: device polls this endpoint asking for pending commands
export default function handler(req, res) {
  const { SN } = req.query;
  console.log(`[ADMS] getrequest from SN=${SN}`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send('OK\n');
}
