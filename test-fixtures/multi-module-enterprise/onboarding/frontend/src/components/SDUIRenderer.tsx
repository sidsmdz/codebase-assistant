import React, { useEffect, useState } from 'react';
import { LayoutDefinition, ComponentDefinition } from '../types/sdui';
import { ComponentRenderer } from './ComponentRenderer';

interface SDUIRendererProps {
    screenId: string;
    userId: number;
}

/**
 * Main SDUI Renderer - fetches and renders server-driven UI layouts
 */
export const SDUIRenderer: React.FC<SDUIRendererProps> = ({ screenId, userId }) => {
    const [layout, setLayout] = useState<LayoutDefinition | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        fetchLayout();
    }, [screenId, userId]);
    
    const fetchLayout = async () => {
        try {
            setLoading(true);
            
            // Call gRPC service (through gRPC-Web proxy)
            const response = await fetch('/grpc/onboarding.OnboardingService/GetLayout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    screen_id: screenId,
                    user_id: userId
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch layout: ${response.statusText}`);
            }
            
            const data = await response.json();
            setLayout(data.layout);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load layout');
            console.error('Layout fetch error:', err);
        } finally {
            setLoading(false);
        }
    };
    
    const handleAction = async (actionType: string, componentId: string, payload: Record<string, string>) => {
        try {
            const response = await fetch('/grpc/onboarding.OnboardingService/ProcessAction', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action_type: actionType,
                    component_id: componentId,
                    payload: payload,
                    user_id: userId
                })
            });
            
            if (!response.ok) {
                throw new Error('Action processing failed');
            }
            
            const result = await response.json();
            
            if (result.updated_layout) {
                setLayout(result.updated_layout);
            } else {
                // Refresh layout
                await fetchLayout();
            }
            
            return result;
        } catch (err) {
            console.error('Action error:', err);
            throw err;
        }
    };
    
    if (loading) {
        return (
            <div className="sdui-loading">
                <div className="spinner"></div>
                <p>Loading...</p>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="sdui-error">
                <h3>Error Loading Layout</h3>
                <p>{error}</p>
                <button onClick={fetchLayout}>Retry</button>
            </div>
        );
    }
    
    if (!layout) {
        return (
            <div className="sdui-empty">
                <p>No layout available</p>
            </div>
        );
    }
    
    return (
        <div className={`sdui-container ${layout.config?.theme || 'default'}`}>
            {layout.config?.title && (
                <header className="sdui-header">
                    <h1>{layout.config.title}</h1>
                </header>
            )}
            
            <main className="sdui-main">
                {layout.components?.map((component) => (
                    <ComponentRenderer
                        key={component.id}
                        component={component}
                        userId={userId}
                        onAction={handleAction}
                    />
                ))}
            </main>
        </div>
    );
};
