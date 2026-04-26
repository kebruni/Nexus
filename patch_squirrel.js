const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'agent', 'main.js');
let code = fs.readFileSync(file, 'utf8');

const squirrelHandler = `// Handle Squirrel installer events
if (require('electron-squirrel-startup')) {
    process.exit(0);
}

`;

if (!code.includes('electron-squirrel-startup')) {
    code = squirrelHandler + code;
    fs.writeFileSync(file, code, 'utf8');
    console.log('Added squirrel handler to main.js');
}

// We should also install electron-squirrel-startup
