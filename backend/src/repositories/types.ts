export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type Status = "PENDING" | "COMPLETED";
export type NotificationType = "REMINDER" | "OVERDUE";
export type RecurrenceType = "DAILY" | "MONTHLY" | "YEARLY";

export interface User {
    id: string;
    email: string;
    password: string;
    createdAt: Date;
    updatedAt: Date;
    telegramChatId?: string | null;
    telegramLinkCode?: string | null;
    telegramLinkExpiresAt?: Date | null;
    defaultNotifyBeforeHours: number[];
    defaultNotifyPercentage: number[];
    defaultMinGapMinutes: number;
}

export interface Task {
    id: string;
    title: string;
    description?: string | null;
    dueDate: Date;
    estimatedMinutes: number;
    priority: Priority;
    status: Status;
    notifyBeforeHours: number[];
    notifyPercentage: number[];
    minGapMinutes: number;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    lastReminderSentAt?: Date | null;
    reminderStagesSent: string[];
    snoozedUntil?: Date | null;
    completedAt?: Date | null;
    recurringTemplateId?: string | null;
}

export interface RecurringTemplate {
    id: string;
    userId: string;
    title: string;
    estimatedMinutes?: number | null;
    recurrenceType: RecurrenceType;
    active: boolean;
    createdAt: Date;
}

export interface Notification {
    id: string;
    userId: string;
    taskId: string;
    message: string;
    read: boolean;
    createdAt: Date;
    type: NotificationType;
}

export interface ConversationSession {
    id: string; // doc ID === telegramChatId
    telegramChatId: string;
    step: string;
    partialData: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
