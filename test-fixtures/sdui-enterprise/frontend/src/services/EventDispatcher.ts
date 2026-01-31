type EventCallback = (data: any) => void;

export class EventDispatcher {
    private listeners: Map<string, EventCallback[]> = new Map();
    private eventHistory: Array<{ type: string; data: any; timestamp: number }> = [];
    private maxHistorySize: number = 100;

    on(eventType: string, callback: EventCallback): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType)!.push(callback);
    }

    off(eventType: string, callback: EventCallback): void {
        const callbacks = this.listeners.get(eventType);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    dispatch(eventType: string, data: any): void {
        this.eventHistory.push({
            type: eventType,
            data,
            timestamp: Date.now()
        });

        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }

        const callbacks = this.listeners.get(eventType) || [];
        callbacks.forEach(cb => cb(data));

        // Also notify wildcard listeners
        const wildcardCallbacks = this.listeners.get('*') || [];
        wildcardCallbacks.forEach(cb => cb({ type: eventType, data }));
    }

    getHistory(eventType?: string): Array<{ type: string; data: any; timestamp: number }> {
        if (eventType) {
            return this.eventHistory.filter(e => e.type === eventType);
        }
        return [...this.eventHistory];
    }

    clear(): void {
        this.listeners.clear();
        this.eventHistory = [];
    }
}
