const fs = require('fs');
const path = require('path');

const bakPath = path.join(__dirname, 'client', 'src', 'components', 'FileTransfer.bak.jsx.utf8');
const tsxPath = path.join(__dirname, 'client', 'src', 'components', 'FileTransfer.tsx');
let content = fs.readFileSync(bakPath, 'utf-8');

const lines = content.split('\n');
const returnIdx = lines.findIndex(l => l.startsWith('  return ('));

if (returnIdx === -1) {
    console.error('Cannot find return (');
    process.exit(1);
}

const topPart = lines.slice(0, returnIdx).join('\n') + '\n';

const termiusJSX = `  return (
    <div className={\`h-full flex flex-col \${isDark ? 'bg-[#1e1e1e] text-[#d4d4d4]' : 'bg-[#f5f6f7] text-[#1c1c1c]'} overflow-hidden\`}>
      {/* Top action/info bar if needed (Optional, termius doesn't have a huge title) */}
      <div className="px-6 py-4 flex items-center justify-between shadow-sm z-10 bg-inherit hidden">
        <h2 className="text-xl font-semibold flex items-center gap-2">SFTP</h2>
      </div>

      <div className="flex-1 flex max-h-screen min-h-0">
        
        {/* === LEFT PANEL (LOCAL) === */}
        <div className={\`flex-1 flex flex-col border-r \${isDark ? 'border-[#333]' : 'border-[#e0e0e0]'} min-h-0 bg-inherit\`}>
          
          {/* Header */}
          <div className={\`h-14 flex items-center justify-between px-4 border-b \${isDark ? 'border-[#333]' : 'border-[#f0f0f0]'}\`}>
            <div className="flex items-center gap-2 font-medium">
              <div className="w-6 h-6 rounded bg-sky-500 text-white flex items-center justify-center">
                <Monitor className="w-4 h-4" />
              </div>
              <span className="text-[15px]">Local</span>
            </div>
            <div className="flex items-center gap-4 text-sm font-medium text-gray-500">
              <button className="flex items-center gap-1 hover:text-gray-900"><Search className="w-4 h-4" /> Filter</button>
              <button className="flex items-center gap-1 hover:text-gray-900">Actions <ChevronDown className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Breadcrumbs Topbar */}
          <div className="h-12 flex items-center px-2 text-[14px] text-gray-600 gap-1 font-medium">
            <button className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30" onClick={navigateLocalUp} disabled={!local.handleStack || local.handleStack.length <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700">
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Select root / drives */}
            <div className="ml-2 flex items-center gap-1">
               <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.2} />
               <button onClick={handleChangeRoot} className="hover:underline font-semibold text-gray-800">C:</button>
               <ChevronRight className="w-3 h-3 text-gray-400 mx-1" />
               <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.2} />
               <span className="text-gray-800 font-semibold">{local.path || '/'}</span>
            </div>
          </div>

          {/* Table Headers */}
          <div className={\`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-2 text-xs font-semibold \${isDark ? 'text-gray-400 bg-[#252526]' : 'text-gray-500 bg-[#fafafa] border-y border-[#f0f0f0]'}\`}>
            <div>Name</div>
            <div className="flex items-center gap-1">Date Modified <ChevronDown className="w-3 h-3" /></div>
            <div>Size</div>
            <div>Kind</div>
          </div>

          {/* Local List */}
          <div className="flex-1 overflow-y-auto select-none pb-20">
            {local.loading && (
              <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mb-2" /> Загрузка...
              </div>
            )}
            {!local.loading && local.error && (
               <div className="p-6 text-sm text-red-500 text-center">{local.error}</div>
            )}
            
            {/* Parent Directory Item */}
            {!local.loading && !local.error && local.handleStack && local.handleStack.length > 1 && (
               <div 
                  onDoubleClick={navigateLocalUp}
                  className={\`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] hover:bg-sky-50 cursor-pointer text-gray-800\`}
                >
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.2} />
                    <span>..</span>
                  </div>
                  <div className="text-gray-400">-</div>
                  <div className="text-gray-400">- -</div>
                  <div className="text-gray-400 text-xs">folder</div>
                </div>
            )}

            {!local.loading && !local.error && local.files.map(f => {
              const isSelected = local.selected.has(f.path);
              return (
                <div 
                  key={f.path}
                  onClick={(e) => {
                    const next = new Set(local.selected);
                    if (e.ctrlKey || e.metaKey) {
                      if (next.has(f.path)) next.delete(f.path); else next.add(f.path);
                    } else {
                      next.clear(); next.add(f.path);
                    }
                    setLocal(p => ({ ...p, selected: next }));
                  }}
                  onDoubleClick={() => {
                    if (f.isDirectory) navigateLocalDirectory(f.name);
                  }}
                  className={\`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] cursor-pointer transition-colors \${
                    isSelected 
                      ? 'bg-[#5bb0f9] text-white' 
                      : isDark ? 'hover:bg-[#2c2d2e] text-gray-300' : 'hover:bg-[#f0f7ff] text-gray-700'
                  }\`}
                >
                  <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis pr-2">
                    {getFileIcon(f.name, f.isDirectory, !!f.error)}
                    <span className={\`truncate \${isSelected ? 'font-medium text-white' : 'font-medium'}\`}>{f.name}</span>
                  </div>
                  <div className={\`\${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs\`}>
                    {f.modified ? new Date(f.modified).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                  </div>
                  <div className={\`\${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs\`}>
                    {f.isDirectory ? '- -' : formatBytes(f.size || 0)}
                  </div>
                  <div className={\`\${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs opacity-80\`}>
                    {getFileKind(f.name, f.isDirectory)}
                  </div>
                </div>
              );
            })}
            
            {/* Initial Placeholder */}
            {!local.loading && !local.handleStack?.length && !local.error && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-400">
                <HardDrive className="w-12 h-12 mb-4 opacity-50 text-sky-400" />
                <p className="text-sm font-medium mb-4">Нажмите кнопку ниже, чтобы запросить доступ к локальным файлам в браузере.</p>
                <button onClick={handleSelectRoot} className="px-6 py-2 bg-[#5bb0f9] hover:bg-sky-500 text-white rounded font-medium shadow-sm transition">
                  Выбрать директорию
                </button>
              </div>
            )}
          </div>
        </div>


        {/* === RIGHT PANEL (REMOTE) === */}
        <div className={\`flex-1 flex flex-col min-h-0 bg-inherit \${isDark ? 'border-l border-[#333]' : 'border-[#e0e0e0]'}\`}>
          
          {/* Header */}
          <div className={\`h-14 flex items-center justify-between px-4 border-b \${isDark ? 'border-[#333]' : 'border-[#f0f0f0]'}\`}>
            <div className="flex items-center gap-2 font-medium">
              <div className="w-6 h-6 rounded bg-[#e83e8c] text-white flex items-center justify-center">
                <Server className="w-4 h-4 flex-shrink-0" />
              </div>
              
              {/* Agent selector Dropdown */}
               <div className="relative z-50">
                <button 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1 text-[15px] hover:text-gray-600"
                >
                  {onlineAgents.find(a => a.id === remote.agentId)?.hostname || 'Выберите устройство...'}
                  <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                </button>
                {dropdownOpen && (
                  <div className={\`absolute top-full left-0 mt-1 w-64 rounded shadow-lg border \${isDark ? 'bg-[#252526] border-[#333]' : 'bg-white border-gray-200'}\`}>
                    {onlineAgents.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 text-center">Нет онлайн ПК</div>
                    ) : (
                      onlineAgents.map(a => (
                        <div 
                          key={a.id}
                          onClick={() => selectAgent(a)}
                          className={\`px-4 py-2 text-sm cursor-pointer \${isDark ? 'hover:bg-[#333]' : 'hover:bg-gray-100'}\`}
                        >
                          {a.hostname} <span className="text-xs text-gray-400">({a.ip})</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm font-medium text-gray-500">
              <button className="flex items-center gap-1 hover:text-gray-900"><Search className="w-4 h-4" /> Filter</button>
              <button className="flex items-center gap-1 hover:text-gray-900">Actions <ChevronDown className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Breadcrumbs Topbar */}
          <div className="h-12 flex items-center px-2 text-[14px] text-gray-600 gap-1 font-medium bg-inherit">
            <button 
              className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30" 
              onClick={() => {
                if (remote.parentPath || remote.parentPath === '') {
                   navigateRemote(remote.parentPath);
                }
              }} 
              disabled={!remote.agentId || !remote.path}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled>
              <ChevronRight className="w-4 h-4" />
            </button>
            
            {remote.agentId && (
              <div className="ml-2 flex flex-wrap items-center text-sm gap-1">
                 {/* Disks logic */}
                 <div className="flex items-center gap-1 pr-1">
                    <HardDrive className="w-4 h-4 text-[#e83e8c] opacity-80" />
                    {remote.drives && remote.drives.length > 0 ? (
                        <select 
                          className={\`bg-transparent border-none appearance-none font-semibold text-gray-800 focus:outline-none cursor-pointer p-0 m-0\`}
                          value={remote.drives.find(d => remote.path.startsWith(d)) || remote.drives[0]}
                          onChange={(e) => navigateRemote(e.target.value + '\\\\')}
                          title="Выбрать диск устройства"
                        >
                          {remote.drives.map(d => (
                             <option key={d} value={d} className="text-black">{d}</option>
                          ))}
                        </select>
                    ) : (
                        <span className="font-semibold text-gray-800">C:</span>
                    )}
                 </div>
                 
                 <ChevronRight className="w-3 h-3 text-gray-400 mx-0.5" />
                 
                 {remote.path.split(/[\\\\/]/).filter(Boolean).map((part, i, arr) => {
                    const isDrive = /^[a-zA-Z]:$/.test(part);
                    if (isDrive) return null; // Already rendered in disk select
                    
                    const onClickPath = arr.slice(0, i + 1).join('\\\\');
                    return (
                        <React.Fragment key={i}>
                           {i > 0 && !isDrive && <ChevronRight className="w-3 h-3 text-gray-400 mx-0.5" />}
                           <div 
                             className="flex items-center gap-1 cursor-pointer hover:underline"
                             onClick={() => navigateRemote(onClickPath)}
                           >
                             <Folder className="w-3.5 h-3.5 text-sky-400" fill="currentColor" fillOpacity={0.2} />
                             <span className="text-gray-800 font-semibold max-w-[120px] truncate">{part}</span>
                           </div>
                        </React.Fragment>
                    )
                 })}
              </div>
            )}
          </div>

          {/* Table Headers */}
          <div className={\`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-2 text-xs font-semibold \${isDark ? 'text-gray-400 bg-[#252526]' : 'text-gray-500 bg-[#fafafa] border-y border-[#f0f0f0]'}\`}>
            <div>Name</div>
            <div className="flex items-center gap-1">Date Modified <ChevronDown className="w-3 h-3" /></div>
            <div>Size</div>
            <div>Kind</div>
          </div>

          {/* Remote List or Empty State */}
          <div className="flex-1 overflow-y-auto select-none pb-20 relative bg-inherit">
            {!remote.agentId ? (
              <div className="flex flex-col items-center justify-center h-[80%] text-center">
                 {/* Termius stylish empty state */}
                 <div className="relative w-80 h-80 flex items-center justify-center">
                    {/* Corners */}
                    <svg className="absolute inset-0 w-full h-full text-gray-300 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M 0 10 L 0 0 L 10 0" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M 90 0 L 100 0 L 100 10" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M 100 90 L 100 100 L 90 100" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M 10 100 L 0 100 L 0 90" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    
                    <div className="flex flex-col items-center">
                        <ArrowDownCircle className="w-16 h-16 text-gray-500 mb-4 stroke-1" />
                        <h3 className="text-xl font-bold text-gray-800">Drop files here</h3>
                    </div>
                 </div>
              </div>
            ) : remote.loading ? (
              <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                Чтение ПК...
              </div>
            ) : remote.error ? (
              <div className="p-6 text-sm text-red-500 text-center">{remote.error}</div>
            ) : (
               <>
                 {remote.parentPath !== '' && (
                    <div 
                      onDoubleClick={() => navigateRemote(remote.parentPath)}
                      className={\`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] hover:bg-sky-50 cursor-pointer text-gray-800\`}
                    >
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.2} />
                        <span>..</span>
                      </div>
                      <div className="text-gray-400">-</div>
                      <div className="text-gray-400">- -</div>
                      <div className="text-gray-400 text-xs">folder</div>
                    </div>
                 )}

                 {remote.files.map(f => {
                    const isSelected = remote.selected.has(f.path);
                    return (
                      <div 
                        key={f.path}
                        onClick={(e) => {
                          const next = new Set(remote.selected);
                          if (e.ctrlKey || e.metaKey) {
                            if (next.has(f.path)) next.delete(f.path); else next.add(f.path);
                          } else {
                            next.clear(); next.add(f.path);
                          }
                          setRemote(p => ({ ...p, selected: next }));
                        }}
                        onDoubleClick={() => {
                          if (f.isDirectory) navigateRemote(f.path);
                        }}
                        className={\`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] cursor-pointer transition-colors \${
                          isSelected 
                            ? 'bg-[#5bb0f9] text-white' 
                            : isDark ? 'hover:bg-[#2c2d2e] text-gray-300' : 'hover:bg-[#f0f7ff] text-gray-700'
                        }\`}
                      >
                        <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis pr-2">
                          {getFileIcon(f.name, f.isDirectory, !!f.error)}
                          <span className={\`truncate \${isSelected ? 'font-medium text-white' : 'font-medium'}\`}>{f.name}</span>
                        </div>
                        <div className={\`\${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs\`}>
                          {f.modified ? new Date(f.modified).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </div>
                        <div className={\`\${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs\`}>
                          {f.isDirectory ? '- -' : formatBytes(f.size || 0)}
                        </div>
                        <div className={\`\${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs opacity-80\`}>
                          {getFileKind(f.name, f.isDirectory)}
                        </div>
                      </div>
                    );
                 })}
               </>
            )}
          </div>
        </div>

      </div>

      {/* Floating Transfer Actions */}
      {(local.selected.size > 0 || remote.selected.size > 0) && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1a1a1a] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 z-50">
           {local.selected.size > 0 && (
             <div className="flex items-center gap-3">
               <span className="text-sm font-medium">{local.selected.size} файлов выбрано</span>
               <button 
                 onClick={transferToAgent}
                 disabled={!remote.agentId || !remote.path}
                 className="flex items-center gap-1.5 bg-[#4caf50] hover:bg-[#43a047] disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
               >
                 Загрузить на ПК <ArrowRight className="w-4 h-4" />
               </button>
             </div>
           )}

           {local.selected.size > 0 && remote.selected.size > 0 && (
             <div className="w-px h-6 bg-gray-600"></div>
           )}

           {remote.selected.size > 0 && (
             <div className="flex items-center gap-3">
               <button 
                 onClick={transferFromAgent}
                 disabled={!local.path || local.loading}
                 className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
               >
                 <ArrowLeft className="w-4 h-4" /> Скачать в браузер
               </button>
               <span className="text-sm font-medium">{remote.selected.size} файлов выбрано</span>
             </div>
           )}
        </div>
      )}

      {/* Transfer Progress Overlays */}
      {transfers.length > 0 && (
        <div className="fixed bottom-0 right-8 w-80 max-h-[400px] overflow-auto bg-white border border-gray-200 shadow-2xl rounded-t-xl z-50 flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between sticky top-0 bg-white">
            <h4 className="font-semibold text-sm">Передачи ({transfers.filter(t => t.status !== 'done' && t.status !== 'error').length})</h4>
            <button className="text-gray-400 hover:text-gray-800" onClick={() => setTransfers([])}><X className="w-4 h-4" /></button>
          </div>
          <div className="p-3 space-y-2">
            {transfers.map(job => (
              <div key={job.id} className="text-xs flex items-center gap-3">
                {job.status === 'done' ? <Check className="w-4 h-4 text-green-500 flex-shrink-0" /> :
                 job.status === 'error' ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /> :
                 <Loader2 className="w-4 h-4 text-sky-500 animate-spin flex-shrink-0" />}
                
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-gray-800">{job.fileName}</div>
                  <div className="text-gray-400 capitalize">{job.status} {job.size ? \`(\${formatBytes(job.size)})\` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
`;

const ensureImport = (content) => {
    if (!content.includes('ArrowDownCircle')) {
        content = content.replace("FolderOpen,", "FolderOpen, ArrowDownCircle,");
    }
    return content;
};

const finalFile = ensureImport(topPart) + termiusJSX;
fs.writeFileSync(tsxPath, finalFile, 'utf-8');
console.log('Fixed file replacing exactly main return!');
