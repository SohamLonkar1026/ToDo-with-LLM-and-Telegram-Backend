import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';

interface Notification {
    id: string;
    type: 'REMINDER' | 'OVERDUE';
    message: string;
    read: boolean;
    createdAt: string;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    refreshNotifications: () => Promise<void>;
    setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = async () => {
        try {
            const response = await api.get('/notifications');
            // Backend now returns { data: { notifications: [], totalCount: ... } }
            // We need to extract the array
            setNotifications(response.data.data.notifications || []);
        } catch (error) {
            console.error('Failed to fetch notifications', error);
            setNotifications([]); // Fallback to empty array on error
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id: string) => {
        try {
            // Optimistic update - find current status to toggle
            const notification = notifications.find(n => n.id === id);
            const newStatus = !notification?.read;

            // Update local state immediately
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, read: newStatus } : n)
            );

            // Send to backend (sending unread: true if we want to mark it as unread)
            await api.put(`/notifications/${id}/read`, { unread: !newStatus });
        } catch (error) {
            console.error('Failed to toggle read status', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            await api.put('/notifications/read-all');
        } catch (error) {
            console.error('Failed to mark all as read', error);
            fetchNotifications(); // Revert on error
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Poll every minute to keep counts updated
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationContext.Provider value={{ notifications, unreadCount, loading, markAsRead, markAllAsRead, refreshNotifications: fetchNotifications, setNotifications }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
