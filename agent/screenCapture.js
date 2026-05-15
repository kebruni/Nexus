const screenshot = require('screenshot-desktop');
const { exec } = require('child_process');
let robot;
try {
  robot = require('robot-js');
} catch (e) {
  console.warn('[WARN] robot-js not available, using PowerShell fallback');
}

let streamingInterval = null;
let displayCache = null;
let displayCacheAt = 0;
const DISPLAY_CACHE_TTL = 5000;
const MOUSE_POLL_INTERVAL = 200;

async function getDisplays(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && displayCache && now - displayCacheAt < DISPLAY_CACHE_TTL) {
    return displayCache;
  }

  const displays = await screenshot.listDisplays();
  displayCache = displays;
  displayCacheAt = now;
  return displays;
}

/**
 * List available monitors/displays
 */
async function listMonitors() {
  try {
    const displays = await getDisplays(true);
    return displays.map((d, i) => ({
      id: d.id || i,
      name: d.name || `Display ${i + 1}`,
      index: i,
    }));
  } catch (error) {
    return [{ id: 0, name: 'Primary Display', index: 0 }];
  }
}

/**
 * Capture a screenshot and return as base64 JPEG
 * @param {number} quality JPEG quality
 * @param {number} monitorIndex which monitor to capture (0 = primary)
 */
