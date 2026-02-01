import { useState, useEffect, useCallback } from 'react';

interface PermissionCache {
    [key: string]: boolean;
}

/**
 * Custom hook for checking permissions using the Permitted interface
 * Integrates with the permissions module through the common module
 */
export const usePermissionChecker = () => {
    const [cache, setCache] = useState<PermissionCache>({});
    
    const getCacheKey = (userId: number, resource: string, action: string): string => {
        return `${userId}:${resource}:${action}`;
    };
    
    const checkPermission = useCallback(async (userId: number, resource: string, action: string): Promise<boolean> => {
        const key = getCacheKey(userId, resource, action);
        
        // Check cache first
        if (cache[key] !== undefined) {
            return cache[key];
        }
        
        try {
            const response = await fetch(`/api/permissions/users/${userId}/check?resource=${resource}&action=${action}`);
            
            if (!response.ok) {
                return false;
            }
            
            const hasPermission = await response.json();
            
            // Update cache
            setCache(prev => ({ ...prev, [key]: hasPermission }));
            
            return hasPermission;
        } catch (err) {
            console.error('Permission check failed:', err);
            return false;
        }
    }, [cache]);
    
    const hasPermission = (userId: number, resource: string, action: string): boolean => {
        const key = getCacheKey(userId, resource, action);
        return cache[key] === true;
    };
    
    const clearCache = () => {
        setCache({});
    };
    
    return {
        checkPermission,
        hasPermission,
        clearCache
    };
};
