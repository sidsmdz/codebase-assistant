package com.enterprise.permissions.grpc;

import com.enterprise.permissions.service.PermissionService;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;
import org.springframework.beans.factory.annotation.Autowired;

@GrpcService
public class PermissionGrpcService extends PermissionServiceGrpc.PermissionServiceImplBase {
    
    @Autowired
    private PermissionService permissionService;
    
    @Override
    public void createPermission(CreatePermissionRequest request, StreamObserver<PermissionResponse> responseObserver) {
        try {
            com.enterprise.permissions.model.Permission permission = permissionService.createPermission(
                request.getName(),
                request.getResource(),
                request.getAction(),
                request.getDescription()
            );
            
            PermissionResponse response = PermissionResponse.newBuilder()
                .setPermission(toProtoPermission(permission))
                .setSuccess(true)
                .setMessage("Permission created successfully")
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        } catch (Exception e) {
            PermissionResponse response = PermissionResponse.newBuilder()
                .setSuccess(false)
                .setMessage("Failed to create permission: " + e.getMessage())
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        }
    }
    
    @Override
    public void createRole(CreateRoleRequest request, StreamObserver<RoleResponse> responseObserver) {
        try {
            com.enterprise.permissions.model.Role role = permissionService.createRole(
                request.getName(),
                request.getDescription(),
                new java.util.HashSet<>(request.getPermissionNamesList())
            );
            
            RoleResponse response = RoleResponse.newBuilder()
                .setRole(toProtoRole(role))
                .setSuccess(true)
                .setMessage("Role created successfully")
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        } catch (Exception e) {
            RoleResponse response = RoleResponse.newBuilder()
                .setSuccess(false)
                .setMessage("Failed to create role: " + e.getMessage())
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        }
    }
    
    @Override
    public void assignRole(AssignRoleRequest request, StreamObserver<AssignRoleResponse> responseObserver) {
        try {
            permissionService.assignRoleToUser(
                request.getUserId(),
                request.getRoleName(),
                request.getAssignedBy()
            );
            
            AssignRoleResponse response = AssignRoleResponse.newBuilder()
                .setSuccess(true)
                .setMessage("Role assigned successfully")
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        } catch (Exception e) {
            AssignRoleResponse response = AssignRoleResponse.newBuilder()
                .setSuccess(false)
                .setMessage("Failed to assign role: " + e.getMessage())
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        }
    }
    
    @Override
    public void checkPermission(CheckPermissionRequest request, StreamObserver<CheckPermissionResponse> responseObserver) {
        try {
            boolean hasPermission = permissionService.userHasPermission(
                request.getUserId(),
                request.getResource(),
                request.getAction()
            );
            
            CheckPermissionResponse response = CheckPermissionResponse.newBuilder()
                .setHasPermission(hasPermission)
                .setMessage(hasPermission ? "Permission granted" : "Permission denied")
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        } catch (Exception e) {
            CheckPermissionResponse response = CheckPermissionResponse.newBuilder()
                .setHasPermission(false)
                .setMessage("Error checking permission: " + e.getMessage())
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        }
    }
    
    @Override
    public void getUserPermissions(GetUserPermissionsRequest request, StreamObserver<UserPermissionsResponse> responseObserver) {
        try {
            var permissions = permissionService.getUserPermissions(request.getUserId());
            var roles = permissionService.getUserRoles(request.getUserId());
            
            UserPermissionsResponse.Builder responseBuilder = UserPermissionsResponse.newBuilder();
            
            for (var perm : permissions) {
                responseBuilder.addPermissions(toProtoPermission(perm));
            }
            
            for (var role : roles) {
                responseBuilder.addRoles(toProtoRole(role));
            }
            
            responseObserver.onNext(responseBuilder.build());
            responseObserver.onCompleted();
        } catch (Exception e) {
            responseObserver.onError(e);
        }
    }
    
    private Permission toProtoPermission(com.enterprise.permissions.model.Permission permission) {
        return Permission.newBuilder()
            .setId(permission.getId())
            .setName(permission.getName())
            .setResource(permission.getResource())
            .setAction(permission.getAction())
            .setDescription(permission.getDescription() != null ? permission.getDescription() : "")
            .setCreatedAt(permission.getCreatedAt().toEpochSecond(java.time.ZoneOffset.UTC))
            .build();
    }
    
    private Role toProtoRole(com.enterprise.permissions.model.Role role) {
        Role.Builder builder = Role.newBuilder()
            .setId(role.getId())
            .setName(role.getName())
            .setDescription(role.getDescription() != null ? role.getDescription() : "")
            .setCreatedAt(role.getCreatedAt().toEpochSecond(java.time.ZoneOffset.UTC))
            .setUpdatedAt(role.getUpdatedAt().toEpochSecond(java.time.ZoneOffset.UTC));
        
        if (role.getPermissions() != null) {
            for (var perm : role.getPermissions()) {
                builder.addPermissions(toProtoPermission(perm));
            }
        }
        
        return builder.build();
    }
}
