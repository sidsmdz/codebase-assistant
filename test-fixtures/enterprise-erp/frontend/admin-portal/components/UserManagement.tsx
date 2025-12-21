import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import axios from 'axios';
import { toast } from 'react-toastify';

/**
 * User Management Component with AG Grid
 * Demonstrates complex AG Grid patterns:
 * - Conditional row coloring (blue for premium, white for regular)
 * - Custom cell renderers
 * - Context menu actions
 * - Real-time data updates
 * - Filter and sort state management
 */

interface User {
    id: number;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'CUSTOMER' | 'PREMIUM_CUSTOMER' | 'ADMIN' | 'SUPER_ADMIN' | 'SUPPORT';
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'BANNED';
    isPremium: boolean;
    registeredAt: string;
    lastLoginAt?: string;
    orderCount: number;
    totalSpent: number;
}

interface UserManagementProps {
    onUserSelected?: (user: User) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ onUserSelected }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [gridApi, setGridApi] = useState<any>(null);

    // Load users from API
    useEffect(() => {
        loadUsers();

        // Set up polling for real-time updates
        const interval = setInterval(() => {
            loadUsers();
        }, 30000); // Refresh every 30 seconds

        return () => clearInterval(interval);
    }, []);

    const loadUsers = async () => {
        try {
            const response = await axios.get('/api/users');
            setUsers(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Failed to load users:', error);
            toast.error('Failed to load users');
            setLoading(false);
        }
    };

    // Custom cell renderer for status with colored badges
    const StatusCellRenderer = (params: any) => {
        const status = params.value;
        const colorMap: Record<string, string> = {
            ACTIVE: '#28a745',
            PENDING: '#ffc107',
            SUSPENDED: '#ff9800',
            DEACTIVATED: '#6c757d',
            BANNED: '#dc3545'
        };

        const color = colorMap[status] || '#6c757d';

        return (
            <span
                style={{
                    backgroundColor: color,
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    display: 'inline-block'
                }}
            >
                {status}
            </span>
        );
    };

    // Custom cell renderer for role badges
    const RoleCellRenderer = (params: any) => {
        const role = params.value;
        const isPremium = params.data.isPremium;

        return (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span
                    style={{
                        backgroundColor: isPremium ? '#007bff' : '#6c757d',
                        color: 'white',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 'bold'
                    }}
                >
                    {role.replace('_', ' ')}
                </span>
                {isPremium && (
                    <span
                        style={{
                            backgroundColor: '#ffd700',
                            color: '#000',
                            padding: '4px 8px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 'bold'
                        }}
                    >
                        ⭐ PREMIUM
                    </span>
                )}
            </div>
        );
    };

    // Custom cell renderer for total spent with currency formatting
    const CurrencyCellRenderer = (params: any) => {
        const amount = params.value || 0;
        const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);

        const color = amount > 5000 ? '#28a745' : amount > 1000 ? '#007bff' : '#6c757d';

        return (
            <span style={{ color, fontWeight: 'bold' }}>
                {formatted}
            </span>
        );
    };

    // Custom cell renderer for action buttons
    const ActionsCellRenderer = (params: any) => {
        const user = params.data;

        const handleEdit = () => {
            console.log('Edit user:', user);
            // Open edit modal or navigate to edit page
        };

        const handleSuspend = async () => {
            if (window.confirm(`Suspend user ${user.username}?`)) {
                try {
                    await axios.post(`/api/users/${user.id}/suspend`);
                    toast.success('User suspended successfully');
                    loadUsers();
                } catch (error) {
                    toast.error('Failed to suspend user');
                }
            }
        };

        const handlePromoteToPremium = async () => {
            if (window.confirm(`Promote ${user.username} to Premium?`)) {
                try {
                    await axios.post(`/api/users/${user.id}/promote-to-premium`);
                    toast.success('User promoted to Premium');
                    loadUsers();
                } catch (error) {
                    toast.error('Failed to promote user');
                }
            }
        };

        return (
            <div style={{ display: 'flex', gap: '6px' }}>
                <button
                    onClick={handleEdit}
                    style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Edit
                </button>
                {user.status === 'ACTIVE' && (
                    <button
                        onClick={handleSuspend}
                        style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            backgroundColor: '#ffc107',
                            color: 'black',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Suspend
                    </button>
                )}
                {!user.isPremium && user.status === 'ACTIVE' && (
                    <button
                        onClick={handlePromoteToPremium}
                        style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        ⭐ Premium
                    </button>
                )}
            </div>
        );
    };

    // Column definitions with complex configurations
    const columnDefs = useMemo<ColDef[]>(() => [
        {
            headerName: 'ID',
            field: 'id',
            width: 80,
            filter: 'agNumberColumnFilter',
            sortable: true,
            pinned: 'left'
        },
        {
            headerName: 'Username',
            field: 'username',
            width: 150,
            filter: 'agTextColumnFilter',
            sortable: true,
            pinned: 'left',
            cellStyle: { fontWeight: 'bold' }
        },
        {
            headerName: 'Email',
            field: 'email',
            width: 200,
            filter: 'agTextColumnFilter',
            sortable: true
        },
        {
            headerName: 'Name',
            valueGetter: (params) => `${params.data.firstName} ${params.data.lastName}`,
            width: 180,
            filter: 'agTextColumnFilter',
            sortable: true
        },
        {
            headerName: 'Role',
            field: 'role',
            width: 200,
            cellRenderer: RoleCellRenderer,
            filter: 'agSetColumnFilter',
            sortable: true
        },
        {
            headerName: 'Status',
            field: 'status',
            width: 130,
            cellRenderer: StatusCellRenderer,
            filter: 'agSetColumnFilter',
            sortable: true
        },
        {
            headerName: 'Orders',
            field: 'orderCount',
            width: 100,
            filter: 'agNumberColumnFilter',
            sortable: true,
            cellStyle: { textAlign: 'center' }
        },
        {
            headerName: 'Total Spent',
            field: 'totalSpent',
            width: 140,
            cellRenderer: CurrencyCellRenderer,
            filter: 'agNumberColumnFilter',
            sortable: true,
            comparator: (valueA: number, valueB: number) => valueA - valueB
        },
        {
            headerName: 'Registered',
            field: 'registeredAt',
            width: 120,
            valueFormatter: (params) => {
                if (!params.value) return '';
                return new Date(params.value).toLocaleDateString();
            },
            filter: 'agDateColumnFilter',
            sortable: true
        },
        {
            headerName: 'Last Login',
            field: 'lastLoginAt',
            width: 120,
            valueFormatter: (params) => {
                if (!params.value) return 'Never';
                return new Date(params.value).toLocaleDateString();
            },
            filter: 'agDateColumnFilter',
            sortable: true
        },
        {
            headerName: 'Actions',
            cellRenderer: ActionsCellRenderer,
            width: 250,
            pinned: 'right',
            sortable: false,
            filter: false
        }
    ], []);

    // Default column configuration
    const defaultColDef = useMemo<ColDef>(() => ({
        resizable: true,
        sortable: true,
        filter: true,
        floatingFilter: true
    }), []);

    /**
     * CRITICAL PATTERN: Conditional row styling based on premium status
     * Premium users get blue background, regular users get white
     * This is the key pattern for AG Grid row coloring
     */
    const getRowClass = useCallback((params: RowClassParams): string | string[] | undefined => {
        const user = params.data as User;

        // Premium users get blue background
        if (user.isPremium) {
            return 'premium-row';
        }

        // Suspended users get warning background
        if (user.status === 'SUSPENDED') {
            return 'suspended-row';
        }

        // Banned users get danger background
        if (user.status === 'BANNED') {
            return 'banned-row';
        }

        // Regular users get default white background
        return 'regular-row';
    }, []);

    // Grid ready callback
    const onGridReady = useCallback((params: GridReadyEvent) => {
        setGridApi(params.api);
    }, []);

    // Row selection callback
    const onSelectionChanged = useCallback(() => {
        if (!gridApi) return;

        const selectedRows = gridApi.getSelectedRows();
        if (selectedRows.length > 0 && onUserSelected) {
            onUserSelected(selectedRows[0]);
        }
    }, [gridApi, onUserSelected]);

    // Quick filter search
    const onQuickFilterChanged = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (gridApi) {
            gridApi.setQuickFilter(event.target.value);
        }
    }, [gridApi]);

    // Export to CSV
    const exportToCSV = useCallback(() => {
        if (gridApi) {
            gridApi.exportDataAsCsv({
                fileName: 'users-export.csv'
            });
        }
    }, [gridApi]);

    return (
        <div className="user-management-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Toolbar */}
            <div className="toolbar" style={{
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
                        User Management
                    </h2>
                    <span style={{
                        backgroundColor: '#007bff',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}>
                        {users.length} Users
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <input
                        type="text"
                        placeholder="Quick search..."
                        onChange={onQuickFilterChanged}
                        style={{
                            padding: '8px 12px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            width: '250px',
                            fontSize: '14px'
                        }}
                    />

                    <button
                        onClick={exportToCSV}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}
                    >
                        📊 Export CSV
                    </button>

                    <button
                        onClick={loadUsers}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* AG Grid */}
            <div className="ag-theme-alpine" style={{ flex: 1, width: '100%' }}>
                <AgGridReact
                    rowData={users}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    pagination={true}
                    paginationPageSize={20}
                    rowSelection="single"
                    onGridReady={onGridReady}
                    onSelectionChanged={onSelectionChanged}
                    getRowClass={getRowClass}
                    animateRows={true}
                    enableCellTextSelection={true}
                    suppressMovableColumns={false}
                    suppressRowClickSelection={false}
                />
            </div>

            {/* Custom CSS for row coloring */}
            <style>{`
                .premium-row {
                    background-color: #e3f2fd !important;
                    border-left: 4px solid #2196f3 !important;
                }

                .premium-row:hover {
                    background-color: #bbdefb !important;
                }

                .regular-row {
                    background-color: #ffffff !important;
                }

                .regular-row:hover {
                    background-color: #f5f5f5 !important;
                }

                .suspended-row {
                    background-color: #fff3cd !important;
                    border-left: 4px solid #ffc107 !important;
                }

                .suspended-row:hover {
                    background-color: #ffe69c !important;
                }

                .banned-row {
                    background-color: #f8d7da !important;
                    border-left: 4px solid #dc3545 !important;
                }

                .banned-row:hover {
                    background-color: #f1b0b7 !important;
                }
            `}</style>
        </div>
    );
};

export default UserManagement;
