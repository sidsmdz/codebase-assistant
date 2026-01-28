/**
 * SDUI Renderer - Main component that renders server-driven UI
 *
 * Responsibilities:
 * - Receive UI definitions from server via WebSocket
 * - Render components from component registry
 * - Handle UI actions from server
 * - Manage application state
 * - Dispatch events to server
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, ThemeProvider, createTheme } from '@mui/material';
import { WebSocketClient } from '../broker/WebSocketClient';
import { MessageHandler } from '../broker/MessageHandler';
import {
    Component,
    UIRenderPayload,
    UIActionPayload,
    StateSyncPayload,
    EventType
} from '../broker/types';
import { ComponentRegistry } from '../registry/ComponentRegistry';

interface SDUIRendererProps {
    wsUrl: string;
}

export const SDUIRenderer: React.FC<SDUIRendererProps> = ({ wsUrl }) => {
    const [components, setComponents] = useState<Component[]>([]);
    const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [drawerStates, setDrawerStates] = useState<Record<string, boolean>>({});
    const [modalStates, setModalStates] = useState<Record<string, boolean>>({});

    const theme = createTheme({
        palette: {
            primary: { main: '#1976d2' },
            secondary: { main: '#dc004e' }
        }
    });

    // Initialize WebSocket connection
    useEffect(() => {
        const messageHandler = new MessageHandler();
        const client = new WebSocketClient(wsUrl, messageHandler);

        // Register message handlers
        messageHandler.onRender(handleRender);
        messageHandler.onAction(handleAction);
        messageHandler.onStateSync(handleStateSync);
        messageHandler.onError(handleError);

        // Connect to server
        client.connect()
            .then(() => {
                console.log('Connected to SDUI broker');
                setIsConnected(true);
            })
            .catch(err => {
                console.error('Failed to connect:', err);
                setIsConnected(false);
            });

        setWsClient(client);

        // Cleanup on unmount
        return () => {
            client.disconnect();
        };
    }, [wsUrl]);

    /**
     * Handle UI_RENDER message - Update component tree
     */
    const handleRender = useCallback((payload: UIRenderPayload) => {
        console.log(`Rendering layout: ${payload.layoutId}, mode: ${payload.mode}`);

        switch (payload.mode) {
            case 'FULL_RENDER':
                // Complete replacement
                setComponents(payload.components);
                break;

            case 'DELTA_RENDER':
                // Merge with existing components
                setComponents(prev => mergeComponents(prev, payload.components));
                break;

            case 'APPEND':
                // Append to existing
                setComponents(prev => [...prev, ...payload.components]);
                break;
        }
    }, []);

    /**
     * Handle UI_ACTION message - Perform non-rendering actions
     */
    const handleAction = useCallback((payload: UIActionPayload) => {
        console.log(`Executing action: ${payload.actionType} on ${payload.targetComponentId}`);

        const { actionType, targetComponentId, params } = payload;

        switch (actionType) {
            case 'OPEN_DRAWER':
                // Pattern B1: Action-based drawer opening
                setDrawerStates(prev => ({ ...prev, [targetComponentId]: true }));
                console.log('Pattern B1: Opened drawer via UI_ACTION');
                break;

            case 'CLOSE_DRAWER':
                setDrawerStates(prev => ({ ...prev, [targetComponentId]: false }));
                break;

            case 'OPEN_MODAL':
                setModalStates(prev => ({ ...prev, [targetComponentId]: true }));
                break;

            case 'CLOSE_MODAL':
                setModalStates(prev => ({ ...prev, [targetComponentId]: false }));
                break;

            case 'SHOW_VALIDATION':
                // Handle validation display
                handleValidationDisplay(targetComponentId, params);
                break;

            case 'SHOW_TOAST':
                // Show toast notification
                console.log('Toast:', params.message);
                break;

            default:
                console.warn('Unknown action type:', actionType);
        }
    }, []);

    /**
     * Handle STATE_SYNC message - Sync state from server
     */
    const handleStateSync = useCallback((payload: StateSyncPayload) => {
        console.log(`State sync: ${payload.stateType}`);

        if (payload.stateType === 'DRAWER_STATE') {
            // Pattern B3: State-based drawer opening
            const stateData = JSON.parse(payload.stateData);
            setDrawerStates(prev => ({
                ...prev,
                [stateData.drawerId]: stateData.isOpen
            }));
            console.log('Pattern B3: Opened drawer via STATE_SYNC');
        }
    }, []);

    /**
     * Handle error messages from server
     */
    const handleError = useCallback((error: any) => {
        console.error('Server error:', error);
        // Show error toast or modal
    }, []);

    /**
     * Handle validation display
     */
    const handleValidationDisplay = (fieldId: string, params: Record<string, string>) => {
        const isValid = params.valid === 'true';
        const message = params.message;
        const mode = params.mode;

        console.log(`Validation (${mode}): Field ${fieldId} - ${isValid ? 'Valid' : 'Invalid'}: ${message}`);

        // Update validation state (would trigger UI update in form component)
    };

    /**
     * Merge components for delta updates
     */
    const mergeComponents = (existing: Component[], updates: Component[]): Component[] => {
        const merged = [...existing];

        updates.forEach(update => {
            const index = merged.findIndex(c => c.id === update.id);
            if (index >= 0) {
                merged[index] = update; // Replace existing
            } else {
                merged.push(update); // Add new
            }
        });

        return merged;
    };

    /**
     * Send event to server
     */
    const sendEvent = useCallback((
        eventType: EventType | string,
        componentId: string,
        data: Record<string, string>
    ) => {
        if (wsClient && isConnected) {
            wsClient.sendEvent(eventType, componentId, data);
        }
    }, [wsClient, isConnected]);

    /**
     * Render components recursively
     */
    const renderComponents = (componentList: Component[]): React.ReactNode => {
        return componentList.map((component, index) => {
            // Get component implementation from registry
            const ComponentImpl = ComponentRegistry.get(component.type);

            if (!ComponentImpl) {
                console.warn(`No implementation for component type: ${component.type}`);
                return null;
            }

            // Pass event dispatcher and state to components
            const componentProps = {
                key: component.id || `component_${index}`,
                component,
                sendEvent,
                drawerState: drawerStates[component.id],
                modalState: modalStates[component.id],
                onDrawerChange: (isOpen: boolean) => {
                    setDrawerStates(prev => ({ ...prev, [component.id]: isOpen }));
                },
                onModalChange: (isOpen: boolean) => {
                    setModalStates(prev => ({ ...prev, [component.id]: isOpen }));
                }
            };

            return <ComponentImpl {...componentProps} />;
        });
    };

    if (!isConnected) {
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <p>Connecting to SDUI broker...</p>
                <p>{wsUrl}</p>
            </Box>
        );
    }

    return (
        <ThemeProvider theme={theme}>
            <Box sx={{ width: '100%', minHeight: '100vh', bgcolor: 'background.default', p: 2 }}>
                {components.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <p>Connected. Waiting for server to send UI...</p>
                    </Box>
                ) : (
                    renderComponents(components)
                )}
            </Box>
        </ThemeProvider>
    );
};
