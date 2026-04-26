const fs = require('fs');
const path = require('path');

const tsxPath = path.join(__dirname, 'client', 'src', 'components', 'FileTransfer.tsx');
let c = fs.readFileSync(tsxPath, 'utf-8');

// Add the remoteDriveOpen state if it doesn't exist
if (!c.includes('remoteDriveOpen')) {
    c = c.replace(
        'const [remoteActionsOpen, setRemoteActionsOpen] = useState(false);',
        'const [remoteActionsOpen, setRemoteActionsOpen] = useState(false);\n  const [remoteDriveOpen, setRemoteDriveOpen] = useState(false);'
    );
}

// Ensure the ChevronDown icon is correctly handled
const searchString = `{/* Disks logic formatted EXACTLY like the screenshot */}
                 <div className={\`flex items-center gap-1.5 pr-1 px-2 py-1 rounded hover:bg-gray-200 \${isDark ? 'hover:bg-[#333]' : 'hover:bg-gray-200'} transition-colors\`}>
                    <HardDrive className="w-4 h-4 text-[#e83e8c]" />
                    {remote.drives && remote.drives.length > 0 ? (
                        <select 
                          className={\`bg-transparent border-none appearance-none font-semibold focus:outline-none cursor-pointer p-0 m-0 \${isDark ? 'text-gray-300' : 'text-gray-800'}\`}
                          value={remote.drives.find(d => remote.path.startsWith(d)) || remote.drives[0]}
                          onChange={(e) => navigateRemote(e.target.value + '\\\\\\\\')}
                          title="Выбрать диск устройства"
                        >
                          {remote.drives.map(d => (
                             <option key={d} value={d} className="text-black">{d}</option>
                          ))}
                        </select>
                    ) : (
                        <span className={\`font-semibold \${isDark ? 'text-gray-300' : 'text-gray-800'}\`}>C:</span>
                    )}
                 </div>`;

const customDropdown = `{/* Custom React Dropdown for Disks to prevent native select issues */}
                 <div className="relative z-50">
                    <button 
                      onClick={() => setRemoteDriveOpen(!remoteDriveOpen)}
                      onBlur={() => setTimeout(() => setRemoteDriveOpen(false), 200)}
                      className={\`flex items-center gap-1.5 px-2 py-1 rounded transition-colors font-semibold outline-none \${isDark ? 'hover:bg-[#333] focus:bg-[#333] text-gray-300' : 'hover:bg-gray-200 focus:bg-gray-200 text-gray-800'}\`}
                      title="Выбрать диск устройства"
                    >
                      <HardDrive className="w-4 h-4 text-[#e83e8c] flex-shrink-0" />
                      <span className="mt-[1px]">{remote.drives && remote.drives.length > 0 ? (remote.drives.find(d => remote.path.startsWith(d)) || remote.drives[0]) : "C:"}</span>
                    </button>
                    
                    {remoteDriveOpen && remote.drives && remote.drives.length > 0 && (
                      <div className={\`absolute top-full left-0 mt-1 w-32 rounded-xl shadow-xl border py-1.5 z-50 text-[14px] text-left \${isDark ? 'bg-[#2a2a2b] border-[#3e3e42] text-[#e0e0e0]' : 'bg-white border-gray-200 text-gray-700'}\`}>
                        {remote.drives.map(d => (
                          <div 
                            key={d}
                            onClick={() => { setRemoteDriveOpen(false); navigateRemote(d + '\\\\\\\\'); }}
                            className={\`px-4 py-2 cursor-pointer flex items-center gap-3 \${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}\`}
                          >
                            <HardDrive className={\`w-4 h-4 \${d === (remote.drives.find(x => remote.path.startsWith(x)) || remote.drives[0]) ? 'text-[#e83e8c]' : 'text-gray-400'}\`} />
                            <span className="font-medium">{d}</span>
                          </div>
                        ))}
                      </div>
                    )}
                 </div>`;

c = c.replace(searchString, customDropdown);

fs.writeFileSync(tsxPath, c, 'utf-8');
console.log('Success styling Custom Dropdown.');