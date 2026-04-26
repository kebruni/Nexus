const { NodeSSH } = require('node-ssh');
const path = require('path');

const ssh = new NodeSSH();

async function deploy() {
  try {
    console.log('Connecting to SSH...');
    await ssh.connect({
      host: '164.92.240.90',
      port: 2222,
      username: 'nurbe',
      password: '3aHxUt123nurbek#!'
    });
    console.log('Connected!');

    const pass = '3aHxUt123nurbek#!';
    const sudo = `echo "${pass}" | sudo -S`;

    // 1. Install prerequisites
    console.log('Installing prerequisites (Node.js, Nginx, Certbot)...');
    await ssh.execCommand(`${sudo} DEBIAN_FRONTEND=noninteractive apt-get update`);
    await ssh.execCommand(`curl -fsSL https://deb.nodesource.com/setup_20.x | ${sudo} bash -`);
    await ssh.execCommand(`${sudo} DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs nginx certbot python3-certbot-nginx`);
    await ssh.execCommand(`${sudo} npm install -g pm2`);

    // 2. Prepare directory
    console.log('Preparing remote directory...');
    await ssh.execCommand(`${sudo} mkdir -p /var/www/pc-hub/server /var/www/pc-hub/client/dist`);
    await ssh.execCommand(`${sudo} chown -R nurbe:nurbe /var/www/pc-hub`);


    // 3. Upload Server Files
    console.log('Uploading server files...');
    const serverDir = path.join(__dirname, '../server');
    await ssh.putDirectory(serverDir, '/var/www/pc-hub/server', {
      recursive: true,
      validate: (itemPath) => {
        return !itemPath.includes('node_modules') && !itemPath.includes('.sqlite');
      }
    });

    // 4. Upload Client Files
    console.log('Uploading client files...');
    const clientDistDir = path.join(__dirname, '../client/dist');
    await ssh.putDirectory(clientDistDir, '/var/www/pc-hub/client/dist', {
      recursive: true,
      validate: (itemPath) => true
    });

    // 5. Setup Server
    console.log('Setting up Node server...');
    await ssh.execCommand('npm install', { cwd: '/var/www/pc-hub/server' });
    await ssh.execCommand('pm2 stop pc-hub-server || true');
    await ssh.execCommand('pm2 start index.js --name "pc-hub-server"', { cwd: '/var/www/pc-hub/server' });
    await ssh.execCommand('pm2 save');

    // 6. Setup Nginx Config
    console.log('Configuring Nginx...');
    const nginxConfig = `
server {
    listen 80;
    server_name system.kebruni.me;

    root /var/www/pc-hub/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
`;
    await ssh.execCommand(`cat << 'EOF' > /tmp/system.kebruni.me
${nginxConfig}
EOF`);

    await ssh.execCommand(`${sudo} mv /tmp/system.kebruni.me /etc/nginx/sites-available/system.kebruni.me`);
    await ssh.execCommand(`${sudo} ln -sf /etc/nginx/sites-available/system.kebruni.me /etc/nginx/sites-enabled/`);
    await ssh.execCommand(`${sudo} rm -f /etc/nginx/sites-enabled/default`);
    await ssh.execCommand(`${sudo} systemctl restart nginx`);

    // 7. Setup SSL
    console.log('Setting up SSL with Certbot...');
    const certbotResult = await ssh.execCommand(`${sudo} certbot --nginx -d system.kebruni.me --non-interactive --agree-tos -m admin@kebruni.me`);
    console.log('Certbot output:', certbotResult.stdout);
    if (certbotResult.stderr) {
        console.error('Certbot error:', certbotResult.stderr);
    }

    console.log('DEPLOYMENT FINISHED SUCCESSFULLY!');
    process.exit(0);
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

deploy();
