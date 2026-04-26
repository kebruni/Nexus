import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function NotFound() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { t } = useLanguage();

  return (
    <div className="h-full flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className={`text-[120px] sm:text-[160px] font-black leading-none tracking-tighter ${isDark ? 'text-zinc-800' : 'text-gray-200'} select-none`}>
          404
        </h1>
        <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} -mt-4 mb-2`}>
          {t('notFound.title')}
        </h2>
        <p className={`${isDark ? 'text-zinc-500' : 'text-gray-500'} mb-8`}>
          {t('notFound.desc')}
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
        >
          {t('notFound.back')}
        </button>
      </div>
    </div>
  );
}
