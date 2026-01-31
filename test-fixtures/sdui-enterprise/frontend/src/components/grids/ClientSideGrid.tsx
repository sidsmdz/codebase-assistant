import React, { useState, useMemo, useCallback } from 'react';
import { GridSortStrategy } from '../../strategies/GridSortStrategy';
import { EventDispatcher } from '../../services/EventDispatcher';

interface Column {
    id: string;
    label: string;
    sortable: boolean;
    type: 'string' | 'number' | 'date';
}

interface GridRow {
    id: string;
    cells: Record<string, any>;
}

interface ClientSideGridProps {
    gridId: string;
    columns: Column[];
    data: GridRow[];
    onCellEdit?: (rowId: string, column: string, value: any) => void;
    eventDispatcher: EventDispatcher;
}

const ClientSideGrid: React.FC<ClientSideGridProps> = ({
    gridId,
    columns,
    data,
    onCellEdit,
    eventDispatcher
}) => {
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
    const [editingCell, setEditingCell] = useState<{ rowId: string; column: string } | null>(null);

    const sortStrategy = useMemo(() => new GridSortStrategy(), []);

    const sortedData = useMemo(() => {
        if (!sortField) return data;
        const column = columns.find(c => c.id === sortField);
        if (!column) return data;
        return sortStrategy.sort(data, sortField, sortDirection, column.type);
    }, [data, sortField, sortDirection, sortStrategy, columns]);

    const handleSort = useCallback((columnId: string) => {
        if (sortField === columnId) {
            setSortDirection(prev => prev === 'ASC' ? 'DESC' : 'ASC');
        } else {
            setSortField(columnId);
            setSortDirection('ASC');
        }
        eventDispatcher.dispatch('GRID_SORT', { gridId, columnId, direction: sortDirection });
    }, [sortField, sortDirection, gridId, eventDispatcher]);

    const handleCellEdit = useCallback((rowId: string, column: string, value: any) => {
        setEditingCell(null);
        onCellEdit?.(rowId, column, value);
        eventDispatcher.dispatch('CELL_EDIT', { gridId, rowId, column, value });
    }, [gridId, onCellEdit, eventDispatcher]);

    return (
        <div className="client-side-grid" data-grid-id={gridId}>
            <table>
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th
                                key={col.id}
                                onClick={() => col.sortable && handleSort(col.id)}
                                className={col.sortable ? 'sortable' : ''}
                            >
                                {col.label}
                                {sortField === col.id && (
                                    <span className="sort-indicator">
                                        {sortDirection === 'ASC' ? '▲' : '▼'}
                                    </span>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map(row => (
                        <tr key={row.id}>
                            {columns.map(col => (
                                <td
                                    key={col.id}
                                    onDoubleClick={() => setEditingCell({ rowId: row.id, column: col.id })}
                                >
                                    {editingCell?.rowId === row.id && editingCell?.column === col.id ? (
                                        <input
                                            defaultValue={row.cells[col.id]}
                                            onBlur={(e) => handleCellEdit(row.id, col.id, e.target.value)}
                                            autoFocus
                                        />
                                    ) : (
                                        row.cells[col.id]
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ClientSideGrid;
