
const http = require('http');

async function verifyServer() {
  console.log('🔍 Verifying server startup...');
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const testEndpoints = [
    '/api/health',
    '/api/playlists'
  ];
  
  for (const endpoint of testEndpoints) {
    try {
      const options = {
        hostname: 'localhost',
        port: 5001,
        path: endpoint,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dev_jwt_token_djjetfuel_12345'
        }
      };
      
      const req = http.request(options, (res) => {
        console.log(`✅ ${endpoint}: ${res.statusCode}`);
      });
      
      req.on('error', (err) => {
        console.log(`❌ ${endpoint}: ${err.message}`);
      });
      
      req.end();
    } catch (error) {
      console.log(`❌ ${endpoint}: ${error.message}`);
    }
  }
}

if (require.main === module) {
  verifyServer();
}

module.exports = { verifyServer };
