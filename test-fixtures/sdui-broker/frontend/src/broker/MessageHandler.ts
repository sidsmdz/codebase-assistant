/**
 * Message Handler - Routes incoming messages to appropriate handlers
 *
 * Patterns demonstrated:
 * - Strategy pattern for message type handling
 * - Event-driven UI updates
 * - State management integration
 */

import {
    BrokerMessage,
    MessageType,
    UIRenderPayload,
    UIActionPayload,
    StateSyncPayload
} from './types';

export type RenderCallback = (payload: UIRenderPayload) => void;
export type ActionCallback = (payload: UIActionPayload) => void;
export type StateSyncCallback = (payload: StateSyncPayload) => void;
export type ErrorCallback = (error: any) => void;

export class MessageHandler {
    private renderCallback?: RenderCallback;
    private actionCallback?: ActionCallback;
    private stateSyncCallback?: StateSyncCallback;
    private errorCallback?: ErrorCallback;

    /**
     * Register callback for UI_RENDER messages
     */
    onRender(callback: RenderCallback): void {
        this.renderCallback = callback;
    }

    /**
     * Register callback for UI_ACTION messages
     */
    onAction(callback: ActionCallback): void {
        this.actionCallback = callback;
    }

    /**
     * Register callback for STATE_SYNC messages
     */
    onStateSync(callback: StateSyncCallback): void {
        this.stateSyncCallback = callback;
    }

    /**
     * Register callback for ERROR messages
     */
    onError(callback: ErrorCallback): void {
        this.errorCallback = callback;
    }

    /**
     * Handle incoming message from broker
     */
    handleMessage(message: BrokerMessage): void {
        console.log(`Handling message type: ${message.type}`);

        switch (message.type) {
            case MessageType.UI_RENDER:
                this.handleUIRender(message);
                break;

            case MessageType.UI_ACTION:
                this.handleUIAction(message);
                break;

            case MessageType.STATE_SYNC:
                this.handleStateSync(message);
                break;

            case MessageType.ERROR:
                this.handleError(message);
                break;

            case MessageType.CONNECTION_ACK:
                this.handleConnectionAck(message);
                break;

            case MessageType.HEARTBEAT:
                // Heartbeat acknowledged
                console.log('Heartbeat acknowledged');
                break;

            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    /**
     * Handle UI_RENDER message
     * Pattern: Server-driven UI rendering
     */
    private handleUIRender(message: BrokerMessage): void {
        try {
            const payload: UIRenderPayload = JSON.parse(message.payload);

            console.log(`UI Render: ${payload.layoutId}, mode: ${payload.mode}, components: ${payload.components.length}`);

            if (this.renderCallback) {
                this.renderCallback(payload);
            } else {
                console.warn('No render callback registered');
            }
        } catch (error) {
            console.error('Error handling UI_RENDER:', error);
        }
    }

    /**
     * Handle UI_ACTION message
     * Pattern: Server-initiated UI actions (non-rendering)
     */
    private handleUIAction(message: BrokerMessage): void {
        try {
            const payload: UIActionPayload = JSON.parse(message.payload);

            console.log(`UI Action: ${payload.actionType} on ${payload.targetComponentId}`);

            if (this.actionCallback) {
                this.actionCallback(payload);
            } else {
                console.warn('No action callback registered');
            }
        } catch (error) {
            console.error('Error handling UI_ACTION:', error);
        }
    }

    /**
     * Handle STATE_SYNC message
     * Pattern: Bidirectional state synchronization
     */
    private handleStateSync(message: BrokerMessage): void {
        try {
            const payload: StateSyncPayload = JSON.parse(message.payload);

            console.log(`State Sync: ${payload.stateType}, direction: ${payload.direction}`);

            if (this.stateSyncCallback) {
                this.stateSyncCallback(payload);
            } else {
                console.warn('No state sync callback registered');
            }
        } catch (error) {
            console.error('Error handling STATE_SYNC:', error);
        }
    }

    /**
     * Handle ERROR message
     */
    private handleError(message: BrokerMessage): void {
        try {
            const error = JSON.parse(message.payload);
            console.error('Server error:', error);

            if (this.errorCallback) {
                this.errorCallback(error);
            }
        } catch (err) {
            console.error('Error handling ERROR message:', err);
        }
    }

    /**
     * Handle connection acknowledgment
     */
    private handleConnectionAck(message: BrokerMessage): void {
        console.log('Connection acknowledged by server');
        console.log('Session ID:', message.metadata?.sessionId);
    }
}
