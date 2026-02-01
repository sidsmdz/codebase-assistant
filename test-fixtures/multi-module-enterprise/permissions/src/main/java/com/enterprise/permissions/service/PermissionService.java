package com.enterprise.permissions.service;

import com.enterprise.permissions.model.Permission;
import com.enterprise.permissions.model.Role;
import com.enterprise.permissions.model.UserRole;
import com.enterprise.permissions.repository.PermissionRepository;
import com.enterprise.permissions.repository.RoleRepository;
import com.enterprise.permissions.repository.UserRoleRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PermissionService {
    
    @Autowired
    private PermissionRepository permissionRepository;
    
    @Autowired
    private RoleRepository roleRepository;
    
    @Autowired
    private UserRoleRepository userRoleRepository;
    
    /**
     * Create a new permission
     */
    @Transactional
    public Permission createPermission(String name, String resource, String action, String description) {
        if (permissionRepository.existsByName(name)) {
            throw new IllegalArgumentException("Permission already exists: " + name);
        }
        
        Permission permission = new Permission(name, resource, action);
        permission.setDescription(description);
        return permissionRepository.save(permission);
    }
    
    /**
     * Create a new role with permissions
     */
    @Transactional
    public Role createRole(String name, String description, Set<String> permissionNames) {
        if (roleRepository.existsByName(name)) {
            throw new IllegalArgumentException("Role already exists: " + name);
        }
        
        Role role = new Role(name, description);
        
        if (permissionNames != null && !permissionNames.isEmpty()) {
            Set<Permission> permissions = new HashSet<>();
            for (String permName : permissionNames) {
                Permission perm = permissionRepository.findByName(permName)
                    .orElseThrow(() -> new IllegalArgumentException("Permission not found: " + permName));
                permissions.add(perm);
            }
            role.setPermissions(permissions);
        }
        
        return roleRepository.save(role);
    }
    
    /**
     * Assign a role to a user
     */
    @Transactional
    public UserRole assignRoleToUser(Long userId, String roleName, Long assignedBy) {
        Role role = roleRepository.findByName(roleName)
            .orElseThrow(() -> new IllegalArgumentException("Role not found: " + roleName));
        
        if (userRoleRepository.existsByUserIdAndRoleId(userId, role.getId())) {
            throw new IllegalArgumentException("User already has this role");
        }
        
        UserRole userRole = new UserRole(userId, role, assignedBy);
        return userRoleRepository.save(userRole);
    }
    
    /**
     * Remove a role from a user
     */
    @Transactional
    public void removeRoleFromUser(Long userId, String roleName) {
        Role role = roleRepository.findByName(roleName)
            .orElseThrow(() -> new IllegalArgumentException("Role not found: " + roleName));
        
        userRoleRepository.deleteByUserIdAndRoleId(userId, role.getId());
    }
    
    /**
     * Get all permissions for a user (aggregated from all roles)
     */
    public Set<Permission> getUserPermissions(Long userId) {
        List<UserRole> userRoles = userRoleRepository.findByUserIdWithPermissions(userId);
        
        return userRoles.stream()
            .flatMap(ur -> ur.getRole().getPermissions().stream())
            .collect(Collectors.toSet());
    }
    
    /**
     * Check if user has a specific permission
     */
    public boolean userHasPermission(Long userId, String resource, String action) {
        Set<Permission> permissions = getUserPermissions(userId);
        
        return permissions.stream()
            .anyMatch(p -> p.getResource().equals(resource) && p.getAction().equals(action));
    }
    
    /**
     * Get all roles for a user
     */
    public Set<Role> getUserRoles(Long userId) {
        List<UserRole> userRoles = userRoleRepository.findByUserId(userId);
        return userRoles.stream()
            .map(UserRole::getRole)
            .collect(Collectors.toSet());
    }
    
    /**
     * Add permission to role
     */
    @Transactional
    public Role addPermissionToRole(String roleName, String permissionName) {
        Role role = roleRepository.findByIdWithPermissions(
            roleRepository.findByName(roleName)
                .orElseThrow(() -> new IllegalArgumentException("Role not found: " + roleName))
                .getId()
        ).orElseThrow();
        
        Permission permission = permissionRepository.findByName(permissionName)
            .orElseThrow(() -> new IllegalArgumentException("Permission not found: " + permissionName));
        
        role.getPermissions().add(permission);
        return roleRepository.save(role);
    }
}
