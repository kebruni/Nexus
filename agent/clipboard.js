/**
 * PC Control Hub — Clipboard Manager
 * Read/Write system clipboard on Windows via PowerShell
 */

const { exec } = require('child_process');

/**
 * Get current clipboard text content
 */
function getClipboard() {
  return new Promise((resolve) => {
    exec('powershell -Command "Get-Clipboard"', { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true, text: stdout.trim() });
      }
    });
  });
}

/**
 * Set clipboard text content
 */
function setClipboard(text) {
  return new Promise((resolve) => {
    // Escape for PowerShell
    const escaped = text.replace(/'/g, "''");
    exec(`powershell -Command "Set-Clipboard -Value '${escaped}'"`, { timeout: 5000 }, (err) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
}

module.exports = { getClipboard, setClipboard };
