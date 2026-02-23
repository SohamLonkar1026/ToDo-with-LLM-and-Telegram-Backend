import { useState, useEffect } from 'react';
import api from '../services/api';
import TaskCard, { Task } from '../components/tasks/TaskCard';
import TaskModal from '../components/tasks/TaskModal';

export default function Priority() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchTasks = async () => {
        try {
            const response = await api.get('/tasks/priority');
            setTasks(response.data.data);
        } catch (error) {
            console.error('Failed to fetch priority tasks', error);
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
        if (!confirm('Are you sure you want to delete this task?')) return;

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
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Priority Order</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Tasks sorted by "Start By" time</p>
                </div>
                {/* Optional: Keep Create capability or remove? User said "Render tasks". I'll keep it for utility but it won't affect sort until refresh */}
            </div>

            {loading ? (
                <div className="text-center text-slate-500 dark:text-slate-400 py-12">Loading tasks...</div>
            ) : tasks.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 border-dashed shadow-sm dark:shadow-none">
                    <p className="text-slate-500 dark:text-slate-400 mb-4">No tasks found.</p>
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

            <TaskModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={fetchTasks}
            />
        </div>
    );
}
