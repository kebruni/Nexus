const { NodeSSH } = require('node-ssh');
const path = require('path');

const ssh = new NodeSSH();

async function deployClient() {
  try {
    console.log('Connecting to SSH...');
    await ssh.connect({
      host: '164.92.240.90',
      port: 2222,
      username: 'nurbe',
      password: '3aHxUt123nurbek#!'
    });
    console.log('Connected!');

    // Upload Client Files
    console.log('Uploading client dist files to VPS...');
    const clientDistDir = path.join(__dirname, '../client/dist');
    await ssh.putDirectory(clientDistDir, '/var/www/pc-hub/client/dist', {      
      recursive: true,
      concurrency: 10
    });

    console.log('CLIENT DIST UPLOADED SUCCESSFULLY!');
    process.exit(0);
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

deployClient();