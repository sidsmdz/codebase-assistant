/**
 * SDUI Layout Manager - TypeScript Client
 *
 * This component:
 * 1. Connects to gRPC LayoutService
 * 2. Receives server-driven UI layouts
 * 3. Renders AG Grid with MUI styling
 * 4. Sends user events back to server
 * 5. Handles tab switching based on server commands
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Box, Tabs, Tab, ThemeProvider, createTheme } from '@mui/material';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, RowSelectedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-material.css';
import { LayoutServiceClient } from '../generated/layout_grpc_web_pb';
import {
    LayoutRequest,
    LayoutResponse,
    LayoutUpdate,
    UserEvent,
    EventType,
    Component,
    ComponentType
} from '../generated/layout_pb';

interface LayoutManagerProps {
    userId: string;
    grpcHost?: string;
}

interface RenderedLayout {
    components: Component[];
    activeTab?: number;
}

const LayoutManager: React.FC<LayoutManagerProps> = ({ userId, grpcHost = 'http://localhost:9090' }) => {
    const [layout, setLayout] = useState<RenderedLayout | null>(null);
    const [client] = useState(() => new LayoutServiceClient(grpcHost));
    const [sessionId] = useState(() => `session_${Date.now()}_${Math.random()}`);
    const [activeTab, setActiveTab] = useState(0);

    // MUI Theme
    const theme = createTheme({
        palette: {
            primary: {
                main: '#1976d2',
            },
        },
    });

    /**
     * Initialize layout - called when component mounts
     * Triggers server to generate initial AG Grid layout
     */
    useEffect(() => {
        loadInitialLayout();
        setupLayoutStream();
    }, [userId]);

    /**
     * Load initial layout from server
     */
    const loadInitialLayout = async () => {
        const request = new LayoutRequest();
        request.setUserid(userId);
        request.setSessionid(sessionId);
        request.setContext('app_init');

        try {
            const response = await client.getInitialLayout(request, {});
            processLayoutResponse(response);
        } catch (error) {
            console.error('Failed to load initial layout:', error);
        }
    };

    /**
     * Setup streaming connection for real-time layout updates
     */
    const setupLayoutStream = () => {
        const request = new LayoutRequest();
        request.setUserid(userId);
        request.setSessionid(sessionId);

        const stream = client.streamLayoutUpdates(request, {});

        stream.on('data', (update: LayoutUpdate) => {
            console.log('Received layout update:', update.getUpdateid());
            processLayoutUpdate(update);
        });

        stream.on('error', (error) => {
            console.error('Stream error:', error);
        });

        stream.on('end', () => {
            console.log('Stream ended');
        });
    };

    /**
     * Process layout response from server
     */
    const processLayoutResponse = (response: LayoutResponse) => {
        if (!response.getSuccess()) {
            console.error('Layout response failed');
            return;
        }

        const components = response.getComponentsList();
        setLayout({ components });
    };

    /**
     * Process streaming layout update
     */
    const processLayoutUpdate = (update: LayoutUpdate) => {
        const components = update.getComponentsList();
        const targetTab = update.getTargettab();

        setLayout({ components });

        // If server specifies tab change
        if (targetTab) {
            const tabIndex = parseInt(targetTab);
            if (!isNaN(tabIndex)) {
                setActiveTab(tabIndex);
            }
        }
    };

    /**
     * Send user event to server
     */
    const sendUserEvent = async (type: EventType, componentId: string, data: Record<string, string>) => {
        const event = new UserEvent();
        event.setEventid(`event_${Date.now()}`);
        event.setType(type);
        event.setComponentid(componentId);
        event.setTimestamp(Date.now());

        // Add session to data
        const eventData = { ...data, sessionId };
        Object.entries(eventData).forEach(([key, value]) => {
            event.getDataMap().set(key, value);
        });

        try {
            const response = await client.sendUserEvent(event, {});
            processLayoutResponse(response);
        } catch (error) {
            console.error('Failed to send event:', error);
        }
    };

    /**
     * Handle AG Grid row selection
     * Sends event to server which will create new layout with tabs
     */
    const handleRowSelected = useCallback((event: RowSelectedEvent) => {
        if (event.node.isSelected()) {
            const rowData = event.data;
            console.log('Row selected:', rowData);

            sendUserEvent(EventType.ROW_SELECTED, 'userGrid', {
                rowId: rowData.id,
                userName: rowData.name
            });
        }
    }, []);

    /**
     * Handle tab change
     */
    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);

        sendUserEvent(EventType.TAB_CHANGED, 'mainTabs', {
            tabIndex: newValue.toString()
        });
    };

    /**
     * Render AG Grid component
     */
    const renderAGGrid = (component: Component) => {
        const gridConfig = component.getGridconfig();
        if (!gridConfig) return null;

        // Convert proto columns to AG Grid columns
        const columnDefs: ColDef[] = gridConfig.getColumnsList().map(col => ({
            field: col.getField(),
            headerName: col.getHeadername(),
            sortable: col.getSortable(),
            filter: col.getFilter(),
            width: col.getWidth()
        }));

        // Convert proto rows to AG Grid row data
        const rowData = gridConfig.getRowsList().map(row => {
            const data: any = { id: row.getId() };
            row.getDataMap().forEach((value, key) => {
                data[key] = value;
            });
            data._rowClass = row.getRowclass();
            return data;
        });

        // Custom row styling - blue for premium, white for regular
        const getRowClass = (params: any) => {
            if (params.data._rowClass === 'premium-user-blue') {
                return 'premium-user-blue';
            }
            return 'regular-user-white';
        };

        return (
            <Box sx={{ height: 500, width: '100%' }}>
                <style>{`
                    .ag-theme-material .premium-user-blue {
                        background-color: #e3f2fd !important;
                    }
                    .ag-theme-material .regular-user-white {
                        background-color: #ffffff !important;
                    }
                    .ag-theme-material .ag-row-hover.premium-user-blue {
                        background-color: #bbdefb !important;
                    }
                    .ag-theme-material .ag-row-hover.regular-user-white {
                        background-color: #f5f5f5 !important;
                    }
                `}</style>
                <AgGridReact
                    className="ag-theme-material"
                    columnDefs={columnDefs}
                    rowData={rowData}
                    pagination={gridConfig.getPagination()}
                    paginationPageSize={gridConfig.getPagesize()}
                    rowSelection={gridConfig.getRowselection()}
                    onRowSelected={handleRowSelected}
                    getRowClass={getRowClass}
                    domLayout="normal"
                />
            </Box>
        );
    };

    /**
     * Render tabs component
     */
    const renderTabs = (component: Component) => {
        const tabConfig = component.getTabconfig();
        if (!tabConfig) return null;

        const tabs = tabConfig.getTabsList();
        const serverActiveTab = tabConfig.getActivetab();

        // Use server-specified active tab if provided
        const currentTab = serverActiveTab >= 0 ? serverActiveTab : activeTab;

        return (
            <Box sx={{ width: '100%' }}>
                <Tabs value={currentTab} onChange={handleTabChange}>
                    {tabs.map((tab, index) => (
                        <Tab key={tab.getId()} label={tab.getLabel()} />
                    ))}
                </Tabs>
                {tabs.map((tab, index) => (
                    <Box
                        key={tab.getId()}
                        role="tabpanel"
                        hidden={currentTab !== index}
                        sx={{ p: 3 }}
                    >
                        {currentTab === index && renderComponents(tab.getContentList())}
                    </Box>
                ))}
            </Box>
        );
    };

    /**
     * Render components recursively
     */
    const renderComponents = (components: Component[]): React.ReactNode => {
        return components.map((component, index) => {
            const props = component.getPropsMap();

            switch (component.getType()) {
                case ComponentType.CONTAINER:
                    return (
                        <Box
                            key={component.getId() || index}
                            sx={{
                                padding: props.get('padding') || '0',
                                margin: props.get('margin') || '0',
                            }}
                        >
                            {renderComponents(component.getChildrenList())}
                        </Box>
                    );

                case ComponentType.AG_GRID:
                    return (
                        <Box key={component.getId() || index}>
                            {renderAGGrid(component)}
                        </Box>
                    );

                case ComponentType.TABS:
                    return (
                        <Box key={component.getId() || index}>
                            {renderTabs(component)}
                        </Box>
                    );

                case ComponentType.TEXT:
                    return (
                        <Box
                            key={component.getId() || index}
                            component="div"
                            sx={{
                                typography: props.get('variant') || 'body1',
                                mb: 2
                            }}
                        >
                            {props.get('text')}
                        </Box>
                    );

                case ComponentType.BUTTON:
                    // Button rendering would go here
                    return null;

                default:
                    return null;
            }
        });
    };

    if (!layout) {
        return <Box sx={{ p: 3 }}>Loading...</Box>;
    }

    return (
        <ThemeProvider theme={theme}>
            <Box sx={{ width: '100%', minHeight: '100vh', bgcolor: 'background.default' }}>
                {renderComponents(layout.components)}
            </Box>
        </ThemeProvider>
    );
};

export default LayoutManager;
