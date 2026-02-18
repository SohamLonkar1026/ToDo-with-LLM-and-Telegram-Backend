import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="w-full min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col lg:flex-row transition-colors duration-300">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <Sidebar isOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />

            {/* Main Content Area */}
            <div className="flex-1 w-full flex flex-col">
                <Topbar onMenuClick={() => setIsSidebarOpen(true)} />

                <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
                    <div className="max-w-6xl mx-auto">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
