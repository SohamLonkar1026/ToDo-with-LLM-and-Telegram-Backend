import { useState } from 'react';
import { X } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DateTimePicker from '../ui/DateTimePicker';
import api from '../../services/api';

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function TaskModal({ isOpen, onClose, onSuccess }: TaskModalProps) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        dueDate: '',
        estimatedMinutes: 30,
        priority: 'MEDIUM'
    });
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            console.log("[DEBUG_DASHBOARD_CREATE] Raw Input:", formData.dueDate);
            const isoDueDate = new Date(formData.dueDate).toISOString();
            console.log("[DEBUG_DASHBOARD_CREATE] Sending ISO dueDate:", isoDueDate);

            await api.post('/tasks', {
                ...formData,
                dueDate: isoDueDate
            });
            onSuccess();
            onClose();
            // Reset form
            setFormData({ title: '', description: '', dueDate: '', estimatedMinutes: 30, priority: 'MEDIUM' });
        } catch (error) {
            console.error('Failed to create task', error);
            alert('Failed to create task');
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

                <h2 className="text-xl font-bold text-white mb-6">Create New Task</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Title"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                        autoFocus
                    />

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                        <textarea
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <DateTimePicker
                            label="Due Date"
                            value={formData.dueDate}
                            onChange={(val) => setFormData({ ...formData, dueDate: val })}
                            required
                        />
                        <Input
                            label="Est. Minutes"
                            type="number"
                            min="1"
                            value={formData.estimatedMinutes}
                            onChange={(e) => setFormData({ ...formData, estimatedMinutes: parseInt(e.target.value) })}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Priority</label>
                        <div className="flex bg-slate-900 border border-slate-700 p-1 rounded-lg">
                            {['LOW', 'MEDIUM', 'HIGH'].map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, priority: p })}
                                    className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${formData.priority === p
                                        ? 'bg-blue-600 text-white shadow'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Task'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
