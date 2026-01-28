/**
 * WebSocket Client - Manages connection to SDUI Broker
 *
 * Responsibilities:
 * - Establish and maintain WebSocket connection
 * - Handle reconnection with exponential backoff
 * - Send messages to server
 * - Receive messages from server
 * - Dispatch messages to appropriate handlers
 */

import { BrokerMessage, MessageType } from './types';
import { MessageHandler } from './MessageHandler';

export class WebSocketClient {
    private ws: WebSocket | null = null;
    private url: string;
    private messageHandler: MessageHandler;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000; // Start with 1 second
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private isConnected = false;

    constructor(url: string, messageHandler: MessageHandler) {
        this.url = url;
        this.messageHandler = messageHandler;
    }

    /**
     * Connect to WebSocket server
     */
    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    console.log('WebSocket connected to:', this.url);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    this.startHeartbeat();
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

                this.ws.onclose = (event) => {
                    console.log('WebSocket closed:', event.code, event.reason);
                    this.isConnected = false;
                    this.stopHeartbeat();
                    this.attemptReconnect();
                };

            } catch (error) {
                console.error('Failed to create WebSocket:', error);
                reject(error);
            }
        });
    }

    /**
     * Send message to server
     */
    send(message: BrokerMessage): void {
        if (!this.ws || !this.isConnected) {
            console.error('WebSocket not connected, cannot send message');
            return;
        }

        try {
            const json = JSON.stringify(message);
            this.ws.send(json);
            console.log('Sent message:', message.type, message.messageId);
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    /**
     * Send UI event to server
     */
    sendEvent(eventType: string, componentId: string, data: Record<string, string>): void {
        const message: BrokerMessage = {
            messageId: `event_${Date.now()}_${Math.random()}`,
            timestamp: Date.now(),
            type: MessageType.UI_EVENT,
            payload: JSON.stringify({
                eventId: `evt_${Date.now()}`,
                eventType,
                componentId,
                sessionId: this.getSessionId(),
                data,
                clientTimestamp: Date.now()
            }),
            metadata: {}
        };

        this.send(message);
    }

    /**
     * Send state sync to server
     */
    sendStateSync(stateType: string, stateData: any): void {
        const message: BrokerMessage = {
            messageId: `state_${Date.now()}_${Math.random()}`,
            timestamp: Date.now(),
            type: MessageType.STATE_SYNC,
            payload: JSON.stringify({
                stateId: `state_${Date.now()}`,
                stateType,
                stateData: JSON.stringify(stateData),
                direction: 'CLIENT_TO_SERVER'
            }),
            metadata: {}
        };

        this.send(message);
    }

    /**
     * Disconnect from server
     */
    disconnect(): void {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    /**
     * Handle incoming message
     */
    private handleMessage(data: string): void {
        try {
            const message: BrokerMessage = JSON.parse(data);
            console.log('Received message:', message.type, message.messageId);

            // Route to message handler
            this.messageHandler.handleMessage(message);

        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    }

    /**
     * Attempt to reconnect with exponential backoff
     */
    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            console.log('Attempting to reconnect...');
            this.connect().catch(err => {
                console.error('Reconnect failed:', err);
            });
        }, delay);
    }

    /**
     * Start heartbeat to keep connection alive
     */
    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                const heartbeat: BrokerMessage = {
                    messageId: `heartbeat_${Date.now()}`,
                    timestamp: Date.now(),
                    type: MessageType.HEARTBEAT,
                    payload: '',
                    metadata: {}
                };
                this.send(heartbeat);
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Stop heartbeat
     */
    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Get or create session ID
     */
    private getSessionId(): string {
        let sessionId = sessionStorage.getItem('sdui_session_id');
        if (!sessionId) {
            sessionId = `session_${Date.now()}_${Math.random()}`;
            sessionStorage.setItem('sdui_session_id', sessionId);
        }
        return sessionId;
    }

    /**
     * Check if connected
     */
    isWebSocketConnected(): boolean {
        return this.isConnected;
    }
}
