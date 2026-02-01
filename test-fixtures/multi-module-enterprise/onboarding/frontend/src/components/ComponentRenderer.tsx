import React from 'react';
import { ComponentDefinition } from '../types/sdui';
import { TaskListComponent } from './TaskListComponent';
import { GridComponent } from './GridComponent';
import { usePermissionCheck } from '../hooks/usePermissionCheck';

interface ComponentRendererProps {
    component: ComponentDefinition;
    userId: number;
    onAction: (actionType: string, componentId: string, payload: Record<string, string>) => Promise<any>;
}

/**
 * Renders individual components based on type and permission checks
 */
export const ComponentRenderer: React.FC<ComponentRendererProps> = ({ component, userId, onAction }) => {
    const { hasAccess, loading } = usePermissionCheck(
        userId,
        component.permissions?.resource,
        component.permissions?.required_actions || []
    );
    
    if (loading) {
        return <div className="component-loading">Checking permissions...</div>;
    }
    
    // Handle permission-based fallback behavior
    if (!hasAccess && component.permissions) {
        switch (component.permissions.fallback_behavior) {
            case 'hide':
                return null;
            case 'disable':
                return renderComponent(component, userId, onAction, true);
            case 'show_message':
                return (
                    <div className="permission-denied-message">
                        <p>You don't have permission to access this component</p>
                    </div>
                );
            default:
                return null;
        }
    }
    
    return renderComponent(component, userId, onAction, false);
};

function renderComponent(
    component: ComponentDefinition,
    userId: number,
    onAction: (actionType: string, componentId: string, payload: Record<string, string>) => Promise<any>,
    disabled: boolean
): React.ReactNode {
    const props = {
        id: component.id,
        userId,
        onAction,
        disabled,
        ...component.props
    };
    
    switch (component.type) {
        case 'taskList':
            return <TaskListComponent {...props} />;
            
        case 'grid':
        case 'serverGrid':
            return <GridComponent {...props} columns={component.children} />;
            
        case 'text':
            return (
                <div className="sdui-text" style={disabled ? { opacity: 0.5 } : {}}>
                    {component.props.content || ''}
                </div>
            );
            
        case 'button':
            return (
                <button
                    className="sdui-button"
                    disabled={disabled}
                    onClick={() => {
                        if (!disabled && component.props.action) {
                            onAction(component.props.action, component.id, component.props);
                        }
                    }}
                >
                    {component.props.label || 'Button'}
                </button>
            );
            
        case 'form':
            return (
                <form className="sdui-form" style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : {}}>
                    {component.children?.map((child) => (
                        <ComponentRenderer
                            key={child.id}
                            component={child}
                            userId={userId}
                            onAction={onAction}
                        />
                    ))}
                </form>
            );
            
        case 'progress':
            const percentage = parseInt(component.props.percentage || '0');
            return (
                <div className="sdui-progress">
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
                    </div>
                    <span className="progress-text">
                        {component.props.completed}/{component.props.total} ({percentage}%)
                    </span>
                </div>
            );
            
        case 'taskItem':
            return (
                <div className={`sdui-task-item status-${component.props.status?.toLowerCase()}`}>
                    <div className="task-header">
                        <span className="task-sequence">#{component.props.sequence}</span>
                        <h3>{component.props.title}</h3>
                        <span className="task-status">{component.props.status}</span>
                    </div>
                    <p className="task-description">{component.props.description}</p>
                    {!disabled && component.props.status !== 'COMPLETED' && (
                        <button
                            onClick={() => onAction('completeTask', component.id, {
                                taskId: component.id.replace('task-', '')
                            })}
                        >
                            Complete
                        </button>
                    )}
                </div>
            );
            
        default:
            console.warn(`Unknown component type: ${component.type}`);
            return (
                <div className="sdui-unknown">
                    <p>Unknown component type: {component.type}</p>
                </div>
            );
    }
}
