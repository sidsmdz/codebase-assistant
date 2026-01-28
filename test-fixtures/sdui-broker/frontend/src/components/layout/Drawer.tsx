/**
 * Drawer Component - Supports 3 opening patterns
 *
 * Pattern B1: Action-based (via UI_ACTION message)
 * Pattern B2: Render-based (via isOpen prop in UI_RENDER)
 * Pattern B3: State-based (via STATE_SYNC message)
 */

import React, { useEffect } from 'react';
import {
    Drawer as MuiDrawer,
    Box,
    IconButton,
    Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Component, DrawerConfig, EventType } from '../../broker/types';

interface DrawerProps {
    component: Component;
    sendEvent: (eventType: string, componentId: string, data: Record<string, string>) => void;
    drawerState?: boolean; // From Pattern B1 or B3
    onDrawerChange?: (isOpen: boolean) => void;
}

export const Drawer: React.FC<DrawerProps> = ({
    component,
    sendEvent,
    drawerState,
    onDrawerChange
}) => {
    const config = component.drawerConfig as DrawerConfig;

    if (!config) {
        return <div>Invalid drawer configuration</div>;
    }

    // Determine drawer open state based on pattern
    const isOpen = getDrawerOpenState(config, drawerState);

    useEffect(() => {
        // Log which pattern is being used
        if (config.openMode) {
            console.log(`Drawer ${component.id} using pattern: ${config.openMode}`);
        }

        // Pattern B2: Render-based - notify when drawer opens via render
        if (config.openMode === 'RENDER_BASED' && config.isOpen) {
            console.log('Pattern B2: Drawer opened via UI_RENDER');
            sendEvent(EventType.DRAWER_OPENED, component.id, {
                openMode: 'RENDER_BASED'
            });
        }
    }, [config.openMode, config.isOpen, component.id]);

    /**
     * Handle drawer close
     */
    const handleClose = () => {
        console.log(`Closing drawer: ${component.id}`);

        // Notify server
        sendEvent(EventType.DRAWER_CLOSED, component.id, {});

        // Update local state
        if (onDrawerChange) {
            onDrawerChange(false);
        }
    };

    /**
     * Render drawer content (children components)
     */
    const renderContent = () => {
        if (!component.children || component.children.length === 0) {
            return (
                <Box sx={{ p: 2 }}>
                    <Typography>No content</Typography>
                </Box>
            );
        }

        // Would recursively render children components here
        return (
            <Box sx={{ p: 2 }}>
                {component.children.map((child, idx) => (
                    <Box key={child.id || idx} sx={{ mb: 2 }}>
                        <Typography>{child.props?.text || 'Content'}</Typography>
                    </Box>
                ))}
            </Box>
        );
    };

    return (
        <MuiDrawer
            anchor={config.position.toLowerCase() as 'left' | 'right' | 'top' | 'bottom'}
            open={isOpen}
            onClose={config.closeOnBackdrop !== false ? handleClose : undefined}
        >
            <Box
                sx={{
                    width: config.position === 'LEFT' || config.position === 'RIGHT'
                        ? config.width
                        : '100%',
                    minHeight: config.position === 'TOP' || config.position === 'BOTTOM'
                        ? config.width
                        : '100%'
                }}
            >
                {/* Header with close button */}
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 2,
                        borderBottom: 1,
                        borderColor: 'divider'
                    }}
                >
                    <Typography variant="h6">{component.props?.title || 'Drawer'}</Typography>
                    <IconButton onClick={handleClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>

                {/* Content */}
                {renderContent()}

                {/* Debug info */}
                <Box sx={{ p: 2, bgcolor: 'grey.100', fontSize: '0.75rem' }}>
                    <Typography variant="caption">
                        Pattern: {config.openMode || 'UNKNOWN'}
                    </Typography>
                </Box>
            </Box>
        </MuiDrawer>
    );
};

/**
 * Determine drawer open state based on pattern
 */
function getDrawerOpenState(config: DrawerConfig, drawerState?: boolean): boolean {
    switch (config.openMode) {
        case 'ACTION_BASED':
            // Pattern B1: Use state from UI_ACTION handler
            return drawerState || false;

        case 'RENDER_BASED':
            // Pattern B2: Use isOpen from config
            return config.isOpen || false;

        case 'STATE_BASED':
            // Pattern B3: Use state from STATE_SYNC handler
            return drawerState || false;

        default:
            // Fallback to config or state
            return config.isOpen || drawerState || false;
    }
}
