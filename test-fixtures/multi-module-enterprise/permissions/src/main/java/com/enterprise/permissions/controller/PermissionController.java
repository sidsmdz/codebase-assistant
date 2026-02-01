package com.enterprise.permissions.controller;

import com.enterprise.permissions.model.Permission;
import com.enterprise.permissions.model.Role;
import com.enterprise.permissions.service.PermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Set;

@RestController
@RequestMapping("/api/permissions")
public class PermissionController {
    
    @Autowired
    private PermissionService permissionService;
    
    @PostMapping
    public ResponseEntity<Permission> createPermission(@RequestBody CreatePermissionRequest request) {
        Permission permission = permissionService.createPermission(
            request.getName(),
            request.getResource(),
            request.getAction(),
            request.getDescription()
        );
        return ResponseEntity.ok(permission);
    }
    
    @PostMapping("/roles")
    public ResponseEntity<Role> createRole(@RequestBody CreateRoleRequest request) {
        Role role = permissionService.createRole(
            request.getName(),
            request.getDescription(),
            request.getPermissions()
        );
        return ResponseEntity.ok(role);
    }
    
    @PostMapping("/users/{userId}/roles")
    public ResponseEntity<Void> assignRole(
            @PathVariable Long userId,
            @RequestBody AssignRoleRequest request) {
        permissionService.assignRoleToUser(userId, request.getRoleName(), request.getAssignedBy());
        return ResponseEntity.ok().build();
    }
    
    @DeleteMapping("/users/{userId}/roles/{roleName}")
    public ResponseEntity<Void> removeRole(
            @PathVariable Long userId,
            @PathVariable String roleName) {
        permissionService.removeRoleFromUser(userId, roleName);
        return ResponseEntity.ok().build();
    }
    
    @GetMapping("/users/{userId}")
    public ResponseEntity<Set<Permission>> getUserPermissions(@PathVariable Long userId) {
        Set<Permission> permissions = permissionService.getUserPermissions(userId);
        return ResponseEntity.ok(permissions);
    }
    
    @GetMapping("/users/{userId}/check")
    public ResponseEntity<Boolean> checkPermission(
            @PathVariable Long userId,
            @RequestParam String resource,
            @RequestParam String action) {
        boolean hasPermission = permissionService.userHasPermission(userId, resource, action);
        return ResponseEntity.ok(hasPermission);
    }
    
    // DTOs
    public static class CreatePermissionRequest {
        private String name;
        private String resource;
        private String action;
        private String description;
        
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getResource() { return resource; }
        public void setResource(String resource) { this.resource = resource; }
        public String getAction() { return action; }
        public void setAction(String action) { this.action = action; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }
    
    public static class CreateRoleRequest {
        private String name;
        private String description;
        private Set<String> permissions;
        
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public Set<String> getPermissions() { return permissions; }
        public void setPermissions(Set<String> permissions) { this.permissions = permissions; }
    }
    
    public static class AssignRoleRequest {
        private String roleName;
        private Long assignedBy;
        
        public String getRoleName() { return roleName; }
        public void setRoleName(String roleName) { this.roleName = roleName; }
        public Long getAssignedBy() { return assignedBy; }
        public void setAssignedBy(Long assignedBy) { this.assignedBy = assignedBy; }
    }
}
