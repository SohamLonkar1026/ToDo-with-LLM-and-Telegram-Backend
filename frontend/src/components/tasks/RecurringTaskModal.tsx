import { useState } from 'react';
import { X } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import api from '../../services/api';

interface RecurringTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function RecurringTaskModal({ isOpen, onClose, onSuccess }: RecurringTaskModalProps) {
    const [formData, setFormData] = useState({
        title: '',
        estimatedMinutes: 30,
        recurrenceType: 'DAILY'
    });
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // RecurrenceType is already strictly typed by the select
            await api.post('/recurring', {
                title: formData.title,
                estimatedMinutes: parseInt(formData.estimatedMinutes.toString()),
                recurrenceType: formData.recurrenceType
            });
            onSuccess();
            onClose();
            // Reset form
            setFormData({ title: '', estimatedMinutes: 30, recurrenceType: 'DAILY' });
        } catch (error) {
            console.error('Failed to create recurring template', error);
            alert('Failed to create recurring template');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md p-6 shadow-xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold text-white mb-6">Create Recurring Task</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Title"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                        autoFocus
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Est. Minutes"
                            type="number"
                            min="1"
                            value={formData.estimatedMinutes}
                            onChange={(e) => setFormData({ ...formData, estimatedMinutes: parseInt(e.target.value) })}
                        />
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Recurrence</label>
                            <select
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.recurrenceType}
                                onChange={(e) => setFormData({ ...formData, recurrenceType: e.target.value })}
                            >
                                <option value="DAILY">Daily</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="YEARLY">Yearly</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Template'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
