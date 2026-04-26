const fs = require('fs');
const path = require('path');

const tsxPath = path.join(__dirname, 'client', 'src', 'components', 'FileTransfer.tsx');
let c = fs.readFileSync(tsxPath, 'utf-8');

// 1. Add Delete Remote Function
const deleteRemoteFn = `  /* ── delete remote files ── */
  const deleteRemoteFiles = () => {
    if (!remote.agentId || remote.selected.size === 0) return;
    const socket = getSocket();
    if (!socket) return;
    if (window.confirm(\`Удалить \${remote.selected.size} файлов/папок с удалённого ПК?\`)) {
      remote.selected.forEach(filePath => {
        socket.emit('file:delete', { agentId: remote.agentId, filePath });
      });
      setTimeout(() => {
        navigateRemote(remote.path);
      }, 500);
    }
  };

  /* ── transfer: local → agent ── */`;

if (!c.includes('deleteRemoteFiles')) {
    c = c.replace('  /* ── transfer: local → agent ── */', deleteRemoteFn);
}

// 2. Fix Local Actions onMouseDown
let localActions = `{localActionsOpen && (
                  <div className={\`absolute top-full right-0 mt-2 w-56 rounded-xl shadow-xl border py-1.5 z-50 text-[14px] text-left \${isDark ? 'bg-[#2a2a2b] border-[#3e3e42] text-[#e0e0e0]' : 'bg-white border-gray-200 text-gray-700'}\`}>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { transferToAgent(); setLocalActionsOpen(false); }}>Copy to target directory</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Rename</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Delete</div>
                    <div className={\`h-px my-1 \${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}\`}></div>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { refreshLocalDirectory(); setLocalActionsOpen(false); }}>Refresh</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>New Folder</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Show Hidden Files</div>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => {
                        if (local.files) setLocal(p => ({...p, selected: new Set(p.files.map(f => f.path))}))
                        setLocalActionsOpen(false);
                    }}>Select All</div>
                    <div className={\`h-px my-1 \${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}\`}></div>
                    <div className={\`px-4 py-1.5 cursor-pointer text-red-500 \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => setLocalActionsOpen(false)}>Close</div>
                  </div>
                )}`;

// We replace the old localActions block which used onClick
const oldLocalActionsRegex = /\{localActionsOpen && \([\s\S]*?<\/div>[\s\S]*?\)\}/;
c = c.replace(oldLocalActionsRegex, localActions);

// 3. Fix Remote Actions onMouseDown
let remoteActions = `{remoteActionsOpen && (
                  <div className={\`absolute top-full right-0 mt-2 w-56 rounded-xl shadow-xl border py-1.5 z-50 text-[14px] text-left \${isDark ? 'bg-[#2a2a2b] border-[#3e3e42] text-[#e0e0e0]' : 'bg-white border-gray-200 text-gray-700'}\`}>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { transferFromAgent(); setRemoteActionsOpen(false); }}>Copy to target directory</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Rename</div>
                    <div className={\`px-4 py-1.5 cursor-pointer text-red-500 \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { deleteRemoteFiles(); setRemoteActionsOpen(false); }}>Delete</div>
                    <div className={\`h-px my-1 \${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}\`}></div>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { navigateRemote(remote.path); setRemoteActionsOpen(false); }}>Refresh</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>New Folder</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Show Hidden Files</div>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => {
                        if (remote.files) setRemote(p => ({...p, selected: new Set(p.files.map(f => f.path))}))
                        setRemoteActionsOpen(false);
                    }}>Select All</div>
                    <div className={\`h-px my-1 \${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}\`}></div>
                    <div className={\`px-4 py-1.5 cursor-pointer text-red-500 \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => setRemoteActionsOpen(false)}>Close</div>
                  </div>
                )}`;

const oldRemoteActionsRegex = /\{remoteActionsOpen && \([\s\S]*?<\/div>[\s\S]*?\)\}/;
c = c.replace(oldRemoteActionsRegex, remoteActions);


fs.writeFileSync(tsxPath, c, 'utf-8');
console.log('Fixed onMouseDown bug for dropdowns + Delete feature!');
