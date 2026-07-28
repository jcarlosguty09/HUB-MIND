// api/iclock/push.js
// ZKTeco Push SDK v3: device requests push configuration after registry
export default async function handler(req, res) {
  const { SN } = req.query;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (req.method === 'GET') {
    console.log(`[ADMS] PUSH config request from SN=${SN}`);
    return res.status(200).send([
      'ServerVersion=3.0.1',
      'ServerName=HubMind ADMS',
      'PushVersion=3.1.6',
      'ErrorDelay=30',
      'RequestDelay=10',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransTables=User Transaction',
      'Realtime=1',
      'SessionID=HUBMIND',
      'TimeoutSec=10',
      '',
    ].join('\n'));
  }

  // POST a /iclock/push es el heartbeat de sesión
  console.log(`[ADMS] PUSH heartbeat from SN=${SN}`);
  return res.status(200).send('OK\n');
}
