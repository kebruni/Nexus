const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const iconv = require('iconv-lite');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function decodeStream(buf) {
  if (!buf) return '';
  if (Buffer.isBuffer(buf)) {
    return isWin ? iconv.decode(buf, 'cp866') : buf.toString('utf8');
  }
  return String(buf);
}

/**
 * Execute an arbitrary shell command via the platform's default shell.
 * On Windows we force cmd.exe and decode the OEM (cp866) buffer for Cyrillic.
 * On POSIX we let Node use /bin/sh and decode as UTF-8.
 */
async function executeCommand(command) {
  const options = {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    encoding: 'buffer',
  };
  if (isWin) options.shell = 'cmd.exe';

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
 * Reboot the host. Requires admin/root.
 */
async function rebootComputer() {
  const cmd = isWin
    ? 'shutdown /r /t 5 /c "Nexus: Reboot requested"'
    : 'shutdown -r +1 "Nexus: Reboot requested"';
  try {
    await execPromise(cmd);
    return { success: true, message: 'Reboot scheduled' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Shut the host down. Requires admin/root.
 */
async function shutdownComputer() {
  const cmd = isWin
    ? 'shutdown /s /t 5 /c "Nexus: Shutdown requested"'
    : (isMac ? 'shutdown -h +1 "Nexus: Shutdown requested"' : 'shutdown -h +1 "Nexus: Shutdown requested"');
  try {
    await execPromise(cmd);
    return { success: true, message: 'Shutdown scheduled' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function parseSystemctlList(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // unit  load  active  sub  description
      const parts = line.split(/\s+/);
      const name = parts[0];
      const sub = parts[3];
      return {
        name,
        displayName: parts.slice(4).join(' ') || name,
        status: sub === 'running' ? 'Running' : sub === 'exited' ? 'Stopped' : sub || 'Unknown',
        startType: 'Manual',
      };
    });
}

function parseLaunchctlList(stdout) {
  // PID Status Label
  return stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const pid = parts[0];
      const label = parts.slice(2).join(' ');
      return {
        name: label,
        displayName: label,
        status: pid !== '-' ? 'Running' : 'Stopped',
        startType: 'Manual',
      };
    });
}

/**
 * List services / daemons in a platform-appropriate way.
 */
async function getServices() {
  try {
    if (isWin) {
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
    }

    if (isMac) {
      const { stdout } = await execPromise('launchctl list', { maxBuffer: 5 * 1024 * 1024 });
      return { success: true, services: parseLaunchctlList(stdout) };
    }

    // Linux
    const { stdout } = await execPromise(
      'systemctl list-units --type=service --no-pager --plain --no-legend',
      { maxBuffer: 5 * 1024 * 1024 }
    );
    return { success: true, services: parseSystemctlList(stdout) };
  } catch (error) {
    return { success: false, error: error.message, services: [] };
  }
}

/**
 * Start, stop, or restart a service in a platform-appropriate way.
 */
async function serviceAction(serviceName, action) {
  if (!/^[a-zA-Z0-9_\-\. @]+$/.test(serviceName)) {
    return { success: false, message: 'Invalid service name format' };
  }
  if (!['start', 'stop', 'restart'].includes(action)) {
    return { success: false, message: `Unknown action: ${action}` };
  }

  let command;
  if (isWin) {
    const winMap = {
      start: `net start "${serviceName}"`,
      stop: `net stop "${serviceName}"`,
      restart: `net stop "${serviceName}" & net start "${serviceName}"`,
    };
    command = winMap[action];
  } else if (isMac) {
    const macMap = {
      start: `launchctl start "${serviceName}"`,
      stop: `launchctl stop "${serviceName}"`,
      restart: `launchctl stop "${serviceName}" && launchctl start "${serviceName}"`,
    };
    command = macMap[action];
  } else {
    command = `systemctl ${action} "${serviceName}"`;
  }

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
 * Lock the workstation screen.
 */
async function lockScreen() {
  if (isWin) {
    try {
      await execPromise('rundll32.exe user32.dll,LockWorkStation');
      return { success: true, message: 'Screen locked' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  if (isMac) {
    try {
      await execPromise('pmset displaysleepnow');
      return { success: true, message: 'Display locked' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Linux: try a few common lock helpers
  const candidates = [
    'loginctl lock-session',
    'xdg-screensaver lock',
    'gnome-screensaver-command -l',
    'dm-tool lock',
  ];
  for (const candidate of candidates) {
    try {
      await execPromise(candidate);
      return { success: true, message: `Screen locked via ${candidate.split(' ')[0]}` };
    } catch {
      // try next
    }
  }
  return { success: false, message: 'No supported screen-lock helper found (loginctl/xdg-screensaver/gnome-screensaver/dm-tool)' };
}

/**
 * Sound an alarm. PowerShell beeps on Windows; terminal BEL on POSIX.
 */
async function soundAlarm() {
  if (isWin) {
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

  // POSIX fallback: write BEL to the controlling TTY a few times
  try {
    process.stdout.write('\u0007\u0007\u0007\u0007\u0007');
    return { success: true, message: 'Alarm sent (terminal bell)' };
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
