import React, { useState, useEffect, useCallback } from 'react';
import { ComponentFactory } from '../factory/ComponentFactory';
import { useLayoutEngine } from '../hooks/useLayoutEngine';
import { WebSocketClient } from '../services/WebSocketClient';
import { EventDispatcher } from '../services/EventDispatcher';

interface SDUIRendererProps {
    screenId: string;
    sessionId: string;
}

interface ComponentDefinition {
    id: string;
    type: string;
    config: Record<string, any>;
    children?: string[];
}

const SDUIRenderer: React.FC<SDUIRendererProps> = ({ screenId, sessionId }) => {
    const { layout, loading, error, refreshLayout } = useLayoutEngine(screenId, sessionId);
    const [wsClient] = useState(() => new WebSocketClient(sessionId));
    const [eventDispatcher] = useState(() => new EventDispatcher());

    useEffect(() => {
        wsClient.connect();
        wsClient.subscribe(`/topic/layout/${screenId}`, (update: any) => {
            eventDispatcher.dispatch('LAYOUT_UPDATE', update);
            refreshLayout();
        });

        return () => {
            wsClient.disconnect();
        };
    }, [screenId, sessionId]);

    const handleAction = useCallback((actionType: string, componentId: string, payload: any) => {
        wsClient.send('/app/action', {
            actionType,
            componentId,
            payload,
            sessionId
        });
        eventDispatcher.dispatch('ACTION_SENT', { actionType, componentId });
    }, [wsClient, sessionId, eventDispatcher]);

    if (loading) {
        return <div className="sdui-loading">Loading layout...</div>;
    }

    if (error) {
        return <div className="sdui-error">Error: {error}</div>;
    }

    if (!layout) {
        return <div className="sdui-empty">No layout available</div>;
    }

    return (
        <div className="sdui-renderer" data-screen={screenId}>
            <h1>{layout.title}</h1>
            <div className="sdui-components">
                {layout.components.map((component: ComponentDefinition) => (
                    <ComponentFactory
                        key={component.id}
                        definition={component}
                        onAction={handleAction}
                        eventDispatcher={eventDispatcher}
                    />
                ))}
            </div>
        </div>
    );
};

export default SDUIRenderer;
