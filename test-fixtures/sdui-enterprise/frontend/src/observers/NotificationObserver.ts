import { EventDispatcher } from '../services/EventDispatcher';

interface Notification {
    id: string;
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    timestamp: number;
    dismissed: boolean;
}

type NotificationCallback = (notification: Notification) => void;

export class NotificationObserver {
    private eventDispatcher: EventDispatcher;
    private notifications: Notification[] = [];
    private subscribers: NotificationCallback[] = [];
    private maxNotifications: number = 50;

    constructor(eventDispatcher: EventDispatcher) {
        this.eventDispatcher = eventDispatcher;
        this.setupListeners();
    }

    private setupListeners(): void {
        this.eventDispatcher.on('ACTION_FAILURE', (data: any) => {
            this.addNotification('error', `Action failed: ${data.resultType}`);
        });

        this.eventDispatcher.on('ACTION_SUCCESS', (data: any) => {
            this.addNotification('success', `Action completed: ${data.resultType}`);
        });

        this.eventDispatcher.on('LAYOUT_FULL_REFRESH', (data: any) => {
            this.addNotification('info', `Layout refreshed: ${data.screenId}`);
        });

        this.eventDispatcher.on('FORM_SUBMITTED', (data: any) => {
            this.addNotification('success', `Form submitted: ${data.formId}`);
        });
    }

    private addNotification(type: Notification['type'], message: string): void {
        const notification: Notification = {
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            message,
            timestamp: Date.now(),
            dismissed: false
        };

        this.notifications.push(notification);
        if (this.notifications.length > this.maxNotifications) {
            this.notifications.shift();
        }

        this.notifySubscribers(notification);
    }

    subscribe(callback: NotificationCallback): void {
        this.subscribers.push(callback);
    }

    unsubscribe(callback: NotificationCallback): void {
        const index = this.subscribers.indexOf(callback);
        if (index > -1) {
            this.subscribers.splice(index, 1);
        }
    }

    private notifySubscribers(notification: Notification): void {
        this.subscribers.forEach(cb => cb(notification));
    }

    dismiss(notificationId: string): void {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.dismissed = true;
        }
    }

    getActive(): Notification[] {
        return this.notifications.filter(n => !n.dismissed);
    }

    getAll(): Notification[] {
        return [...this.notifications];
    }

    clearAll(): void {
        this.notifications = [];
    }
}
