import { useState, useEffect } from 'react';
import api from '../services/api';
import TaskCard, { Task } from '../components/tasks/TaskCard';
import RecurringTaskModal from '../components/tasks/RecurringTaskModal';
import { RefreshCw, Plus } from 'lucide-react';
import Button from '../components/ui/Button';

export default function DailyTasks() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const response = await api.get('/tasks/daily');
            setTasks(response.data.data);
        } catch (error) {
            console.error('Failed to fetch daily tasks', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []);

    const handleComplete = async (id: string) => {
        try {
            const task = tasks.find(t => t.id === id);
            if (!task) return;

            const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

            // Optimistic update
            setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus } : t));

            await api.put(`/tasks/${id}`, { status: newStatus });
        } catch (error) {
            console.error('Failed to update task', error);
            fetchTasks(); // Revert on error
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this task instance?')) return;

        try {
            setTasks(tasks.filter(t => t.id !== id)); // Optimistic delete
            await api.delete(`/tasks/${id}`);
        } catch (error) {
            console.error('Failed to delete task', error);
            fetchTasks(); // Revert on error
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Daily Tasks</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Recurring tasks for the current logical day (starts 4 AM)</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button onClick={() => setIsRecurringModalOpen(true)} className="flex items-center gap-2 text-sm">
                        <Plus className="w-4 h-4" />
                        Add Recurring Task
                    </Button>
                    <button
                        onClick={fetchTasks}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                        title="Refresh Daily Tasks"
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center text-slate-500 dark:text-slate-400 py-12">Loading daily tasks...</div>
            ) : tasks.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 border-dashed shadow-sm dark:shadow-none">
                    <p className="text-slate-500 dark:text-slate-400 mb-4">No daily tasks for today.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {tasks.map((task) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onComplete={handleComplete}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            <RecurringTaskModal
                isOpen={isRecurringModalOpen}
                onClose={() => setIsRecurringModalOpen(false)}
                onSuccess={fetchTasks}
            />
        </div>
    );
}
