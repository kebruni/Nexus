/**
 * System-control helpers (Windows-only).
 *
 * Nexus targets Windows clients exclusively, so every helper below uses
 * Windows-native APIs / shell commands. There are no cross-platform
 * fallbacks — the agent is expected to run on Windows 10 / 11.
 */
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const iconv = require('iconv-lite');

function decodeStream(buf) {
  if (!buf) return '';
  if (Buffer.isBuffer(buf)) {
    // cmd.exe pipes use the OEM (cp866) codepage on RU localisations.
    return iconv.decode(buf, 'cp866');
  }
  return String(buf);
}

/**
 * Execute an arbitrary shell command via cmd.exe. The OEM (cp866) buffer
 * is decoded so Cyrillic output renders correctly in the dashboard.
 */
async function executeCommand(command) {
  const options = {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    encoding: 'buffer',
    shell: 'cmd.exe',
  };

  try {
    const { stdout, stderr } = await execPromise(command, options);
    return {
      success: true,
      stdout: decodeStream(stdout),
      stderr: decodeStream(stderr),
      command,
    };
  } catch (error) {
    return {
      success: false,
      stdout: decodeStream(error.stdout),
      stderr: decodeStream(error.stderr) || error.message,
      command,
      code: error.code,
    };
  }
}

/**
 * Reboot the host. Requires admin.
 */
async function rebootComputer() {
  try {
    await execPromise('shutdown /r /t 5 /c "Nexus: Reboot requested"');
    return { success: true, message: 'Reboot scheduled' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Shut the host down. Requires admin.
 */
async function shutdownComputer() {
  try {
    await execPromise('shutdown /s /t 5 /c "Nexus: Shutdown requested"');
    return { success: true, message: 'Shutdown scheduled' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * List Windows services via PowerShell `Get-Service`.
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
 * Start, stop, or restart a Windows service via `net start/stop`.
 */
async function serviceAction(serviceName, action) {
  if (!/^[a-zA-Z0-9_\-\. @]+$/.test(serviceName)) {
    return { success: false, message: 'Invalid service name format' };
  }
  if (!['start', 'stop', 'restart'].includes(action)) {
    return { success: false, message: `Unknown action: ${action}` };
  }

  const winMap = {
    start: `net start "${serviceName}"`,
    stop: `net stop "${serviceName}"`,
    restart: `net stop "${serviceName}" & net start "${serviceName}"`,
  };
  const command = winMap[action];

  try {
    const { stdout } = await execPromise(command, { timeout: 30000 });
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
 * Lock the workstation screen via the Win32 `LockWorkStation` API.
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
 * Sound an alarm — five PowerShell `[console]::beep` tones.
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

module.exports = {
  executeCommand,
  rebootComputer,
  shutdownComputer,
  getServices,
  serviceAction,
  lockScreen,
  soundAlarm,
};
