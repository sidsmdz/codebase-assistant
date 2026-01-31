import React from 'react';
import ClientSideGrid from '../components/grids/ClientSideGrid';
import ServerSideGrid from '../components/grids/ServerSideGrid';
import FormRenderer from '../components/forms/FormRenderer';
import { EventDispatcher } from '../services/EventDispatcher';

interface ComponentDefinition {
    id: string;
    type: string;
    config: Record<string, any>;
    children?: string[];
}

interface ComponentFactoryProps {
    definition: ComponentDefinition;
    onAction: (actionType: string, componentId: string, payload: any) => void;
    eventDispatcher: EventDispatcher;
}

export const ComponentFactory: React.FC<ComponentFactoryProps> = ({
    definition,
    onAction,
    eventDispatcher
}) => {
    const createComponent = () => {
        switch (definition.type) {
            case 'CLIENT_GRID':
                return (
                    <ClientSideGrid
                        gridId={definition.id}
                        columns={definition.config.columns || []}
                        data={definition.config.data || []}
                        onCellEdit={(rowId, column, value) =>
                            onAction('GRID_EDIT', definition.id, { rowId, column, value })
                        }
                        eventDispatcher={eventDispatcher}
                    />
                );

            case 'SERVER_GRID':
                return (
                    <ServerSideGrid
                        gridId={definition.id}
                        columns={definition.config.columns || []}
                        sessionId={definition.config.sessionId}
                        wsClient={definition.config.wsClient}
                        eventDispatcher={eventDispatcher}
                        pageSize={definition.config.pageSize}
                    />
                );

            case 'FORM':
                return (
                    <FormRenderer
                        formId={definition.id}
                        fields={definition.config.fields || []}
                        onSubmit={(formData) =>
                            onAction('SUBMIT_FORM', definition.id, formData)
                        }
                        wsClient={definition.config.wsClient}
                        eventDispatcher={eventDispatcher}
                    />
                );

            case 'PANEL':
                return (
                    <div className="sdui-panel" style={definition.config.style}>
                        <h3>{definition.config.title}</h3>
                        <div className="panel-content">
                            {definition.config.content}
                        </div>
                    </div>
                );

            case 'BUTTON':
                return (
                    <button
                        className="sdui-button"
                        onClick={() => onAction(definition.config.actionType, definition.id, {})}
                    >
                        {definition.config.label}
                    </button>
                );

            default:
                return (
                    <div className="sdui-unknown">
                        Unknown component type: {definition.type}
                    </div>
                );
        }
    };

    return (
        <div className="sdui-component" data-component-id={definition.id}>
            {createComponent()}
        </div>
    );
};
