import React, { useState, useEffect, useCallback } from 'react';
import { WebSocketClient } from '../../services/WebSocketClient';
import { MessageHandler } from '../../services/MessageHandler';
import { EventDispatcher } from '../../services/EventDispatcher';

interface Column {
    id: string;
    label: string;
    sortable: boolean;
}

interface GridRow {
    id: string;
    cells: Record<string, any>;
}

interface ServerSideGridProps {
    gridId: string;
    columns: Column[];
    sessionId: string;
    wsClient: WebSocketClient;
    eventDispatcher: EventDispatcher;
    pageSize?: number;
}

const ServerSideGrid: React.FC<ServerSideGridProps> = ({
    gridId,
    columns,
    sessionId,
    wsClient,
    eventDispatcher,
    pageSize = 50
}) => {
    const [data, setData] = useState<GridRow[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
    const [loading, setLoading] = useState(false);

    const messageHandler = new MessageHandler(eventDispatcher);

    useEffect(() => {
        wsClient.subscribe(`/topic/grid/${gridId}`, (update: any) => {
            messageHandler.handleGridUpdate(gridId, update);
            setData(update.rows || []);
            setTotalCount(update.totalCount || 0);
        });

        // Initial data fetch
        fetchPage(0);

        return () => {
            wsClient.unsubscribe(`/topic/grid/${gridId}`);
        };
    }, [gridId]);

    const fetchPage = useCallback((page: number) => {
        setLoading(true);
        wsClient.send('/app/action', {
            actionType: 'GRID_FETCH',
            gridId,
            page,
            pageSize,
            sortField,
            sortDirection,
            sessionId
        });
        setCurrentPage(page);
    }, [wsClient, gridId, pageSize, sortField, sortDirection, sessionId]);

    const handleSort = useCallback((columnId: string) => {
        const newDirection = sortField === columnId && sortDirection === 'ASC' ? 'DESC' : 'ASC';
        setSortField(columnId);
        setSortDirection(newDirection);

        wsClient.send('/app/action', {
            actionType: 'GRID_SORT',
            gridId,
            sortField: columnId,
            sortDirection: newDirection,
            sessionId
        });

        eventDispatcher.dispatch('SERVER_SORT', { gridId, columnId, direction: newDirection });
    }, [wsClient, gridId, sortField, sortDirection, sessionId, eventDispatcher]);

    const handleCellEdit = useCallback((rowId: string, column: string, value: any) => {
        wsClient.send('/app/action', {
            actionType: 'GRID_EDIT',
            gridId,
            rowId,
            column,
            value,
            sessionId
        });
        eventDispatcher.dispatch('SERVER_CELL_EDIT', { gridId, rowId, column, value });
    }, [wsClient, gridId, sessionId, eventDispatcher]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <div className="server-side-grid" data-grid-id={gridId}>
            {loading && <div className="grid-loading">Loading...</div>}
            <table>
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th
                                key={col.id}
                                onClick={() => col.sortable && handleSort(col.id)}
                            >
                                {col.label}
                                {sortField === col.id && (sortDirection === 'ASC' ? ' ▲' : ' ▼')}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map(row => (
                        <tr key={row.id}>
                            {columns.map(col => (
                                <td key={col.id}>{row.cells[col.id]}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="pagination">
                <button onClick={() => fetchPage(currentPage - 1)} disabled={currentPage === 0}>
                    Previous
                </button>
                <span>Page {currentPage + 1} of {totalPages}</span>
                <button onClick={() => fetchPage(currentPage + 1)} disabled={currentPage >= totalPages - 1}>
                    Next
                </button>
            </div>
        </div>
    );
};

export default ServerSideGrid;