async function captureScreen(quality = 50, monitorIndex = 0) {
  try {
    const displays = await getDisplays();
    const opts = { format: 'jpg', quality };
    if (displays.length > 1 && monitorIndex < displays.length) {
      opts.screen = displays[monitorIndex].id;
    }
    const img = await screenshot(opts);
    return {
      success: true,
      image: img.toString('base64'),
      timestamp: Date.now(),
      monitor: monitorIndex,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

let streamingActive = false;
let mousePositionInterval = null;
let lastMouseX = 0;
let lastMouseY = 0;
const MAX_STREAM_FPS = 5;
const FALLBACK_MOUSE_POLL_INTERVAL = robot ? 150 : 1000;

function runPowerShell(script, onErrorTag, callback) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  exec(
    `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    (err, stdout = '') => {
      if (err) {
        console.error(`[${onErrorTag}]`, err.message);
      }
      if (callback) callback(err, stdout);
    }
  );
}

/**
 * Get current mouse cursor position.
 */
function getMousePosition(callback) {
  if (robot) {
    try {
      const pos = robot.getMousePos();
      callback(pos.x, pos.y);
      return;
    } catch (err) {
      console.error('[Mouse] robot-js getMousePos failed:', err.message);
    }
  }

  // PowerShell + Win32 GetCursorPos fallback.
  const ps = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MousePos {
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
    public struct POINT { public int X; public int Y; }
}
"@
$pos = New-Object MousePos+POINT
[MousePos]::GetCursorPos([ref]$pos)
Write-Output "$($pos.X),$($pos.Y)"
`;

  runPowerShell(ps, 'MousePos', (_err, stdout) => {
    const match = stdout.trim().match(/(\d+),(\d+)/);
    if (!match) {
      callback(0, 0);
      return;
    }
    callback(parseInt(match[1], 10), parseInt(match[2], 10));
  });
}

/**
 * Start sending screenshots at given FPS
 * @param {number} monitor which monitor index to stream
 */
function startStreaming(socket, fps = 2, quality = 50, monitor = 0) {
  stopStreaming();
  streamingActive = true;
  const safeFps = Math.min(Math.max(Number(fps) || 1, 1), MAX_STREAM_FPS);
  const interval = Math.max(300, Math.round(1000 / safeFps));

  const loop = async () => {
    if (!streamingActive) return;
    const start = Date.now();
    const frame = await captureScreen(quality, monitor);
    if (frame.success && streamingActive) {
      socket.emit('screen:frame', frame);
    }
    if (streamingActive) {
      const delay = Math.max(0, interval - (Date.now() - start));
      streamingInterval = setTimeout(loop, delay);
    }
  };

  loop();

  // Track mouse position more slowly when using the PowerShell fallback, because it is expensive.
  mousePositionInterval = setInterval(() => {
    if (!streamingActive) return;
    getMousePosition((x, y) => {
      if (x !== lastMouseX || y !== lastMouseY) {
        lastMouseX = x;
        lastMouseY = y;
        socket.emit('screen:cursor', { x, y });
      }
    });
  }, FALLBACK_MOUSE_POLL_INTERVAL);

  console.log(`[Screen] Streaming started at ${safeFps} FPS (monitor ${monitor})`);
}

/**
 * Stop screenshot streaming
 */
function stopStreaming() {
  streamingActive = false;
  if (streamingInterval) {
    clearTimeout(streamingInterval);
    streamingInterval = null;
  }
  if (mousePositionInterval) {
    clearInterval(mousePositionInterval);
    mousePositionInterval = null;
  }
  console.log('[Screen] Streaming stopped');
}

/**
 * Simulate mouse event.
 */
function simulateMouse(x, y, type = 'click', button = 'left', wheel = 0) {
  if (robot) {
    try {
      robot.setMousePos(x, y);
      if (type === 'click') {
        robot.mouseClick(button === 'right' ? 'right' : 'left');
      } else if (type === 'dblclick') {
        robot.mouseClick('left');
        setTimeout(() => robot.mouseClick('left'), 50);
      } else if (type === 'wheel') {
        const dir = wheel > 0 ? 3 : -3;
        robot.scrollMouse(dir);
      }
      return;
    } catch (err) {
      console.error(`[Mouse] robot-js ${type} failed:`, err.message);
    }
  }

  const basePs = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseSim {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
    public const uint LEFTDOWN = 0x0002;
    public const uint LEFTUP = 0x0004;
    public const uint RIGHTDOWN = 0x0008;
    public const uint RIGHTUP = 0x0010;
    public const uint WHEEL = 0x0800;
}
"@
[MouseSim]::SetCursorPos(${x}, ${y})
`;

  let cmd = basePs;
  if (type === 'click') {
    if (button === 'right') {
      cmd += `[MouseSim]::mouse_event([MouseSim]::RIGHTDOWN, 0, 0, 0, 0)\n`;
      cmd += `[MouseSim]::mouse_event([MouseSim]::RIGHTUP, 0, 0, 0, 0)\n`;
    } else {
      cmd += `[MouseSim]::mouse_event([MouseSim]::LEFTDOWN, 0, 0, 0, 0)\n`;
      cmd += `[MouseSim]::mouse_event([MouseSim]::LEFTUP, 0, 0, 0, 0)\n`;
    }
  } else if (type === 'dblclick') {
    cmd += `[MouseSim]::mouse_event([MouseSim]::LEFTDOWN, 0, 0, 0, 0)\n`;
    cmd += `[MouseSim]::mouse_event([MouseSim]::LEFTUP, 0, 0, 0, 0)\n`;
    cmd += `Start-Sleep -Milliseconds 50\n`;
    cmd += `[MouseSim]::mouse_event([MouseSim]::LEFTDOWN, 0, 0, 0, 0)\n`;
    cmd += `[MouseSim]::mouse_event([MouseSim]::LEFTUP, 0, 0, 0, 0)\n`;
  } else if (type === 'wheel') {
    const wheelData = wheel > 0 ? 120 : -120;
    cmd += `[MouseSim]::mouse_event([MouseSim]::WHEEL, 0, 0, ${wheelData}, 0)\n`;
  }

  runPowerShell(cmd, 'Mouse');
}

/**
 * Simulate keyboard input.
 */
function simulateKeyboard(key, type = 'press') {
  if (robot) {
    try {
      // Use keyTap for single keys and typeString for printable chars.
      const keyMap = {
        Enter: 'enter',
        Backspace: 'backspace',
        Tab: 'tab',
        Escape: 'escape',
        Delete: 'delete',
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      if (keyMap[key]) {
        robot.keyTap(keyMap[key]);
      } else if (key && key.length === 1) {
        robot.typeString(key);
      }
      return;
    } catch (err) {
      console.error(`[Keyboard] robot-js ${type} ${key} failed:`, err.message);
    }
  }

  const ps = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escapeSendKeys(key)}')
`;
  runPowerShell(ps, 'Keyboard');
}

function escapeSendKeys(key) {
  const keyMap = {
    Enter: '{ENTER}',
    Backspace: '{BS}',
    Tab: '{TAB}',
    Escape: '{ESC}',
    Delete: '{DEL}',
    Home: '{HOME}',
    End: '{END}',
    PageUp: '{PGUP}',
    PageDown: '{PGDN}',
    ArrowUp: '{UP}',
    ArrowDown: '{DOWN}',
    ArrowLeft: '{LEFT}',
    ArrowRight: '{RIGHT}',
    F1: '{F1}', F2: '{F2}', F3: '{F3}', F4: '{F4}',
    F5: '{F5}', F6: '{F6}', F7: '{F7}', F8: '{F8}',
    F9: '{F9}', F10: '{F10}', F11: '{F11}', F12: '{F12}',
    ' ': ' ',
  };

  if (keyMap[key]) return keyMap[key];
  key = String(key || '').replace(/'/g, "''");
  if ('+^%~(){}[]'.includes(key)) return `{${key}}`;
  return key;
}

module.exports = { captureScreen, startStreaming, stopStreaming, simulateMouse, simulateKeyboard, listMonitors };
