import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent, RowClassParams, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { orderService } from '../services/OrderService';
import { Order, OrderStatus } from '../models/Order';

/**
 * AG Grid component for order management.
 * Implements complex conditional row coloring based on order status and payment state.
 * BLUE rows: Paid orders
 * WHITE rows: Pending orders
 * Additional color coding for different states.
 */
export const OrderGrid: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [selectedOrders, setSelectedOrders] = useState<Order[]>([]);

    /**
     * Loads orders on component mount.
     */
    useEffect(() => {
        fetchOrders();
    }, []);

    /**
     * Fetches all orders from the backend.
     */
    const fetchOrders = async () => {
        try {
            setLoading(true);
            const data = await orderService.getAllOrders();
            setOrders(data);
        } catch (error) {
            console.error('Failed to fetch orders:', error);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Custom cell renderer for order status with colored badges.
     */
    const StatusCellRenderer = (props: ICellRendererParams) => {
        const status = props.value as OrderStatus;

        const getStatusColor = (): string => {
            switch (status) {
                case 'PAID':
                    return '#28a745';
                case 'PENDING':
                    return '#ffc107';
                case 'CANCELLED':
                    return '#dc3545';
                case 'COMPLETED':
                    return '#17a2b8';
                case 'PAYMENT_FAILED':
                    return '#ff6b6b';
                default:
                    return '#6c757d';
            }
        };

        return (
            <span
                style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    backgroundColor: getStatusColor(),
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '12px'
                }}
            >
                {status}
            </span>
        );
    };

    /**
     * Custom cell renderer for total amount with currency formatting.
     */
    const AmountCellRenderer = (props: ICellRendererParams) => {
        const amount = props.value as number;

        return (
            <span style={{
                fontWeight: 'bold',
                color: amount > 1000 ? '#28a745' : '#333'
            }}>
                ${amount.toFixed(2)}
            </span>
        );
    };

    /**
     * Column definitions for the order grid.
     */
    const columnDefs = useMemo<ColDef[]>(() => [
        {
            field: 'id',
            headerName: 'Order ID',
            width: 100,
            filter: 'agNumberColumnFilter',
            sortable: true,
            checkboxSelection: true,
            headerCheckboxSelection: true
        },
        {
            field: 'userId',
            headerName: 'User ID',
            width: 100,
            filter: 'agNumberColumnFilter',
            sortable: true
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 150,
            filter: 'agSetColumnFilter',
            sortable: true,
            cellRenderer: StatusCellRenderer
        },
        {
            field: 'totalAmount',
            headerName: 'Amount',
            width: 130,
            filter: 'agNumberColumnFilter',
            sortable: true,
            cellRenderer: AmountCellRenderer
        },
        {
            field: 'createdAt',
            headerName: 'Order Date',
            width: 150,
            filter: 'agDateColumnFilter',
            sortable: true,
            valueFormatter: (params) => {
                return new Date(params.value).toLocaleString();
            }
        },
        {
            field: 'paidAt',
            headerName: 'Paid At',
            width: 150,
            filter: 'agDateColumnFilter',
            sortable: true,
            valueFormatter: (params) => {
                return params.value ? new Date(params.value).toLocaleString() : 'N/A';
            }
        },
        {
            headerName: 'Actions',
            width: 150,
            cellRenderer: (params: ICellRendererParams) => {
                const order = params.data as Order;

                return (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {order.status === 'PENDING' && (
                            <button
                                onClick={() => handleProcessPayment(order.id)}
                                style={{
                                    padding: '4px 8px',
                                    backgroundColor: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                Pay
                            </button>
                        )}
                        {(order.status === 'PENDING' || order.status === 'PAID') && (
                            <button
                                onClick={() => handleCancelOrder(order.id)}
                                style={{
                                    padding: '4px 8px',
                                    backgroundColor: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                );
            }
        }
    ], []);

    /**
     * Default column configuration.
     */
    const defaultColDef = useMemo<ColDef>(() => ({
        resizable: true,
        sortable: true,
        filter: true,
    }), []);

    /**
     * Determines row styling based on order status and payment state.
     *
     * Color scheme:
     * - BLUE (#e3f2fd): Paid orders (status === 'PAID')
     * - WHITE (#ffffff): Pending orders (status === 'PENDING')
     * - LIGHT GREEN (#e8f5e9): Completed orders (status === 'COMPLETED')
     * - LIGHT RED (#ffebee): Failed/Cancelled orders
     * - LIGHT YELLOW (#fffde7): Payment in progress
     */
    const getRowStyle = useCallback((params: RowClassParams): any => {
        const order = params.data as Order;

        // Blue background for paid orders
        if (order.status === 'PAID') {
            return {
                backgroundColor: '#e3f2fd',
                borderLeft: '4px solid #2196f3'
            };
        }

        // Light green for completed orders
        if (order.status === 'COMPLETED') {
            return {
                backgroundColor: '#e8f5e9',
                borderLeft: '4px solid #4caf50'
            };
        }

        // Light red for cancelled or failed orders
        if (order.status === 'CANCELLED' || order.status === 'PAYMENT_FAILED') {
            return {
                backgroundColor: '#ffebee',
                borderLeft: '4px solid #f44336',
                opacity: 0.8
            };
        }

        // Light yellow for processing
        if (order.status === 'PROCESSING') {
            return {
                backgroundColor: '#fffde7',
                borderLeft: '4px solid #ffeb3b'
            };
        }

        // White (default) for pending orders
        return {
            backgroundColor: '#ffffff',
            borderLeft: '4px solid #e0e0e0'
        };
    }, []);

    /**
     * Applies CSS classes to rows for additional styling.
     */
    const getRowClass = useCallback((params: RowClassParams): string => {
        const order = params.data as Order;
        const classes: string[] = [];

        if (order.status === 'PAID') {
            classes.push('paid-order-row');
        }

        if (order.totalAmount > 5000) {
            classes.push('high-value-order');
        }

        if (order.status === 'CANCELLED') {
            classes.push('cancelled-order-row');
        }

        return classes.join(' ');
    }, []);

    /**
     * Handles grid ready event.
     */
    const onGridReady = (params: GridReadyEvent) => {
        params.api.sizeColumnsToFit();
    };

    /**
     * Handles row selection changes.
     */
    const onSelectionChanged = (event: any) => {
        const selected = event.api.getSelectedRows();
        setSelectedOrders(selected);
    };

    /**
     * Handles payment processing for an order.
     */
    const handleProcessPayment = async (orderId: number) => {
        try {
            await orderService.processPayment(orderId, 'CARD');
            await fetchOrders(); // Refresh grid
        } catch (error) {
            console.error('Payment processing failed:', error);
            alert('Payment processing failed');
        }
    };

    /**
     * Handles order cancellation.
     */
    const handleCancelOrder = async (orderId: number) => {
        if (window.confirm('Are you sure you want to cancel this order?')) {
            try {
                await orderService.cancelOrder(orderId);
                await fetchOrders(); // Refresh grid
            } catch (error) {
                console.error('Order cancellation failed:', error);
                alert('Failed to cancel order');
            }
        }
    };

    /**
     * Handles bulk operations on selected orders.
     */
    const handleBulkCancel = async () => {
        if (selectedOrders.length === 0) {
            alert('No orders selected');
            return;
        }

        if (window.confirm(`Cancel ${selectedOrders.length} selected orders?`)) {
            try {
                for (const order of selectedOrders) {
                    await orderService.cancelOrder(order.id);
                }
                await fetchOrders();
            } catch (error) {
                console.error('Bulk cancellation failed:', error);
            }
        }
    };

    return (
        <div className="order-grid-container">
            <div className="grid-header">
                <h2>Order Management</h2>
                <div className="header-actions">
                    {selectedOrders.length > 0 && (
                        <button onClick={handleBulkCancel} className="bulk-action-btn">
                            Cancel {selectedOrders.length} Orders
                        </button>
                    )}
                    <button onClick={fetchOrders} disabled={loading} className="refresh-btn">
                        {loading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>
            </div>

            <div
                className="ag-theme-alpine"
                style={{ height: '600px', width: '100%' }}
            >
                <AgGridReact
                    rowData={orders}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    getRowStyle={getRowStyle}
                    getRowClass={getRowClass}
                    onGridReady={onGridReady}
                    onSelectionChanged={onSelectionChanged}
                    rowSelection="multiple"
                    animateRows={true}
                    pagination={true}
                    paginationPageSize={25}
                    suppressRowClickSelection={true}
                />
            </div>

            <style>{`
                .paid-order-row {
                    font-weight: 500;
                }

                .high-value-order {
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .cancelled-order-row {
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

                .header-actions {
                    display: flex;
                    gap: 0.5rem;
                }

                .grid-header h2 {
                    margin: 0;
                    color: #333;
                }

                .bulk-action-btn,
                .refresh-btn {
                    padding: 0.5rem 1rem;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                }

                .bulk-action-btn {
                    background-color: #dc3545;
                }

                .bulk-action-btn:hover {
                    background-color: #c82333;
                }

                .refresh-btn {
                    background-color: #0d6efd;
                }

                .refresh-btn:hover {
                    background-color: #0b5ed7;
                }

                .refresh-btn:disabled {
                    background-color: #6c757d;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};
