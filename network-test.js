const http = require('http');

const PORT = 5001;
const HOST = '0.0.0.0';

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] Received request for ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'It works!', timestamp: new Date() }));
});

server.listen(PORT, HOST, () => {
  console.log('--- MINIMAL SERVER IS RUNNING ---');
  console.log(`🚀 Listening on http://${HOST}:${PORT}`);
  console.log('');
  console.log('Now, open a NEW shell tab and run this command:');
  console.log(`curl http://127.0.0.1:${PORT}`);
});

server.on('error', (err) => {
  console.error('🔥 Server Error:', err);
});
