const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'client', 'src', 'components', 'HomeDashboard.tsx');
let c = fs.readFileSync(p, 'utf-8');

const regex = /\{\/\* Install New Agent Action \*\/\}([\s\S]*?)<div className=\{`\$\{isDark \? 'bg-\[#121212\] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'\}/m;

const replacement = `{/* Install New Agent Action */}
        <div className={\`\${isDark ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-900/10 border-emerald-500/20' : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200'} border rounded-2xl sm:rounded-3xl p-5 sm:p-8 relative overflow-hidden flex flex-col justify-center min-h-[200px] sm:min-h-[250px] group cursor-pointer\`} 
          onClick={() => {
            const link = document.createElement('a');
            link.href = '/AgentSetup.exe';
            link.download = 'AgentSetup.exe';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}>
           <div className="absolute top-0 right-0 p-8 opacity-10">
             <Download className="w-24 sm:w-32 h-24 sm:h-32 text-emerald-500" />
           </div>
           <h3 className={\`text-xl sm:text-2xl font-bold \${isDark ? 'text-white' : 'text-gray-900'} mb-2\`}>Скачать Агент</h3>
           <p className={\`\${isDark ? 'text-emerald-200/60' : 'text-emerald-700/60'} max-w-sm mb-4 sm:mb-6 text-sm sm:text-base\`}>Нажмите, чтобы скачать установочный файл (AgentSetup.exe). Просто запустите его на целевом ПК.</p>
           <div className={\`mt-auto flex items-center gap-2 \${isDark ? 'text-emerald-400 group-hover:text-emerald-300' : 'text-emerald-600 group-hover:text-emerald-700'} font-medium transition-colors\`}>
             Скачать AgentSetup.exe <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
           </div>
        </div>

        {/* Recent Events (Make it span to align properly if needed, or leave it normal) */}
        <div className={\`\${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`;

c = c.replace(regex, replacement);
fs.writeFileSync(p, c, 'utf-8');
