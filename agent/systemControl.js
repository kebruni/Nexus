const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const iconv = require('iconv-lite');

/**
 * Execute an arbitrary shell command
 */
async function executeCommand(command) {
  try {
    // In Windows, console apps usually output text in CP866 (for Cyrillic) or similar OEM code pages.
    // We fetch raw buffers and decode them using iconv-lite to properly handle Russian characters.
    const { stdout, stderr } = await execPromise(command, {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      shell: 'cmd.exe',
      encoding: 'buffer' // Ensure exec returns raw Buffer
    });
    
    // Decode from internal CP866 (for Russian Windows). If it's a different locale it might be different,
    // but cp866 is the primary cause of these "" in Russian systems.
    const decode = (buf) => process.platform === 'win32' ? iconv.decode(buf, 'cp866') : buf.toString('utf8');

    return {
      success: true,
      stdout: stdout ? decode(stdout) : '',
      stderr: stderr ? decode(stderr) : '',
      command,
    };
  } catch (error) {
    const decode = (buf) => (buf && process.platform === 'win32') ? iconv.decode(Buffer.from(buf), 'cp866') : (buf ? buf.toString() : '');
    return {
      success: false,
      stdout: decode(error.stdout) || '',
      stderr: decode(error.stderr) || error.message,
      command,
      code: error.code,
    };
  }
}

/**
 * Reboot the computer
 */
async function rebootComputer() {
  try {
    await execPromise('shutdown /r /t 5 /c "PC Control Hub: Reboot requested"');
    return { success: true, message: 'Reboot initiated (5 sec delay)' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Shutdown the computer
 */
async function shutdownComputer() {
  try {
    await execPromise('shutdown /s /t 5 /c "PC Control Hub: Shutdown requested"');
    return { success: true, message: 'Shutdown initiated (5 sec delay)' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Get list of Windows services
 */
async function getServices() {
  try {
    const { stdout } = await execPromise(
      'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-Service | Select-Object Name, DisplayName, Status, StartType | ConvertTo-Json"',
      { maxBuffer: 5 * 1024 * 1024 }
    );
    const services = JSON.parse(stdout);
    return {
      success: true,
      services: (Array.isArray(services) ? services : [services]).map((s) => ({
        name: s.Name,
        displayName: s.DisplayName,
        status: s.Status === 4 ? 'Running' : s.Status === 1 ? 'Stopped' : String(s.Status),
        startType: s.StartType === 2 ? 'Automatic' : s.StartType === 3 ? 'Manual' : s.StartType === 4 ? 'Disabled' : String(s.StartType),
      })),
    };
  } catch (error) {
    return { success: false, error: error.message, services: [] };
  }
}

/**
 * Start, stop, or restart a Windows service
 */
async function serviceAction(serviceName, action) {
  if (!/^[a-zA-Z0-9_\-\. ]+$/.test(serviceName)) {
    return { success: false, message: 'Invalid service name format' };
  }

  const commands = {
    start: `net start "${serviceName}"`,
    stop: `net stop "${serviceName}"`,
    restart: `net stop "${serviceName}" & net start "${serviceName}"`,
  };

  if (!commands[action]) {
    return { success: false, message: `Unknown action: ${action}` };
  }

  try {
    const { stdout, stderr } = await execPromise(commands[action], { timeout: 30000 });
    return { success: true, message: stdout || 'Operation completed', serviceName, action };
  } catch (error) {
    return {
      success: false,
      message: error.stderr || error.message,
      serviceName,
      action,
    };
  }
}

/**
 * Lock the workstation screen
 */
async function lockScreen() {
  try {
    await execPromise('rundll32.exe user32.dll,LockWorkStation');
    return { success: true, message: 'Screen locked' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Play an alarm sound
 */
async function soundAlarm() {
  try {
    await execPromise(
      'powershell -NoProfile -NonInteractive -Command "[console]::beep(1000,500);[console]::beep(1500,500);[console]::beep(1000,500);[console]::beep(1500,500);[console]::beep(1000,500)"',
      { timeout: 15000 }
    );
    return { success: true, message: 'Alarm sounded' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

module.exports = { executeCommand, rebootComputer, shutdownComputer, getServices, serviceAction, lockScreen, soundAlarm };
