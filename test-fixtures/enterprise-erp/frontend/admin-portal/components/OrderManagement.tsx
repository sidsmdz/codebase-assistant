import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent, RowClassParams, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import axios from 'axios';
import { toast } from 'react-toastify';

/**
 * Order Management Component with Advanced AG Grid Patterns
 * Demonstrates:
 * - Master-detail view with expandable rows
 * - Complex conditional styling (paid orders in green, pending in yellow, failed in red)
 * - Custom cell renderers with interactive elements
 * - Real-time status updates with WebSocket integration
 * - Advanced filtering and grouping
 */

interface OrderItem {
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
}

interface Order {
    id: number;
    orderNumber: string;
    userId: number;
    userName: string;
    userEmail: string;
    isPremiumUser: boolean;
    status: 'PENDING' | 'PROCESSING' | 'PAID' | 'PAYMENT_FAILED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
    items: OrderItem[];
    subtotal: number;
    tax: number;
    shippingCost: number;
    discount: number;
    total: number;
    paymentMethod?: string;
    trackingNumber?: string;
    orderedAt: string;
    shippedAt?: string;
    deliveredAt?: string;
    cancelledAt?: string;
}

interface OrderManagementProps {
    userId?: number;
    showAllOrders?: boolean;
}

const OrderManagement: React.FC<OrderManagementProps> = ({ userId, showAllOrders = true }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [gridApi, setGridApi] = useState<any>(null);
    const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

    useEffect(() => {
        loadOrders();

        // WebSocket connection for real-time updates
        const ws = new WebSocket('ws://localhost:8080/orders/updates');

        ws.onmessage = (event) => {
            const updatedOrder = JSON.parse(event.data);
            updateOrderInGrid(updatedOrder);
        };

        return () => {
            ws.close();
        };
    }, [userId, selectedStatus]);

    const loadOrders = async () => {
        try {
            const url = userId
                ? `/api/orders/user/${userId}`
                : '/api/orders';

            const params = selectedStatus !== 'ALL' ? { status: selectedStatus } : {};
            const response = await axios.get(url, { params });

            setOrders(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Failed to load orders:', error);
            toast.error('Failed to load orders');
            setLoading(false);
        }
    };

    const updateOrderInGrid = (updatedOrder: Order) => {
        setOrders(prevOrders =>
            prevOrders.map(order =>
                order.id === updatedOrder.id ? updatedOrder : order
            )
        );
    };

    // Custom status cell renderer with colored badges and icons
    const StatusCellRenderer = (params: ICellRendererParams) => {
        const status = params.value;

        const statusConfig: Record<string, { color: string; bgColor: string; icon: string }> = {
            PENDING: { color: '#000', bgColor: '#ffc107', icon: '⏳' },
            PROCESSING: { color: '#fff', bgColor: '#17a2b8', icon: '⚙️' },
            PAID: { color: '#fff', bgColor: '#28a745', icon: '✅' },
            PAYMENT_FAILED: { color: '#fff', bgColor: '#dc3545', icon: '❌' },
            SHIPPED: { color: '#fff', bgColor: '#007bff', icon: '🚚' },
            DELIVERED: { color: '#fff', bgColor: '#28a745', icon: '📦' },
            CANCELLED: { color: '#fff', bgColor: '#6c757d', icon: '🚫' },
            REFUNDED: { color: '#fff', bgColor: '#fd7e14', icon: '💰' }
        };

        const config = statusConfig[status] || { color: '#000', bgColor: '#ccc', icon: '?' };

        return (
            <span
                style={{
                    backgroundColor: config.bgColor,
                    color: config.color,
                    padding: '6px 14px',
                    borderRadius: '14px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                <span>{config.icon}</span>
                <span>{status.replace('_', ' ')}</span>
            </span>
        );
    };

    // Custom cell renderer for user info with premium badge
    const UserCellRenderer = (params: ICellRendererParams) => {
        const order = params.data as Order;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 'bold' }}>{order.userName}</span>
                    {order.isPremiumUser && (
                        <span
                            style={{
                                backgroundColor: '#ffd700',
                                color: '#000',
                                padding: '2px 6px',
                                borderRadius: '8px',
                                fontSize: '10px',
                                fontWeight: 'bold'
                            }}
                        >
                            ⭐ PREMIUM
                        </span>
                    )}
                </div>
                <span style={{ fontSize: '11px', color: '#6c757d' }}>{order.userEmail}</span>
            </div>
        );
    };

    // Custom cell renderer for order items count with expandable detail
    const ItemsCountCellRenderer = (params: ICellRendererParams) => {
        const order = params.data as Order;
        const itemCount = order.items.length;

        return (
            <span
                style={{
                    backgroundColor: '#e3f2fd',
                    color: '#1976d2',
                    padding: '4px 10px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                }}
                onClick={() => {
                    if (gridApi) {
                        const node = gridApi.getRowNode(order.id.toString());
                        if (node) {
                            node.setExpanded(!node.expanded);
                        }
                    }
                }}
            >
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
        );
    };

    // Custom cell renderer for total amount with color coding
    const TotalAmountCellRenderer = (params: ICellRendererParams) => {
        const amount = params.value || 0;
        const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);

        // Color code based on amount
        let color = '#6c757d';
        let fontWeight = 'normal';

        if (amount > 1000) {
            color = '#28a745';
            fontWeight = 'bold';
        } else if (amount > 500) {
            color = '#007bff';
            fontWeight = 'bold';
        }

        return (
            <span style={{ color, fontWeight, fontSize: '14px' }}>
                {formatted}
            </span>
        );
    };

    // Custom cell renderer for actions
    const ActionsCellRenderer = (params: ICellRendererParams) => {
        const order = params.data as Order;

        const handleProcessPayment = async () => {
            try {
                await axios.post(`/api/orders/${order.id}/process-payment`);
                toast.success('Payment processed successfully');
                loadOrders();
            } catch (error) {
                toast.error('Failed to process payment');
            }
        };

        const handleShipOrder = async () => {
            const trackingNumber = prompt('Enter tracking number:');
            if (trackingNumber) {
                try {
                    await axios.post(`/api/orders/${order.id}/ship`, { trackingNumber });
                    toast.success('Order marked as shipped');
                    loadOrders();
                } catch (error) {
                    toast.error('Failed to ship order');
                }
            }
        };

        const handleCancelOrder = async () => {
            const reason = prompt('Enter cancellation reason:');
            if (reason) {
                try {
                    await axios.post(`/api/orders/${order.id}/cancel`, { reason });
                    toast.success('Order cancelled');
                    loadOrders();
                } catch (error) {
                    toast.error('Failed to cancel order');
                }
            }
        };

        const handleRefund = async () => {
            if (window.confirm(`Refund order ${order.orderNumber}?`)) {
                try {
                    await axios.post(`/api/orders/${order.id}/refund`);
                    toast.success('Refund processed');
                    loadOrders();
                } catch (error) {
                    toast.error('Failed to process refund');
                }
            }
        };

        return (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {order.status === 'PENDING' && (
                    <button
                        onClick={handleProcessPayment}
                        style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        💳 Pay
                    </button>
                )}

                {order.status === 'PAID' && (
                    <button
                        onClick={handleShipOrder}
                        style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        🚚 Ship
                    </button>
                )}

                {(order.status === 'PENDING' || order.status === 'PROCESSING') && (
                    <button
                        onClick={handleCancelOrder}
                        style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        🚫 Cancel
                    </button>
                )}

                {order.status === 'PAID' && (
                    <button
                        onClick={handleRefund}
                        style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            backgroundColor: '#fd7e14',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        💰 Refund
                    </button>
                )}
            </div>
        );
    };

    // Column definitions
    const columnDefs = useMemo<ColDef[]>(() => [
        {
            headerName: 'Order #',
            field: 'orderNumber',
            width: 160,
            filter: 'agTextColumnFilter',
            sortable: true,
            pinned: 'left',
            cellStyle: { fontWeight: 'bold', fontFamily: 'monospace' }
        },
        {
            headerName: 'Customer',
            cellRenderer: UserCellRenderer,
            width: 250,
            filter: 'agTextColumnFilter',
            sortable: true,
            comparator: (valueA: any, valueB: any, nodeA: any, nodeB: any) => {
                return nodeA.data.userName.localeCompare(nodeB.data.userName);
            }
        },
        {
            headerName: 'Status',
            field: 'status',
            width: 150,
            cellRenderer: StatusCellRenderer,
            filter: 'agSetColumnFilter',
            sortable: true
        },
        {
            headerName: 'Items',
            cellRenderer: ItemsCountCellRenderer,
            width: 100,
            sortable: true,
            comparator: (valueA: any, valueB: any, nodeA: any, nodeB: any) => {
                return nodeA.data.items.length - nodeB.data.items.length;
            }
        },
        {
            headerName: 'Subtotal',
            field: 'subtotal',
            width: 120,
            valueFormatter: (params) => {
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                }).format(params.value);
            },
            filter: 'agNumberColumnFilter',
            sortable: true
        },
        {
            headerName: 'Total',
            field: 'total',
            width: 130,
            cellRenderer: TotalAmountCellRenderer,
            filter: 'agNumberColumnFilter',
            sortable: true
        },
        {
            headerName: 'Payment',
            field: 'paymentMethod',
            width: 130,
            valueFormatter: (params) => params.value || 'N/A',
            filter: 'agSetColumnFilter',
            sortable: true
        },
        {
            headerName: 'Ordered',
            field: 'orderedAt',
            width: 110,
            valueFormatter: (params) => {
                if (!params.value) return '';
                return new Date(params.value).toLocaleDateString();
            },
            filter: 'agDateColumnFilter',
            sortable: true
        },
        {
            headerName: 'Tracking',
            field: 'trackingNumber',
            width: 140,
            valueFormatter: (params) => params.value || '-',
            filter: 'agTextColumnFilter',
            sortable: true
        },
        {
            headerName: 'Actions',
            cellRenderer: ActionsCellRenderer,
            width: 200,
            pinned: 'right',
            sortable: false,
            filter: false
        }
    ], [gridApi]);

    const defaultColDef = useMemo<ColDef>(() => ({
        resizable: true,
        sortable: true,
        filter: true,
        floatingFilter: true
    }), []);

    /**
     * CRITICAL PATTERN: Complex conditional row styling
     * - PAID orders: Light green background
     * - PENDING/PROCESSING: Light yellow background
     * - PAYMENT_FAILED/CANCELLED: Light red background
     * - Premium user orders: Blue left border
     * - High value orders (>$1000): Gold left border
     */
    const getRowClass = useCallback((params: RowClassParams): string | string[] | undefined => {
        const order = params.data as Order;
        const classes: string[] = [];

        // Status-based coloring
        if (order.status === 'PAID' || order.status === 'DELIVERED') {
            classes.push('order-success');
        } else if (order.status === 'PENDING' || order.status === 'PROCESSING') {
            classes.push('order-pending');
        } else if (order.status === 'PAYMENT_FAILED' || order.status === 'CANCELLED') {
            classes.push('order-failed');
        } else if (order.status === 'SHIPPED') {
            classes.push('order-shipped');
        }

        // Premium user indicator
        if (order.isPremiumUser) {
            classes.push('premium-order');
        }

        // High value order indicator
        if (order.total > 1000) {
            classes.push('high-value-order');
        }

        return classes;
    }, []);

    // Detail cell renderer for order items
    const detailCellRenderer = useMemo(() => {
        return (props: any) => {
            const order = props.data as Order;

            return (
                <div style={{ padding: '20px', backgroundColor: '#f8f9fa' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '12px', color: '#495057' }}>
                        Order Items
                    </h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#e9ecef' }}>
                                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Product</th>
                                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Quantity</th>
                                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Unit Price</th>
                                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Discount</th>
                                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((item, index) => (
                                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                                    <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>
                                        {item.productName}
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                                        {item.quantity}
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>
                                        ${item.unitPrice.toFixed(2)}
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6', color: '#28a745' }}>
                                        {item.discount > 0 ? `-$${item.discount.toFixed(2)}` : '-'}
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6', fontWeight: 'bold' }}>
                                        ${item.subtotal.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ width: '300px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                                <span>Subtotal:</span>
                                <span>${order.subtotal.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                                <span>Tax:</span>
                                <span>${order.tax.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                                <span>Shipping:</span>
                                <span>${order.shippingCost.toFixed(2)}</span>
                            </div>
                            {order.discount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: '#28a745' }}>
                                    <span>Discount:</span>
                                    <span>-${order.discount.toFixed(2)}</span>
                                </div>
                            )}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '10px 0',
                                borderTop: '2px solid #dee2e6',
                                marginTop: '6px',
                                fontWeight: 'bold',
                                fontSize: '16px'
                            }}>
                                <span>Total:</span>
                                <span>${order.total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        };
    }, []);

    const onGridReady = useCallback((params: GridReadyEvent) => {
        setGridApi(params.api);
    }, []);

    const onQuickFilterChanged = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (gridApi) {
            gridApi.setQuickFilter(event.target.value);
        }
    }, [gridApi]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Toolbar */}
            <div style={{
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>Orders</h2>
                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #ced4da' }}
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="PAID">Paid</option>
                        <option value="SHIPPED">Shipped</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>

                <input
                    type="text"
                    placeholder="Search orders..."
                    onChange={onQuickFilterChanged}
                    style={{
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        width: '250px'
                    }}
                />
            </div>

            {/* Grid */}
            <div className="ag-theme-alpine" style={{ flex: 1 }}>
                <AgGridReact
                    rowData={orders}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    pagination={true}
                    paginationPageSize={15}
                    onGridReady={onGridReady}
                    getRowClass={getRowClass}
                    masterDetail={true}
                    detailCellRenderer={detailCellRenderer}
                    detailRowHeight={400}
                    animateRows={true}
                />
            </div>

            {/* Custom CSS */}
            <style>{`
                .order-success {
                    background-color: #d4edda !important;
                }

                .order-pending {
                    background-color: #fff3cd !important;
                }

                .order-failed {
                    background-color: #f8d7da !important;
                }

                .order-shipped {
                    background-color: #d1ecf1 !important;
                }

                .premium-order {
                    border-left: 4px solid #007bff !important;
                }

                .high-value-order {
                    border-right: 4px solid #ffd700 !important;
                }
            `}</style>
        </div>
    );
};

export default OrderManagement;
