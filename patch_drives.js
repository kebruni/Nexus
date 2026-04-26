const fs = require('fs');

const replacementObj = `{breadcrumbs.map((c, i) => (
              <div key={c.path} className="flex items-center flex-shrink-0">
                {i > 0 && <ChevronRight className={\`w-3 h-3 \${isDark ? 'text-zinc-700' : 'text-gray-300'} mx-0.5\`} />}
                {i === 0 && panel.drives && panel.drives.length > 0 && !isLocalBrowser ? (
                  <div className={\`flex items-center rounded transition-colors px-1 py-0.5 \${i === breadcrumbs.length - 1 ? (isDark ? 'bg-zinc-800/40 text-white' : 'bg-gray-200/40 text-gray-900') : (isDark ? 'text-zinc-500 hover:bg-zinc-800/40' : 'text-gray-500 hover:bg-gray-200/40')}\`}>
                    <HardDrive className="w-3 h-3 text-sky-400 mr-1" />
                    <select
                      className="text-[12px] font-medium appearance-none bg-transparent outline-none border-none cursor-pointer pr-1"
                      value={c.label.replace('\\\\', '')}
                      onChange={(e) => handleNavigate(e.target.value + (e.target.value === '/' ? '' : '\\\\'))}
                    >
                      {panel.drives.map(d => <option key={d} value={d} className={isDark ? 'bg-zinc-800 text-white' : 'bg-white text-gray-900'}>{d}</option>)}
                    </select>
                  </div>
                ) : (
                  <button
                    onClick={() => handleNavigate(c.path)}
                    className={\`px-1.5 py-0.5 rounded text-[12px] transition-colors \${
                      i === breadcrumbs.length - 1 ? (isDark ? 'text-white font-medium bg-zinc-800/40' : 'text-gray-900 font-medium bg-gray-200/40') : (isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700')
                    }\`}
                  >
                    {i === 0 && <HardDrive className="w-3 h-3 text-sky-400 inline mr-1 -mt-0.5" />}
                    {c.label}
                  </button>
                )}
              </div>
            ))}`;

let content = fs.readFileSync('d:/Diplom Porject/client/src/components/FileTransfer.tsx', 'utf8');
const rx = /\{breadcrumbs\.map\(\(c, i\) => \([\s\S]*?\}\)\n              <\/div>\n            \)\)\}/;
content = content.replace(rx, replacementObj);
fs.writeFileSync('d:/Diplom Porject/client/src/components/FileTransfer.tsx', content);
console.log('Done replacement');
