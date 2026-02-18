import { formatInTimeZone } from 'date-fns-tz';
import { CheckCircle, Circle, Trash2, Clock, AlertTriangle } from 'lucide-react';
import Button from '../ui/Button';

export interface Task {
    id: string;
    title: string;
    description?: string;
    dueDate: string;
    estimatedMinutes: number;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    status: 'PENDING' | 'COMPLETED';
}

interface TaskCardProps {
    task: Task;
    onComplete: (id: string) => void;
    onDelete: (id: string) => void;
}

export default function TaskCard({ task, onComplete, onDelete }: TaskCardProps) {
    const isCompleted = task.status === 'COMPLETED';

    // Debug Logging for first task only (to avoid spam)
    if (Math.random() < 0.05) { // Sample ~5% or remove check for full spam
        console.log("[DEBUG_DASHBOARD_RENDER] Received:", task.dueDate);
        console.log("[DEBUG_DASHBOARD_RENDER] Interpreted:", new Date(task.dueDate));
        console.log("[DEBUG_DASHBOARD_RENDER] Formatted:", formatInTimeZone(new Date(task.dueDate), 'Asia/Kolkata', 'MMM d, h:mm a'));
    }

    const priorityColors = {
        LOW: 'bg-green-900 text-green-300',
        MEDIUM: 'bg-yellow-900 text-yellow-300',
        HIGH: 'bg-red-900 text-red-300',
    };

    return (
        <div className={`p-4 rounded-xl border transition-all hover:shadow-lg animate-fade-in w-full lg:max-w-2xl ${isCompleted
            ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 opacity-75'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}>
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3">
                    <button
                        onClick={() => onComplete(task.id)}
                        className="mt-1 text-slate-400 hover:text-blue-500 transition-colors"
                    >
                        {isCompleted ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5" />}
                    </button>
                    <div>
                        <h3 className={`font-semibold text-lg ${isCompleted ? 'line-through text-slate-500' : 'text-white'}`}>
                            {task.title}
                        </h3>
                        {task.description && <p className="text-slate-400 text-sm mt-1">{task.description}</p>}
                    </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColors[task.priority]}`}>
                    {task.priority}
                </span>
            </div>

            <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{formatInTimeZone(new Date(task.dueDate), 'Asia/Kolkata', 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span>{task.estimatedMinutes}m</span>
                    </div>
                </div>

                <Button variant="ghost" className="p-2 text-red-400 hover:bg-red-900/20 hover:text-red-300" onClick={() => onDelete(task.id)}>
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
