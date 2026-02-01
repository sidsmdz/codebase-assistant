import React, { useEffect, useState } from 'react';
import { usePermissionChecker } from '../hooks/usePermissionChecker';

interface OnboardingTask {
    id: number;
    userId: number;
    title: string;
    description: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
    sequence: number;
    assignedAt: string;
    completedAt?: string;
}

interface OnboardingTaskListProps {
    userId: number;
    currentUserId: number;
}

/**
 * Component to display onboarding tasks with permission checks
 * Uses the Permitted interface from common module
 */
export const OnboardingTaskList: React.FC<OnboardingTaskListProps> = ({ userId, currentUserId }) => {
    const [tasks, setTasks] = useState<OnboardingTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const { hasPermission, checkPermission } = usePermissionChecker();
    
    const canRead = hasPermission(currentUserId, 'onboarding.tasks', 'read');
    const canWrite = hasPermission(currentUserId, 'onboarding.tasks', 'write');
    const canDelete = hasPermission(currentUserId, 'onboarding.tasks', 'delete');
    
    useEffect(() => {
        if (canRead) {
            fetchTasks();
        } else {
            setError('You do not have permission to view tasks');
            setLoading(false);
        }
    }, [userId, canRead]);
    
    const fetchTasks = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/onboarding/users/${userId}/tasks?requesterId=${currentUserId}`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch tasks');
            }
            
            const data = await response.json();
            setTasks(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };
    
    const updateTaskStatus = async (taskId: number, status: OnboardingTask['status']) => {
        if (!canWrite) {
            setError('You do not have permission to update tasks');
            return;
        }
        
        try {
            const response = await fetch(`/api/onboarding/tasks/${taskId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, requesterId: currentUserId })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update task');
            }
            
            await fetchTasks();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update task');
        }
    };
    
    const deleteTask = async (taskId: number) => {
        if (!canDelete) {
            setError('You do not have permission to delete tasks');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this task?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/onboarding/tasks/${taskId}?requesterId=${currentUserId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete task');
            }
            
            await fetchTasks();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete task');
        }
    };
    
    if (loading) {
        return <div className="loading">Loading tasks...</div>;
    }
    
    if (error) {
        return <div className="error">{error}</div>;
    }
    
    if (!canRead) {
        return <div className="permission-denied">Access Denied</div>;
    }
    
    return (
        <div className="onboarding-task-list">
            <h2>Onboarding Tasks</h2>
            
            {tasks.length === 0 ? (
                <p>No tasks assigned</p>
            ) : (
                <ul className="task-list">
                    {tasks.map(task => (
                        <li key={task.id} className={`task-item status-${task.status.toLowerCase()}`}>
                            <div className="task-header">
                                <span className="task-sequence">#{task.sequence}</span>
                                <h3>{task.title}</h3>
                                <span className="task-status">{task.status}</span>
                            </div>
                            
                            <p className="task-description">{task.description}</p>
                            
                            <div className="task-actions">
                                {canWrite && task.status !== 'COMPLETED' && (
                                    <button onClick={() => updateTaskStatus(task.id, 'COMPLETED')}>
                                        Mark Complete
                                    </button>
                                )}
                                
                                {canWrite && task.status === 'PENDING' && (
                                    <button onClick={() => updateTaskStatus(task.id, 'IN_PROGRESS')}>
                                        Start
                                    </button>
                                )}
                                
                                {canDelete && (
                                    <button 
                                        className="delete-button" 
                                        onClick={() => deleteTask(task.id)}
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
