import { ConfigManager } from '../config/ConfigManager';

type MessageCallback = (message: any) => void;

export class WebSocketClient {
    private sessionId: string;
    private socket: WebSocket | null = null;
    private subscriptions: Map<string, MessageCallback[]> = new Map();
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private connected: boolean = false;

    constructor(sessionId: string) {
        this.sessionId = sessionId;
    }

    connect(): void {
        const config = ConfigManager.getInstance();
        const wsUrl = config.get('wsUrl', 'ws://localhost:8080/ws');

        this.socket = new WebSocket(`${wsUrl}?sessionId=${this.sessionId}`);

        this.socket.onopen = () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            console.log('WebSocket connected');
        };

        this.socket.onmessage = (event: MessageEvent) => {
            const message = JSON.parse(event.data);
            const topic = message.topic;
            const callbacks = this.subscriptions.get(topic) || [];
            callbacks.forEach(cb => cb(message.payload));
        };

        this.socket.onclose = () => {
            this.connected = false;
            this.attemptReconnect();
        };

        this.socket.onerror = (error: Event) => {
            console.error('WebSocket error:', error);
        };
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
            this.connected = false;
        }
    }

    subscribe(topic: string, callback: MessageCallback): void {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, []);
        }
        this.subscriptions.get(topic)!.push(callback);

        if (this.connected) {
            this.send('/app/subscribe', { topic, resourceId: topic.split('/').pop() });
        }
    }

    unsubscribe(topic: string): void {
        this.subscriptions.delete(topic);
    }

    send(destination: string, payload: any): void {
        if (this.socket && this.connected) {
            this.socket.send(JSON.stringify({
                destination,
                payload,
                sessionId: this.sessionId
            }));
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
        }
    }
}
