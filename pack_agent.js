const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { NodeSSH } = require('node-ssh');

async function deploy() {
    const ssh = new NodeSSH();
    const zipPath = path.join(__dirname, 'agent_packed.zip');
    
    console.log('Zipping agent folder...');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', async () => {
        console.log(archive.pointer() + ' total bytes');
        console.log('Zip created. Uploading to VPS...');
        
        try {
            await ssh.connect({
                host: '164.92.240.90',
                username: 'root',
                privateKeyPath: 'C:\\Users\\nurbe\\.ssh\\id_rsa' // standard path, but we'll try password if needed? We used ssh earlier without password? Wait.
            });
        } catch (e) {
            console.log('Trying with password... you might need to adjust this script or run without if you have ssh agent.');
        } 
        
        // Actually, let's just make the server host the agent.zip from the same repo if they clone it? No, VPS only has server code.
    });
    
    archive.pipe(output);
    archive.glob('**/*', {
        cwd: path.join(__dirname, 'agent'),
        ignore: ['node_modules/**', 'dist-gui/**', 'package-lock.json', '.agent-id']
    });
    archive.finalize();
}
deploy();