const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'client', 'src', 'components', 'HomeDashboard.tsx');
let c = fs.readFileSync(p, 'utf-8');

const newStr = `      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

        {/* Quick Action / Jump to Devices */}
        <div className={\`\${isDark ? 'bg-gradient-to-br from-blue-600/20 to-blue-900/10 border-blue-500/20' : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'} border rounded-2xl sm:rounded-3xl p-5 sm:p-8 relative overflow-hidden flex flex-col justify-center min-h-[200px] sm:min-h-[250px] group cursor-pointer\`} onClick={() => navigate('/dashboard/devices')}>
           <div className="absolute top-0 right-0 p-8 opacity-10">
             <Laptop className="w-24 sm:w-32 h-24 sm:h-32" />
           </div>
           <h3 className={\`text-xl sm:text-2xl font-bold \${isDark ? 'text-white' : 'text-gray-900'} mb-2\`}>{t('home.manageDevices')}</h3>
           <p className={\`\${isDark ? 'text-blue-200/60' : 'text-blue-700/60'} max-w-sm mb-4 sm:mb-6 text-sm sm:text-base\`}>{t('home.manageDesc')}</p>
           <div className={\`mt-auto flex items-center gap-2 \${isDark ? 'text-blue-400 group-hover:text-blue-300' : 'text-blue-600 group-hover:text-blue-700'} font-medium transition-colors\`}>
             {t('home.goToDevices')} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
           </div>
        </div>

        {/* Install New Agent Action */}
        <div className={\`\${isDark ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-900/10 border-emerald-500/20' : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200'} border rounded-2xl sm:rounded-3xl p-5 sm:p-8 relative overflow-hidden flex flex-col justify-center min-h-[200px] sm:min-h-[250px] group cursor-pointer\`} onClick={() => {
            const tempInput = document.createElement("input");
            tempInput.value = "iex ((New-Object System.Net.WebClient).DownloadString('http://system.kebruni.me/install.ps1'))";
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand("copy");
            document.body.removeChild(tempInput);
            alert("Команда скопирована! Вставьте ее в PowerShell (от имени Администратора) на целевом ПК.");
        }}>
           <div className="absolute top-0 right-0 p-8 opacity-10">
             <Download className="w-24 sm:w-32 h-24 sm:h-32 text-emerald-500" />
           </div>
           <h3 className={\`text-xl sm:text-2xl font-bold \${isDark ? 'text-white' : 'text-gray-900'} mb-2\`}>Установить Агент</h3>
           <p className={\`\${isDark ? 'text-emerald-200/60' : 'text-emerald-700/60'} max-w-sm mb-4 sm:mb-6 text-sm sm:text-base\`}>Нажмите, чтобы скопировать команду для PowerShell. Она автоматически скачает и установит агента.</p>
           <div className={\`mt-auto flex items-center gap-2 \${isDark ? 'text-emerald-400 group-hover:text-emerald-300' : 'text-emerald-600 group-hover:text-emerald-700'} font-medium transition-colors\`}>
             Скопировать команду <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
           </div>
        </div>

        {/* Recent Events (Make it span to align properly if needed, or leave it normal) */}
        <div className={\`\${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-gray-200 shadow-sm'} border rounded-2xl sm:rounded-3xl p-4 sm:p-6\`}>`;

c = c.replace(/\{\/\* Main Content Area \*\/\}[\s\S]*?\{t\('home\.recentActivity'\)\}<\/h3>/m, newStr + `\n            <div className="flex items-center justify-between mb-4 sm:mb-6">\n              <h3 className={\`font-semibold \${isDark ? 'text-white' : 'text-gray-900'}\`}>{t('home.recentActivity')}</h3>`);

fs.writeFileSync(p, c, 'utf-8');
