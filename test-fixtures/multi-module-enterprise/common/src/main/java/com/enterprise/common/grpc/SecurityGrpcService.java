package com.enterprise.common.grpc;

import com.enterprise.permissions.service.PermissionService;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;
import org.springframework.beans.factory.annotation.Autowired;

@GrpcService
public class SecurityGrpcService extends SecurityServiceGrpc.SecurityServiceImplBase {
    
    @Autowired
    private PermissionService permissionService;
    
    @Override
    public void checkAccess(CheckAccessRequest request, StreamObserver<CheckAccessResponse> responseObserver) {
        try {
            boolean allowed = permissionService.userHasPermission(
                request.getUserId(),
                request.getResource(),
                request.getAction()
            );
            
            CheckAccessResponse response = CheckAccessResponse.newBuilder()
                .setAllowed(allowed)
                .setReason(allowed ? "Access granted" : "Insufficient permissions")
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        } catch (Exception e) {
            CheckAccessResponse response = CheckAccessResponse.newBuilder()
                .setAllowed(false)
                .setReason("Error checking access: " + e.getMessage())
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        }
    }
    
    @Override
    public void validatePermissions(ValidatePermissionsRequest request, StreamObserver<ValidatePermissionsResponse> responseObserver) {
        try {
            ValidatePermissionsResponse.Builder responseBuilder = ValidatePermissionsResponse.newBuilder();
            boolean allGranted = true;
            
            for (PermissionCheck check : request.getChecksList()) {
                boolean granted = permissionService.userHasPermission(
                    request.getUserId(),
                    check.getResource(),
                    check.getAction()
                );
                
                if (check.getRequired() && !granted) {
                    allGranted = false;
                }
                
                responseBuilder.addResults(
                    PermissionResult.newBuilder()
                        .setResource(check.getResource())
                        .setAction(check.getAction())
                        .setGranted(granted)
                        .build()
                );
            }
            
            responseBuilder.setAllGranted(allGranted);
            responseObserver.onNext(responseBuilder.build());
            responseObserver.onCompleted();
        } catch (Exception e) {
            responseObserver.onError(e);
        }
    }
}
