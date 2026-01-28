/**
 * Component Registry - Maps component types to React implementations
 *
 * This is the central registry that the SDUI renderer uses to
 * instantiate components based on server-sent type strings
 */

import { ComponentType } from '../broker/types';
import { ClientSideGrid } from '../components/grids/ClientSideGrid';
import { Drawer } from '../components/layout/Drawer';

// Import other components (would be implemented similarly)
// import { ServerSideGrid } from '../components/grids/ServerSideGrid';
// import { Modal } from '../components/layout/Modal';
// import { FormComponent } from '../components/forms/FormComponent';
// etc.

type ComponentImplementation = React.ComponentType<any>;

class ComponentRegistryClass {
    private registry: Map<ComponentType | string, ComponentImplementation> = new Map();

    constructor() {
        this.registerDefaultComponents();
    }

    /**
     * Register default component implementations
     */
    private registerDefaultComponents(): void {
        // Grids
        this.register(ComponentType.CLIENT_SIDE_GRID, ClientSideGrid);
        // this.register(ComponentType.SERVER_SIDE_GRID, ServerSideGrid);
        // this.register(ComponentType.EDITABLE_GRID, EditableGrid);

        // Layout
        this.register(ComponentType.DRAWER, Drawer);
        // this.register(ComponentType.MODAL, Modal);
        // this.register(ComponentType.TABS, Tabs);

        // Forms
        // this.register(ComponentType.FORM, FormComponent);
        // this.register(ComponentType.TEXT_INPUT, TextInput);

        // Basic
        this.register(ComponentType.BUTTON, ButtonComponent);
        this.register(ComponentType.TEXT, TextComponent);
        this.register(ComponentType.CONTAINER, ContainerComponent);
    }

    /**
     * Register a component implementation
     */
    register(type: ComponentType | string, component: ComponentImplementation): void {
        this.registry.set(type, component);
    }

    /**
     * Get component implementation by type
     */
    get(type: ComponentType | string): ComponentImplementation | undefined {
        return this.registry.get(type);
    }

    /**
     * Check if component type is registered
     */
    has(type: ComponentType | string): boolean {
        return this.registry.has(type);
    }

    /**
     * Get all registered component types
     */
    getRegisteredTypes(): string[] {
        return Array.from(this.registry.keys()) as string[];
    }
}

// Singleton instance
export const ComponentRegistry = new ComponentRegistryClass();

// Simple component implementations for basic types
const ButtonComponent: React.FC<any> = ({ component, sendEvent }) => {
    const handleClick = () => {
        console.log('Button clicked:', component.id);
        sendEvent('BUTTON_CLICK', component.id, {
            buttonId: component.id,
            label: component.props?.label || ''
        });
    };

    return (
        <button
            onClick={handleClick}
            style={{
                padding: '10px 20px',
                margin: '10px',
                cursor: 'pointer',
                backgroundColor: component.props?.variant === 'primary' ? '#1976d2' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px'
            }}
        >
            {component.props?.label || 'Button'}
        </button>
    );
};

const TextComponent: React.FC<any> = ({ component }) => {
    const text = component.props?.text || '';
    const variant = component.props?.variant || 'body1';

    const styles: Record<string, React.CSSProperties> = {
        h1: { fontSize: '2rem', fontWeight: 'bold', margin: '10px 0' },
        h2: { fontSize: '1.5rem', fontWeight: 'bold', margin: '10px 0' },
        body1: { fontSize: '1rem', margin: '5px 0' },
        success: { color: 'green', margin: '5px 0' },
        error: { color: 'red', margin: '5px 0' }
    };

    return <div style={styles[variant] || styles.body1}>{text}</div>;
};

const ContainerComponent: React.FC<any> = ({ component }) => {
    const padding = component.props?.padding || '10px';
    const margin = component.props?.margin || '0';

    return (
        <div style={{ padding, margin }}>
            {component.children?.map((child: any, idx: number) => {
                const ChildComponent = ComponentRegistry.get(child.type);
                if (!ChildComponent) {return null;}
                return <ChildComponent key={child.id || idx} component={child} />;
            })}
        </div>
    );
};
