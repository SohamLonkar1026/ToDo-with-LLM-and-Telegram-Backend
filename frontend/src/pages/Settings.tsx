import { useState, useRef, useEffect } from 'react';
import { Settings as SettingsIcon, ChevronDown, Check } from 'lucide-react';
import api from '../services/api';

interface MultiSelectProps {
    label: string;
    options: { label: string; value: number }[];
    selectedValues: number[];
    onChange: (values: number[]) => void;
    placeholder: string;
    disabled?: boolean;
}

function MultiSelect({ label, options, selectedValues, onChange, placeholder, disabled }: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (value: number) => {
        if (selectedValues.includes(value)) {
            onChange(selectedValues.filter(v => v !== value));
        } else {
            onChange([...selectedValues, value].sort((a, b) => a - b));
        }
    };

    const getDisplayLabel = () => {
        if (selectedValues.length === 0) return placeholder;
        return options
            .filter(opt => selectedValues.includes(opt.value))
            .map(opt => opt.label)
            .join(', ');
    };

    return (
        <div className="space-y-1.5" ref={dropdownRef}>
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {label}
                </label>
                {selectedValues.length > 0 && !disabled && (
                    <button
                        type="button"
                        onClick={() => onChange([])}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                        Clear All
                    </button>
                )}
            </div>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                    disabled={disabled}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all hover:border-slate-300 dark:hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className={`truncate ${selectedValues.length === 0 ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {getDisplayLabel()}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && !disabled && (
                    <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-1 max-h-60 overflow-auto">
                            {options.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => toggleOption(option.value)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedValues.includes(option.value)
                                            ? 'bg-blue-600 border-blue-600'
                                            : 'border-slate-300 dark:border-slate-600'
                                            }`}>
                                            {selectedValues.includes(option.value) && (
                                                <Check className="w-3 h-3 text-white" />
                                            )}
                                        </div>
                                        <span>{option.label}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function Settings() {
    const [notifyBeforeHours, setNotifyBeforeHours] = useState<number[]>([]);
    const [notifyPercentage, setNotifyPercentage] = useState<number[]>([]);
    const [minGapMinutes, setMinGapMinutes] = useState<number>(58);

    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [initialState, setInitialState] = useState<{
        hours: number[];
        percent: number[];
        gap: number;
    } | null>(null);

    const hasChanges =
        initialState &&
        (
            JSON.stringify(initialState.hours) !== JSON.stringify(notifyBeforeHours) ||
            JSON.stringify(initialState.percent) !== JSON.stringify(notifyPercentage) ||
            initialState.gap !== minGapMinutes
        );

    const hourOptions = [
        { label: '1 hour', value: 1 },
        { label: '3 hours', value: 3 },
        { label: '6 hours', value: 6 },
        { label: '12 hours', value: 12 },
        { label: '24 hours', value: 24 },
    ];

    const percentageOptions = [
        { label: '20%', value: 20 },
        { label: '40%', value: 40 },
        { label: '60%', value: 60 },
        { label: '80%', value: 80 },
        { label: '90%', value: 90 },
    ];

    // Fetch on mount
    useEffect(() => {
        const fetchDefaults = async () => {
            try {
                setLoading(true);
                setError(null);
                const { data } = await api.get('/api/settings/reminder-defaults');
                setNotifyBeforeHours(data.defaultNotifyBeforeHours ?? []);
                setNotifyPercentage(data.defaultNotifyPercentage ?? []);
                setMinGapMinutes(data.defaultMinGapMinutes ?? 58);
                setInitialState({
                    hours: data.defaultNotifyBeforeHours ?? [],
                    percent: data.defaultNotifyPercentage ?? [],
                    gap: data.defaultMinGapMinutes ?? 58,
                });
            } catch {
                setError('Failed to load settings. Please refresh and try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchDefaults();
    }, []);

    const handleSave = async () => {
        if (saving) return; // Double-submit guard
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            await api.put('/api/settings/reminder-defaults', {
                defaultNotifyBeforeHours: notifyBeforeHours,
                defaultNotifyPercentage: notifyPercentage,
                defaultMinGapMinutes: minGapMinutes,
            });

            setSuccess('Settings saved successfully.');
            setInitialState({
                hours: notifyBeforeHours,
                percent: notifyPercentage,
                gap: minGapMinutes,
            });
        } catch (err: unknown) {
            const axiosError = err as { response?: { data?: { message?: string } } };
            setError(axiosError.response?.data?.message ?? 'Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    // Auto-clear success message after 3 seconds
    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [success]);

    return (
        <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-8">
            <div className="flex items-center gap-3 mb-2">
                <SettingsIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Settings</h1>
            </div>

            <hr className="border-slate-200 dark:border-slate-800" />

            <section className="space-y-6">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Receive notification when</h2>

                {loading ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">Loading your settings...</p>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <MultiSelect
                                label="Time before due date"
                                options={hourOptions}
                                selectedValues={notifyBeforeHours}
                                onChange={setNotifyBeforeHours}
                                placeholder="Select times..."
                                disabled={saving}
                            />
                            <MultiSelect
                                label="Task time completed (%)"
                                options={percentageOptions}
                                selectedValues={notifyPercentage}
                                onChange={setNotifyPercentage}
                                placeholder="Select percentages..."
                                disabled={saving}
                            />
                        </div>

                        {/* Feedback messages */}
                        {error && (
                            <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
                        )}
                        {success && (
                            <p className="text-sm font-medium text-green-600 dark:text-green-400">{success}</p>
                        )}

                        {/* Save button */}
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || !hasChanges}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                                {saving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </>
                )}
            </section>

            <hr className="border-slate-200 dark:border-slate-800" />

            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Future settings</h2>
                <div className="min-h-[200px] rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/30">
                    <p className="text-slate-500 dark:text-slate-400 italic">No additional settings available yet.</p>
                </div>
            </section>
        </div>
    );
}
