import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LogOut, SlidersHorizontal, CalendarClock, MessageSquare, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useState } from 'react';
import TelegramLinkModal from './TelegramLinkModal';

export default function Sidebar({ isOpen, setIsSidebarOpen }: { isOpen: boolean; setIsSidebarOpen: (open: boolean) => void }) {
    const { logout } = useAuth();
    const { unreadCount } = useNotifications();
    const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);

    return (
        <>
            <aside className={`
                fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 
                border-r border-slate-200 dark:border-slate-800 
                transform transition-transform duration-300 ease-in-out
                ${isOpen ? "translate-x-0" : "-translate-x-full"}
                lg:translate-x-0 lg:static lg:w-64 lg:flex-shrink-0
                flex flex-col
            `}>
                <div className="p-6">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-400 dark:to-blue-600 bg-clip-text text-transparent">
                        AI-MOM
                    </h1>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-2">
                    <NavLink
                        to="/dashboard"
                        onClick={() => setIsSidebarOpen(false)}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${isActive
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/20'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`
                        }
                    >
                        <LayoutDashboard className="w-5 h-5" />
                        <span className="font-medium">Dashboard</span>
                    </NavLink>

                    <NavLink
                        to="/priority"
                        onClick={() => setIsSidebarOpen(false)}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${isActive
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/20'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`
                        }
                    >
                        <SlidersHorizontal className="w-5 h-5" />
                        <span className="font-medium">Priority Order</span>
                    </NavLink>

                    <NavLink
                        to="/daily"
                        onClick={() => setIsSidebarOpen(false)}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${isActive
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/20'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`
                        }
                    >
                        <CalendarClock className="w-5 h-5" />
                        <span className="font-medium">Daily Tasks</span>
                    </NavLink>

                    <NavLink
                        to="/notifications"
                        onClick={() => setIsSidebarOpen(false)}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative focus:outline-none focus:ring-2 focus:ring-blue-500 ${isActive
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/20'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`
                        }
                    >
                        <div className="relative">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                </span>
                            )}
                        </div>
                        <span className="font-medium">Notifications</span>
                        {unreadCount > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                {unreadCount}
                            </span>
                        )}
                    </NavLink>

                    <NavLink
                        to="/settings"
                        onClick={() => setIsSidebarOpen(false)}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${isActive
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-900/20'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`
                        }
                    >
                        <SettingsIcon className="w-5 h-5" />
                        <span className="font-medium">Settings</span>
                    </NavLink>

                    <button
                        onClick={() => setIsTelegramModalOpen(true)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <MessageSquare className="w-5 h-5" />
                        <span className="font-medium">Connect Telegram</span>
                    </button>
                </nav>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                        onClick={logout}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <LogOut className="w-5 h-5" />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>
            <TelegramLinkModal isOpen={isTelegramModalOpen} onClose={() => setIsTelegramModalOpen(false)} />
        </>
    );
}
