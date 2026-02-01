import React, { useEffect, useState } from 'react';
import { usePermissionChecker } from '../hooks/usePermissionChecker';

interface GridColumn {
    field: string;
    header: string;
    sortable?: boolean;
    sensitive?: boolean;
}

interface GridRow {
    [key: string]: any;
}

interface OnboardingGridProps {
    userId: number;
    columns: GridColumn[];
}

/**
 * Permission-aware grid component for onboarding data
 * Implements Permitted interface through permission checks
 */
export const OnboardingGrid: React.FC<OnboardingGridProps> = ({ userId, columns }) => {
    const [rows, setRows] = useState<GridRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const [pageSize] = useState(50);
    const [sortBy, setSortBy] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    
    const { hasPermission } = usePermissionChecker();
    
    const canRead = hasPermission(userId, 'onboarding.grid', 'read');
    const canWrite = hasPermission(userId, 'onboarding.grid', 'write');
    const canDelete = hasPermission(userId, 'onboarding.grid', 'delete');
    const canExport = hasPermission(userId, 'onboarding.grid', 'export');
    const canViewSensitive = hasPermission(userId, 'onboarding.grid', 'view-sensitive');
    const canWriteSensitive = hasPermission(userId, 'onboarding.grid', 'write-sensitive');
    
    useEffect(() => {
        if (canRead) {
            fetchData();
        } else {
            setError('You do not have permission to view this grid');
            setLoading(false);
        }
    }, [page, sortBy, sortDir, canRead]);
    
    const fetchData = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/onboarding/grid/data?userId=${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page, pageSize, sortBy, sortDir })
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch grid data');
            }
            
            const data = await response.json();
            setRows(data.rows);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };
    
    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDir('asc');
        }
    };
    
    const handleExport = async () => {
        if (!canExport) {
            alert('You do not have permission to export data');
            return;
        }
        
        try {
            const response = await fetch(`/api/onboarding/grid/export?userId=${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: 0, pageSize: 10000 })
            });
            
            if (!response.ok) {
                throw new Error('Export failed');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'onboarding-data.csv';
            a.click();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed');
        }
    };
    
    const handleUpdate = async (rowId: number, field: string, value: any) => {
        const column = columns.find(c => c.field === field);
        
        if (!canWrite) {
            alert('You do not have permission to edit data');
            return;
        }
        
        if (column?.sensitive && !canWriteSensitive) {
            alert('You do not have permission to edit sensitive fields');
            return;
        }
        
        try {
            const response = await fetch(`/api/onboarding/grid/rows/${rowId}?userId=${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            
            if (!response.ok) {
                throw new Error('Update failed');
            }
            
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed');
        }
    };
    
    const handleDelete = async (rowId: number) => {
        if (!canDelete) {
            alert('You do not have permission to delete rows');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this row?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/onboarding/grid/rows/${rowId}?userId=${userId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Delete failed');
            }
            
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
        }
    };
    
    // Filter out sensitive columns if user doesn't have permission
    const visibleColumns = columns.filter(col => {
        if (col.sensitive && !canViewSensitive) {
            return false;
        }
        return true;
    });
    
    if (loading) {
        return <div className="loading">Loading grid data...</div>;
    }
    
    if (error) {
        return <div className="error">{error}</div>;
    }
    
    if (!canRead) {
        return <div className="permission-denied">Access Denied</div>;
    }
    
    return (
        <div className="onboarding-grid">
            <div className="grid-header">
                <h2>Onboarding Data</h2>
                {canExport && (
                    <button onClick={handleExport} className="export-button">
                        Export Data
                    </button>
                )}
            </div>
            
            <table className="grid-table">
                <thead>
                    <tr>
                        {visibleColumns.map(col => (
                            <th 
                                key={col.field}
                                onClick={() => col.sortable && handleSort(col.field)}
                                className={col.sortable ? 'sortable' : ''}
                            >
                                {col.header}
                                {sortBy === col.field && (
                                    <span className="sort-indicator">
                                        {sortDir === 'asc' ? ' ↑' : ' ↓'}
                                    </span>
                                )}
                            </th>
                        ))}
                        {(canWrite || canDelete) && <th>Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.id}>
                            {visibleColumns.map(col => (
                                <td key={col.field}>
                                    {row[col.field]}
                                </td>
                            ))}
                            {(canWrite || canDelete) && (
                                <td className="actions">
                                    {canDelete && (
                                        <button 
                                            onClick={() => handleDelete(row.id)}
                                            className="delete-button"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
            
            <div className="grid-pagination">
                <button 
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                >
                    Previous
                </button>
                <span>Page {page + 1}</span>
                <button onClick={() => setPage(p => p + 1)}>
                    Next
                </button>
            </div>
        </div>
    );
};
