const electronInstaller = require('electron-winstaller');
const path = require('path');

async function buildInstaller() {
  try {
    console.log('Building Electron setup EXE...');
    await electronInstaller.createWindowsInstaller({
      appDirectory: path.join(__dirname, 'dist-gui-3', 'PC Control Agent-win32-x64'),
      outputDirectory: path.join(__dirname, 'dist-gui-3', 'installer'),
      authors: 'Nurbek',
      exe: 'PC Control Agent.exe',
      setupExe: 'AgentSetup.exe',
      noMsi: true,
      description: 'PC Control Agent Installer',
      
      iconUrl: 'https://system.kebruni.me/server.png'
    });
    console.log('Installer built successfully!');
  } catch (e) {
    console.log(`Error building installer: ${e.message}`);
  }
}

buildInstaller();