package com.enterprise.common.security;

import com.enterprise.permissions.service.PermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Helper class to check permissions for Permitted components
 */
@Component
public class PermissionChecker {
    
    @Autowired
    private PermissionService permissionService;
    
    /**
     * Check if user has permission for a specific resource and action
     */
    public boolean checkPermission(Long userId, String resource, String action) {
        return permissionService.userHasPermission(userId, resource, action);
    }
    
    /**
     * Verify permission and throw exception if not permitted
     */
    public void requirePermission(Long userId, String resource, String action) {
        if (!checkPermission(userId, resource, action)) {
            throw new PermissionDeniedException(
                String.format("User %d does not have permission to %s on %s", 
                    userId, action, resource)
            );
        }
    }
    
    /**
     * Check if user has any of the specified permissions
     */
    public boolean checkAnyPermission(Long userId, String resource, String... actions) {
        for (String action : actions) {
            if (checkPermission(userId, resource, action)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Check if user has all of the specified permissions
     */
    public boolean checkAllPermissions(Long userId, String resource, String... actions) {
        for (String action : actions) {
            if (!checkPermission(userId, resource, action)) {
                return false;
            }
        }
        return true;
    }
}
