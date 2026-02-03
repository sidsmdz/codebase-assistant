package com.enterprise.permissions.service;

import com.enterprise.permissions.authorization.AuthorizationProvider;

@Service
public class PermissionService {

    private final AuthorizationProvider authorizationProvider;

    @Autowired
    public PermissionService(AuthorizationProvider authorizationProvider) {
        this.authorizationProvider = authorizationProvider;
    }

    // Delegate permission creation to AuthorizationProvider
    @Transactional
    public Permission createPermission(String name, String resource, String action, String description) {
        return authorizationProvider.createPermission(name, resource, action, description);
    }

    // Delegate role creation to AuthorizationProvider
    @Transactional
    public Role createRole(String name, String description, Set<String> permissionNames) {
        return authorizationProvider.createRole(name, description, permissionNames);
    }

    // Delegate role assignment to AuthorizationProvider
    @Transactional
    public UserRole assignRoleToUser(Long userId, String roleName, Long assignedBy) {
        return authorizationProvider.assignRoleToUser(userId, roleName, assignedBy);
    }

    // Delegate role removal to AuthorizationProvider
    @Transactional
    public void removeRoleFromUser(Long userId, String roleName) {
        authorizationProvider.removeRoleFromUser(userId, roleName);
    }

    // Delegate permission retrieval to AuthorizationProvider
    public Set<Permission> getUserPermissions(Long userId) {
        return authorizationProvider.getUserPermissions(userId);
    }

    // Delegate permission check to AuthorizationProvider
    public boolean userHasPermission(Long userId, String resource, String action) {
        return authorizationProvider.userHasPermission(userId, resource, action);
    }

    // Delegate role retrieval to AuthorizationProvider
    public Set<Role> getUserRoles(Long userId) {
        return authorizationProvider.getUserRoles(userId);
    }

    // Delegate permission addition to AuthorizationProvider
    @Transactional
    public Role addPermissionToRole(String roleName, String permissionName) {
        return authorizationProvider.addPermissionToRole(roleName, permissionName);
    }
}
