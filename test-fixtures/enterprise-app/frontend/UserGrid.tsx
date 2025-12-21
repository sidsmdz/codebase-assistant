import React, { useState, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { userService } from '../services/UserService';
import { User } from '../models/User';

/**
 * AG Grid component for displaying and managing users.
 * Features conditional row coloring based on user status and activity.
 */
export const UserGrid: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    /**
     * Fetches users from backend on component mount.
     */
    useEffect(() => {
        loadUsers();
    }, []);

    /**
     * Loads users from the user service.
     */
    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await userService.getAllUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to load users:', error);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Column definitions for AG Grid.
     * Defines structure, formatters, and filters for each column.
     */
    const columnDefs = useMemo<ColDef[]>(() => [
        {
            field: 'id',
            headerName: 'ID',
            width: 80,
            filter: 'agNumberColumnFilter',
            sortable: true
        },
        {
            field: 'name',
            headerName: 'Name',
            width: 200,
            filter: 'agTextColumnFilter',
            sortable: true,
            editable: true
        },
        {
            field: 'email',
            headerName: 'Email',
            width: 250,
            filter: 'agTextColumnFilter',
            sortable: true,
            editable: true
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 120,
            filter: 'agSetColumnFilter',
            sortable: true,
            cellStyle: (params) => {
                // Color code status cells
                if (params.value === 'ACTIVE') {
                    return { backgroundColor: '#d4edda', color: '#155724' };
                } else if (params.value === 'INACTIVE') {
                    return { backgroundColor: '#f8d7da', color: '#721c24' };
                } else if (params.value === 'PENDING') {
                    return { backgroundColor: '#fff3cd', color: '#856404' };
                }
                return null;
            }
        },
        {
            field: 'createdAt',
            headerName: 'Created',
            width: 150,
            filter: 'agDateColumnFilter',
            sortable: true,
            valueFormatter: (params) => {
                return new Date(params.value).toLocaleDateString();
            }
        },
        {
            field: 'isActive',
            headerName: 'Active',
            width: 100,
            filter: 'agSetColumnFilter',
            cellRenderer: (params: any) => {
                return params.value ? '✓' : '✗';
            }
        }
    ], []);

    /**
     * Default column configuration applied to all columns.
     */
    const defaultColDef = useMemo<ColDef>(() => ({
        resizable: true,
        sortable: true,
        filter: true,
    }), []);

    /**
     * Determines row styling based on user properties.
     * BLUE rows: Premium users (status === 'PREMIUM')
     * WHITE rows: Regular users
     * RED tint: Inactive users
     */
    const getRowStyle = (params: RowClassParams): any => {
        const user = params.data as User;

        // Blue background for premium users
        if (user.status === 'PREMIUM') {
            return {
                backgroundColor: '#cfe2ff',
                fontWeight: 'bold'
            };
        }

        // Red tint for inactive users
        if (!user.isActive) {
            return {
                backgroundColor: '#ffe6e6',
                opacity: 0.7
            };
        }

        // White (default) for regular users
        return {
            backgroundColor: '#ffffff'
        };
    };

    /**
     * Applies CSS classes to rows based on conditions.
     */
    const getRowClass = (params: RowClassParams): string => {
        const user = params.data as User;

        if (user.status === 'PREMIUM') {
            return 'premium-user-row';
        }

        if (!user.isActive) {
            return 'inactive-user-row';
        }

        return '';
    };

    /**
     * Handles grid ready event.
     * Configures grid after initialization.
     */
    const onGridReady = (params: GridReadyEvent) => {
        // Auto-size all columns to fit content
        params.api.sizeColumnsToFit();
    };

    /**
     * Handles cell value changes when editing.
     */
    const onCellValueChanged = async (event: any) => {
        const updatedUser = event.data as User;

        try {
            await userService.updateUser(updatedUser.id, updatedUser);
            console.log('User updated successfully');
        } catch (error) {
            console.error('Failed to update user:', error);
            // Revert the change
            event.node.setData(event.oldValue);
        }
    };

    /**
     * Handles row selection for bulk operations.
     */
    const onSelectionChanged = (event: any) => {
        const selectedRows = event.api.getSelectedRows();
        console.log('Selected users:', selectedRows);
    };

    return (
        <div className="user-grid-container">
            <div className="grid-header">
                <h2>User Management</h2>
                <button onClick={loadUsers} disabled={loading}>
                    {loading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            <div
                className="ag-theme-alpine"
                style={{ height: '600px', width: '100%' }}
            >
                <AgGridReact
                    rowData={users}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    getRowStyle={getRowStyle}
                    getRowClass={getRowClass}
                    onGridReady={onGridReady}
                    onCellValueChanged={onCellValueChanged}
                    onSelectionChanged={onSelectionChanged}
                    rowSelection="multiple"
                    animateRows={true}
                    pagination={true}
                    paginationPageSize={20}
                />
            </div>

            <style>{`
                .premium-user-row {
                    border-left: 4px solid #0d6efd;
                }

                .inactive-user-row {
                    text-decoration: line-through;
                }

                .grid-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                    padding: 1rem;
                    background-color: #f8f9fa;
                    border-radius: 4px;
                }

                .grid-header h2 {
                    margin: 0;
                    color: #333;
                }

                .grid-header button {
                    padding: 0.5rem 1rem;
                    background-color: #0d6efd;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }

                .grid-header button:hover {
                    background-color: #0b5ed7;
                }

                .grid-header button:disabled {
                    background-color: #6c757d;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};
