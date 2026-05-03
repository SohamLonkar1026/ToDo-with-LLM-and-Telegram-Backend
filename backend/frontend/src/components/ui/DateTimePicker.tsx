import { useState, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';

interface DateTimePickerProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
}

export default function DateTimePicker({ label, value, onChange, required }: DateTimePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useClickOutside(containerRef, () => setIsOpen(false));

    // Helper to separate date and time
    const dateValue = value ? value.split('T')[0] : '';
    const timeValue = value ? value.split('T')[1]?.slice(0, 5) : '';

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = e.target.value;
        if (!newDate) {
            // If clearing date, what to do?
            // For now, if date is cleared, clear the whole thing or keep time?
            // Usually clearing date implies clearing value.
            return;
        }
        // Keep existing time or default to 09:00 (work start time)
        const currentTime = timeValue || '09:00';
        onChange(`${newDate}T${currentTime}`);
    };

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = e.target.value;
        if (!newTime) return;

        // Keep existing date or default to today
        const currentDate = dateValue || new Date().toISOString().split('T')[0];
        onChange(`${currentDate}T${newTime}`);
    };

    // Format for display
    const formatDisplay = () => {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toLocaleString([], {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="w-full relative" ref={containerRef}>
            {label && <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>}

            {/* Trigger Input */}
            <div
                onClick={() => setIsOpen(true)}
                className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white cursor-pointer flex items-center justify-between hover:border-slate-600 transition-colors ${isOpen ? 'ring-2 ring-blue-500 border-transparent' : ''
                    }`}
            >
                <span className={!value ? 'text-slate-500' : ''}>
                    {value ? formatDisplay() : 'Select date & time'}
                </span>
                <Calendar className="w-4 h-4 text-slate-400" />
            </div>

            {/* Hidden Input for Form Validation */}
            <input
                type="text"
                className="sr-only"
                value={value}
                required={required}
                onChange={() => { }}
                tabIndex={-1}
                onFocus={() => setIsOpen(true)} // Open if focused via tab
            />

            {/* Popover */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 p-4 animate-in fade-in zoom-in-95 duration-100">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs text-slate-400">Date</label>
                            <input
                                type="date"
                                value={dateValue}
                                onChange={handleDateChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-slate-400">Time</label>
                            <input
                                type="time"
                                value={timeValue}
                                onChange={handleTimeChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>

                        <div className="pt-2 border-t border-slate-700">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsOpen(false);
                                }}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 rounded transition-colors"
                            >
                                Set
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
