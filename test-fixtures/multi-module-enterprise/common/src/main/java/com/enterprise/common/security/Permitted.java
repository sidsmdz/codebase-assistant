package com.enterprise.common.security;

/**
 * Interface for permission-aware components.
 * Components implementing this interface can restrict access based on user permissions.
 */
public interface Permitted {
    
    /**
     * Check if the current user is permitted to access this resource
     * 
     * @param userId The user ID to check
     * @param action The action being performed (e.g., "read", "write", "delete")
     * @return true if the user has permission, false otherwise
     */
    boolean isPermitted(Long userId, String action);
    
    /**
     * Get the resource identifier for this permitted component
     * Used to lookup permissions in the permission system
     * 
     * @return The resource identifier (e.g., "onboarding.grid", "onboarding.form")
     */
    String getResourceIdentifier();
    
    /**
     * Get the default actions available for this resource
     * 
     * @return Array of action names (e.g., ["read", "write", "delete"])
     */
    String[] getAvailableActions();
}
