const fs = require('fs');
let content = fs.readFileSync('client/src/components/FileTransfer.tsx', 'utf-8');

const isDarkStr = "${isDark ? 'bg-[#2a2a2b] border-[#3e3e42] text-[#e0e0e0]' : 'bg-white border-gray-200 text-gray-700'}";

const localActionsClean = `                {localActionsOpen && (
                  <div className={\`absolute top-full right-0 mt-2 w-56 rounded-xl shadow-xl border py-1.5 z-50 text-[14px] text-left \${isDark ? 'bg-[#2a2a2b] border-[#3e3e42] text-[#e0e0e0]' : 'bg-white border-gray-200 text-gray-700'}\`}>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { transferToAgent(); setLocalActionsOpen(false); }}>Copy to target directory</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Rename</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Delete</div>
                    <div className={\`h-px my-1 \${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}\`}></div>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { refreshLocalDirectory(); setLocalActionsOpen(false); }}>Refresh</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>New Folder</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Show Hidden Files</div>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => {
                        if (local.files) setLocal(p => ({...p, selected: new Set(p.files.map(f => f.path))}));
                        setLocalActionsOpen(false);
                    }}>Select All</div>
                    <div className={\`h-px my-1 \${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}\`}></div>
                    <div className={\`px-4 py-1.5 cursor-pointer text-red-500 \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => setLocalActionsOpen(false)}>Close</div>
                  </div>
                )}
              </div>
            </div>
          </div>`;

// Delete broken chunk by regex or exact boundaries
const localStart = content.indexOf('{localActionsOpen && (');
const nextBreadcrumbs = content.indexOf('{/* Breadcrumbs Topbar */}');
content = content.substring(0, localStart) + localActionsClean + '\n\n          ' + content.substring(nextBreadcrumbs);

const remoteActionsClean = `                {remoteActionsOpen && (
                  <div className={\`absolute top-full right-0 mt-2 w-56 rounded-xl shadow-xl border py-1.5 z-50 text-[14px] text-left \${isDark ? 'bg-[#2a2a2b] border-[#3e3e42] text-[#e0e0e0]' : 'bg-white border-gray-200 text-gray-700'}\`}>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { transferFromAgent(); setRemoteActionsOpen(false); }}>Copy to target directory</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Rename</div>
                    <div className={\`px-4 py-1.5 cursor-pointer text-red-500 \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { deleteRemoteFiles(); setRemoteActionsOpen(false); }}>Delete</div>
                    <div className={\`h-px my-1 \${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}\`}></div>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => { navigateRemote(remote.path); setRemoteActionsOpen(false); }}>Refresh</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>New Folder</div>
                    <div className={\`px-4 py-1.5 cursor-pointer opacity-50\`}>Show Hidden Files</div>
                    <div className={\`px-4 py-1.5 cursor-pointer \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => {
                        if (remote.files) setRemote(p => ({...p, selected: new Set(p.files.map(f => f.path))}));
                        setRemoteActionsOpen(false);
                    }}>Select All</div>
                    <div className={\`h-px my-1 \${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}\`}></div>
                    <div className={\`px-4 py-1.5 cursor-pointer text-red-500 \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`} onMouseDown={() => setRemoteActionsOpen(false)}>Close</div>
                  </div>
                )}
              </div>
            </div>
          </div>`;

const remoteStart = content.indexOf('{remoteActionsOpen && (');
const nextBreadcrumbsRemote = content.indexOf('{/* Breadcrumbs Topbar */}', remoteStart);
content = content.substring(0, remoteStart) + remoteActionsClean + '\n\n          ' + content.substring(nextBreadcrumbsRemote);


fs.writeFileSync('client/src/components/FileTransfer.tsx', content);
console.log('done!');