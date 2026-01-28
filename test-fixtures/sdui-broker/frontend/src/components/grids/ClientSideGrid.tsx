/**
 * Client-Side AG Grid Component
 *
 * Supports 3 row styling patterns:
 * - Pattern A1: Class-based (CSS classes from server)
 * - Pattern A2: Color-based (direct colors from server)
 * - Pattern A3: Rule-based (conditional rules from server)
 */

import React, { useMemo, useCallback } from 'react';
import { Box } from '@mui/material';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, RowSelectedEvent, RowClassParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-material.css';
import { Component, EventType, GridConfig, RowStyleRule } from '../../broker/types';

interface ClientSideGridProps {
    component: Component;
    sendEvent: (eventType: string, componentId: string, data: Record<string, string>) => void;
}

export const ClientSideGrid: React.FC<ClientSideGridProps> = ({ component, sendEvent }) => {
    const gridConfig = component.gridConfig as GridConfig;

    if (!gridConfig) {
        return <div>Invalid grid configuration</div>;
    }

    // Convert proto columns to AG Grid columns
    const columnDefs: ColDef[] = useMemo(() => {
        return gridConfig.columns.map(col => ({
            field: col.field,
            headerName: col.headerName,
            sortable: col.sortable,
            filter: col.filterable,
            width: col.width,
            editable: col.editable || false
        }));
    }, [gridConfig.columns]);

    // Convert proto rows to AG Grid row data
    const rowData = useMemo(() => {
        if (!gridConfig.rows) {return [];}

        return gridConfig.rows.map(row => {
            const data: any = { id: row.id };

            // Copy all data fields
            Object.entries(row.data).forEach(([key, value]) => {
                data[key] = value;
            });

            // Store styling info
            data._rowClass = row.rowClass;
            data._rowColor = row.rowColor;

            return data;
        });
    }, [gridConfig.rows]);

    /**
     * Get row class based on styling pattern
     * Supports all 3 patterns: CLASS_BASED, COLOR_BASED, RULE_BASED
     */
    const getRowClass = useCallback((params: RowClassParams) => {
        const { data } = params;
        if (!data) {return '';}

        const styleMode = gridConfig.rowStyleMode;

        switch (styleMode) {
            case 'CLASS_BASED':
                // Pattern A1: Use CSS class from server
                console.log('Pattern A1: Applying row class:', data._rowClass);
                return data._rowClass || '';

            case 'COLOR_BASED':
                // Pattern A2: Direct color applied via getRowStyle
                // Return empty class, styling done in getRowStyle
                console.log('Pattern A2: Row color will be applied:', data._rowColor);
                return '';

            case 'RULE_BASED':
                // Pattern A3: Evaluate conditional rules
                return evaluateRowRules(data, gridConfig.rowStyleRules || []);

            default:
                return '';
        }
    }, [gridConfig.rowStyleMode, gridConfig.rowStyleRules]);

    /**
     * Get row style for color-based pattern
     */
    const getRowStyle = useCallback((params: any) => {
        const { data } = params;
        if (!data) {return {};}

        if (gridConfig.rowStyleMode === 'COLOR_BASED' && data._rowColor) {
            // Pattern A2: Direct color application
            return { backgroundColor: data._rowColor };
        }

        return {};
    }, [gridConfig.rowStyleMode]);

    /**
     * Pattern A3: Evaluate conditional rules
     */
    const evaluateRowRules = (data: any, rules: RowStyleRule[]): string => {
        for (const rule of rules) {
            try {
                // Simple condition evaluation (in production, use safer eval)
                const condition = rule.condition.replace(/(\w+)/g, (match) => {
                    return `data.${match}`;
                });

                // eslint-disable-next-line no-eval
                if (eval(condition)) {
                    console.log('Pattern A3: Rule matched:', rule.condition, '-> class:', rule.className);
                    return rule.className;
                }
            } catch (err) {
                console.error('Failed to evaluate rule:', rule.condition, err);
            }
        }
        return '';
    };

    /**
     * Handle row selection
     * Sends ROW_SELECTED event to server
     */
    const handleRowSelected = useCallback((event: RowSelectedEvent) => {
        if (event.node.isSelected()) {
            const rowData = event.data;
            console.log('Row selected:', rowData.id);

            sendEvent(EventType.ROW_SELECTED, component.id, {
                rowId: rowData.id,
                ...rowData
            });
        }
    }, [component.id, sendEvent]);

    /**
     * Handle cell value change (for editable grids)
     */
    const handleCellValueChanged = useCallback((event: any) => {
        const { data, colDef, newValue, oldValue } = event;

        console.log(`Cell edited: ${colDef.field}, ${oldValue} -> ${newValue}`);

        sendEvent(EventType.ROW_EDITED, component.id, {
            rowId: data.id,
            field: colDef.field,
            oldValue,
            newValue
        });
    }, [component.id, sendEvent]);

    return (
        <Box sx={{ height: 500, width: '100%', mb: 2 }}>
            {/* CSS for Pattern A1: Class-based styling */}
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
                pagination={gridConfig.pagination}
                paginationPageSize={gridConfig.pageSize || 10}
                rowSelection={gridConfig.mode === 'CLIENT_SIDE' ? 'single' : undefined}
                onRowSelected={handleRowSelected}
                onCellValueChanged={handleCellValueChanged}
                getRowClass={getRowClass}
                getRowStyle={getRowStyle}
                domLayout="normal"
                animateRows={true}
            />
        </Box>
    );
};
