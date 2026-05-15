const fs = require('fs');
const path = require('path');

/**
 * List directory contents
 */
function listDirectory(dirPath) {
  try {
    const resolvedPath = path.resolve(dirPath || 'C:\\');
    const items = fs.readdirSync(resolvedPath, { withFileTypes: true });

    // Probe drive letters C: .. Z: so the dashboard's file-tree side
    // panel can render the actual set of attached drives.
    const drives = [];
    for (let i = 67; i <= 90; i++) {
      const drive = String.fromCharCode(i) + ':\\\\';
      try { fs.accessSync(drive, fs.constants.R_OK); drives.push(String.fromCharCode(i) + ':'); } catch {}
    }

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
        // Skip files we can't access
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

    return {
      success: true,
      path: resolvedPath,
      parentPath: path.dirname(resolvedPath),
      drives,
      files: files.sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      }),
    };
  } catch (error) {
    return { success: false, path: dirPath, error: error.message, files: [] };
  }
}

/**
 * Read file content (base64 encoded for binary safety)
 */
function readFile(filePath) {
  try {
    const resolved = path.resolve(filePath);
    const stats = fs.statSync(resolved);

    // Limit file size to 10MB
    if (stats.size > 10 * 1024 * 1024) {
      return { success: false, error: 'File too large (max 10MB)', path: resolved };
    }

    const content = fs.readFileSync(resolved);
    return {
      success: true,
      path: resolved,
      name: path.basename(resolved),
      size: stats.size,
      content: content.toString('base64'),
      mimeType: guessMimeType(resolved),
    };
  } catch (error) {
    return { success: false, path: filePath, error: error.message };
  }
}

/**
 * Delete a file or directory
 */
function deleteFile(filePath) {
  try {
    const resolved = path.resolve(filePath);
    const stats = fs.statSync(resolved);

    if (stats.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolved);
    }

    return { success: true, path: resolved, message: 'Deleted successfully' };
  } catch (error) {
    return { success: false, path: filePath, error: error.message };
  }
}

/**
 * Create a directory
 */
function mkdirSync(dirPath) {
  try {
    const resolved = path.resolve(dirPath);
    fs.mkdirSync(resolved, { recursive: true });
    return { success: true, path: resolved };
  } catch (error) {
    return { success: false, path: dirPath, error: error.message };
  }
}

/**
 * Rename / move a file or directory
 */
function renameFile(oldPath, newPath) {
  try {
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.resolve(newPath);
    fs.renameSync(resolvedOld, resolvedNew);
    return { success: true, oldPath: resolvedOld, newPath: resolvedNew };
  } catch (error) {
    return { success: false, oldPath, newPath, error: error.message };
  }
}

/**
 * Simple MIME type guesser
 */
function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.exe': 'application/octet-stream',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.log': 'text/plain',
    '.csv': 'text/csv',
    '.md': 'text/markdown',
    '.bat': 'text/plain',
    '.ps1': 'text/plain',
    '.py': 'text/plain',
    '.ini': 'text/plain',
    '.cfg': 'text/plain',
    '.conf': 'text/plain',
  };
  return types[ext] || 'application/octet-stream';
}

module.exports = { listDirectory, readFile, deleteFile, mkdirSync, renameFile };
