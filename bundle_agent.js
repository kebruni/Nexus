const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const zipPath = path.join(__dirname, 'client', 'public', 'agent-source.zip');
console.log('Zipping agent source code to', zipPath);

const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(archive.pointer() + ' total bytes');
  console.log('Agent source package created in public folder!');
});

archive.on('error', (err) => { throw err; });

archive.pipe(output);

// Add agent files
archive.glob('**/*', {
  cwd: path.join(__dirname, 'agent'),
  ignore: ['node_modules/**', 'dist-gui/**', 'dist/**', 'ui/**', 'package-lock.json', '.agent-id']
});

archive.finalize();
