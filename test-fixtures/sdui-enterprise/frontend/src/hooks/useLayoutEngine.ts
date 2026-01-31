import { useState, useEffect, useCallback } from 'react';
import { WebSocketClient } from '../services/WebSocketClient';
import { ConfigManager } from '../config/ConfigManager';

interface LayoutComponent {
    id: string;
    type: string;
    config: Record<string, any>;
    children?: string[];
}

interface Layout {
    screenId: string;
    title: string;
    theme: string;
    components: LayoutComponent[];
}

interface LayoutEngineState {
    layout: Layout | null;
    loading: boolean;
    error: string | null;
    refreshLayout: () => void;
}

export function useLayoutEngine(screenId: string, sessionId: string): LayoutEngineState {
    const [layout, setLayout] = useState<Layout | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const config = ConfigManager.getInstance();
    const apiBaseUrl = config.get('apiBaseUrl', '/api');

    const fetchLayout = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiBaseUrl}/layout/${screenId}`, {
                headers: {
                    'X-Session-Id': sessionId
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch layout: ${response.statusText}`);
            }
            const data = await response.json();
            setLayout(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [screenId, sessionId, apiBaseUrl]);

    useEffect(() => {
        fetchLayout();
    }, [fetchLayout]);

    const refreshLayout = useCallback(() => {
        fetchLayout();
    }, [fetchLayout]);

    return { layout, loading, error, refreshLayout };
}
