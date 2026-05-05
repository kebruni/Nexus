/**
 * Local file-system helpers for the server host itself.
 *
 * Used by the dashboard socket handlers so an operator can browse
 * files that live on the server machine (not on an agent) — for
 * example to drop a file into a shared folder that agents pull from.
 */
const fs = require('fs');
const path = require('path');

function listDirectory(dirPath) {
  try {
    const defaultPath = process.platform === 'win32' ? 'C:\\' : '/';
    const resolvedPath = path.resolve(dirPath || defaultPath);
    const items = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const files = [];
    for (const item of items) {
      try {
        const fullPath = path.join(resolvedPath, item.name);
        const stats = fs.statSync(fullPath);
        files.push({
          name: item.name,
          path: fullPath,
          isDirectory: item.isDirectory(),
          size: stats.size,
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
        });
      } catch {
        files.push({
          name: item.name,
          path: path.join(resolvedPath, item.name),
          isDirectory: item.isDirectory(),
          size: 0,
          modified: null,
          created: null,
          error: 'Access denied',
        });
      }
    }
    return { success: true, path: resolvedPath, parentPath: path.dirname(resolvedPath), files };
  } catch (error) {
    return { success: false, path: dirPath, error: error.message, files: [] };
  }
}

function readFile(filePath) {
  try {
    const resolved = path.resolve(filePath);
    const stats = fs.statSync(resolved);
    if (stats.size > 10 * 1024 * 1024) {
      return { success: false, error: 'File too large (max 10MB)' };
    }
    const content = fs.readFileSync(resolved);
    return {
      success: true,
      path: resolved,
      name: path.basename(resolved),
      size: stats.size,
      content: content.toString('base64'),
    };
  } catch (error) {
    return { success: false, path: filePath, error: error.message };
  }
}

function writeFile(fileName, base64Data, destDir) {
  try {
    const targetDir = path.resolve(destDir || 'C:\\');
    const targetPath = path.join(targetDir, fileName);
    // Prevent path traversal
    if (!targetPath.startsWith(targetDir)) return { success: false, error: 'Invalid path' };
    fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
    return { success: true, path: targetPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { listDirectory, readFile, writeFile };
