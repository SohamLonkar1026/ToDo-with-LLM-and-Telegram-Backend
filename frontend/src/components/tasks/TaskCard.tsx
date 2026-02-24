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

    // Priority badge — works in both light and dark
    const priorityColors = {
        LOW: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
        MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
        HIGH: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    };

    return (
        <div className={`p-4 rounded-xl border transition-all hover:shadow-md animate-fade-in w-full lg:max-w-2xl ${isCompleted
            ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 opacity-75'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700'
            }`}>
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                        onClick={() => onComplete(task.id)}
                        className="mt-1 flex-shrink-0 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                    >
                        {isCompleted
                            ? <CheckCircle className="w-5 h-5 text-green-500" />
                            : <Circle className="w-5 h-5" />}
                    </button>
                    <div className="min-w-0">
                        <h3 className={`font-semibold text-base leading-snug ${isCompleted
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-800 dark:text-white'
                            }`}>
                            {task.title}
                        </h3>
                        {task.description && (
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 break-words">
                                {task.description}
                            </p>
                        )}
                    </div>
                </div>
                <span className={`ml-2 flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide ${priorityColors[task.priority]}`}>
                    {task.priority}
                </span>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatInTimeZone(new Date(task.dueDate), 'Asia/Kolkata', 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{task.estimatedMinutes}m</span>
                    </div>
                </div>

                <Button
                    variant="ghost"
                    className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-300 rounded-lg"
                    onClick={() => onDelete(task.id)}
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
