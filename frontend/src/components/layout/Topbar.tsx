import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../context/AuthContext';
import { User, Sun, Moon, Menu } from 'lucide-react';

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
    const { userEmail } = useAuth();
    const { theme, toggleTheme } = useTheme();

    // Extract name for welcome message (e.g. "john" from "john@example.com")
    const name = userEmail ? userEmail.split('@')[0] : 'User';

    return (
        <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-10 w-full transition-colors dark:bg-slate-900/80 dark:border-slate-800 bg-white/80 border-slate-200">
            <div className="flex items-center gap-4">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                    <Menu className="w-6 h-6" />
                </button>
                <h2 className="text-slate-800 dark:text-white font-medium">Welcome back, <span className="text-blue-600 dark:text-blue-400 capitalize">{name}</span></h2>
            </div>

            <div className="flex items-center gap-4">
                <button
                    onClick={toggleTheme}
                    aria-label="Toggle theme"
                    className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                    {theme === "dark" ? (
                        <Sun className="w-5 h-5 text-yellow-400" />
                    ) : (
                        <Moon className="w-5 h-5 text-slate-700" />
                    )}
                </button>

                <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                        <User className="w-4 h-4" />
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-300 pr-2">{userEmail}</span>
                </div>
            </div>
        </header>
    );
}
