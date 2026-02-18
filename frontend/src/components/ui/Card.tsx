import { ReactNode } from 'react';

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-sm ${className}`}>
            {children}
        </div>
    );
}
