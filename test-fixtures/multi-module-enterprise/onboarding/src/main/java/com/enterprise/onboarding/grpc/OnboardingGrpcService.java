package com.enterprise.onboarding.grpc;

import com.enterprise.common.grpc.SecurityServiceGrpc;
import com.enterprise.common.grpc.CheckAccessRequest;
import com.enterprise.common.grpc.CheckAccessResponse;
import com.enterprise.onboarding.model.OnboardingTask;
import com.enterprise.onboarding.repository.OnboardingTaskRepository;
import com.enterprise.onboarding.sdui.LayoutBuilder;
import com.enterprise.onboarding.service.OnboardingGridService;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.stream.Collectors;

/**
 * gRPC Service for SDUI-based onboarding
 */
@GrpcService
public class OnboardingGrpcService extends OnboardingServiceGrpc.OnboardingServiceImplBase {
    
    @Autowired
    private LayoutBuilder layoutBuilder;
    
    @Autowired
    private OnboardingTaskRepository taskRepository;
    
    @Autowired
    private OnboardingGridService gridService;
    
    @Autowired
    private SecurityServiceGrpc.SecurityServiceBlockingStub securityService;
    
    @Override
    public void getLayout(GetLayoutRequest request, StreamObserver<LayoutResponse> responseObserver) {
        try {
            // Check if user has access
            CheckAccessResponse access = securityService.checkAccess(
                CheckAccessRequest.newBuilder()
                    .setUserId(request.getUserId())
                    .setResource("onboarding.dashboard")
                    .setAction("view")
                    .build()
            );
            
            if (!access.getAllowed()) {
                responseObserver.onError(new SecurityException("Access denied: " + access.getReason()));
                return;
            }
            
            LayoutDefinition layout = layoutBuilder.buildOnboardingDashboard(request.getUserId());
            
            LayoutResponse response = LayoutResponse.newBuilder()
                .setScreenId(request.getScreenId())
                .setLayout(layout)
                .putMetadata("userId", String.valueOf(request.getUserId()))
                .putMetadata("timestamp", String.valueOf(System.currentTimeMillis()))
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        } catch (Exception e) {
            responseObserver.onError(e);
        }
    }
    
    @Override
    public void getTaskList(GetTaskListRequest request, StreamObserver<TaskListResponse> responseObserver) {
        try {
            List<OnboardingTask> tasks = taskRepository.findByUserIdOrderBySequenceAsc(request.getUserId());
            
            List<com.enterprise.onboarding.grpc.OnboardingTask> protoTasks = tasks.stream()
                .map(this::toProtoTask)
                .collect(Collectors.toList());
            
            long completed = tasks.stream()
                .filter(t -> t.getStatus() == OnboardingTask.TaskStatus.COMPLETED)
                .count();
            
            ProgressInfo progress = ProgressInfo.newBuilder()
                .setTotalTasks(tasks.size())
                .setCompletedTasks((int) completed)
                .setPercentage(tasks.isEmpty() ? 0 : (int) ((completed * 100) / tasks.size()))
                .build();
            
            TaskListResponse response = TaskListResponse.newBuilder()
                .addAllTasks(protoTasks)
                .setProgress(progress)
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        } catch (Exception e) {
            responseObserver.onError(e);
        }
    }
    
    @Override
    public void updateTaskStatus(UpdateTaskStatusRequest request, StreamObserver<UpdateTaskStatusResponse> responseObserver) {
        try {
            OnboardingTask task = taskRepository.findById(request.getTaskId())
                .orElseThrow(() -> new IllegalArgumentException("Task not found"));
            
            task.setStatus(OnboardingTask.TaskStatus.valueOf(request.getStatus()));
            task = taskRepository.save(task);
            
            UpdateTaskStatusResponse response = UpdateTaskStatusResponse.newBuilder()
                .setSuccess(true)
                .setMessage("Task status updated")
                .setTask(toProtoTask(task))
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        } catch (Exception e) {
            UpdateTaskStatusResponse response = UpdateTaskStatusResponse.newBuilder()
                .setSuccess(false)
                .setMessage("Failed to update task: " + e.getMessage())
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        }
    }
    
    @Override
    public void getGridData(GetGridDataRequest request, StreamObserver<GridDataResponse> responseObserver) {
        try {
            OnboardingGridService.GridRequest gridRequest = new OnboardingGridService.GridRequest();
            gridRequest.setPage(request.getConfig().getPage());
            gridRequest.setPageSize(request.getConfig().getPageSize());
            gridRequest.setSortBy(request.getConfig().getSortBy());
            gridRequest.setSortDir(request.getConfig().getSortDirection());
            
            OnboardingGridService.GridData data = gridService.getGridData(request.getUserId(), gridRequest);
            
            GridDataResponse.Builder responseBuilder = GridDataResponse.newBuilder()
                .setTotalCount(data.getTotal())
                .setPage(data.getPage())
                .setPageSize(data.getPageSize());
            
            // Add column definitions
            responseBuilder.addColumns(
                ColumnDefinition.newBuilder()
                    .setField("id")
                    .setHeader("ID")
                    .setType("number")
                    .setSortable(true)
                    .setSensitive(false)
                    .setVisible(true)
                    .build()
            );
            
            responseBuilder.addColumns(
                ColumnDefinition.newBuilder()
                    .setField("name")
                    .setHeader("Name")
                    .setType("string")
                    .setSortable(true)
                    .setSensitive(false)
                    .setVisible(true)
                    .build()
            );
            
            responseBuilder.addColumns(
                ColumnDefinition.newBuilder()
                    .setField("email")
                    .setHeader("Email")
                    .setType("string")
                    .setSortable(true)
                    .setSensitive(false)
                    .setVisible(true)
                    .build()
            );
            
            responseBuilder.addColumns(
                ColumnDefinition.newBuilder()
                    .setField("ssn")
                    .setHeader("SSN")
                    .setType("string")
                    .setSortable(false)
                    .setSensitive(true)
                    .setVisible(false)
                    .build()
            );
            
            // Add rows
            for (var row : data.getRows()) {
                GridRow.Builder rowBuilder = GridRow.newBuilder()
                    .setRowId(String.valueOf(row.get("id")))
                    .setEditable(true)
                    .setDeletable(true);
                
                for (var entry : row.entrySet()) {
                    rowBuilder.putCells(entry.getKey(), String.valueOf(entry.getValue()));
                }
                
                responseBuilder.addRows(rowBuilder.build());
            }
            
            responseObserver.onNext(responseBuilder.build());
            responseObserver.onCompleted();
        } catch (Exception e) {
            responseObserver.onError(e);
        }
    }
    
    @Override
    public void processAction(ProcessActionRequest request, StreamObserver<ActionResponse> responseObserver) {
        try {
            // Process different action types
            switch (request.getActionType()) {
                case "completeTask":
                    handleCompleteTask(request, responseObserver);
                    break;
                case "updateGrid":
                    handleUpdateGrid(request, responseObserver);
                    break;
                case "exportData":
                    handleExportData(request, responseObserver);
                    break;
                default:
                    throw new IllegalArgumentException("Unknown action type: " + request.getActionType());
            }
        } catch (Exception e) {
            ActionResponse response = ActionResponse.newBuilder()
                .setSuccess(false)
                .setMessage("Action failed: " + e.getMessage())
                .build();
            
            responseObserver.onNext(response);
            responseObserver.onCompleted();
        }
    }
    
    private void handleCompleteTask(ProcessActionRequest request, StreamObserver<ActionResponse> responseObserver) {
        Long taskId = Long.parseLong(request.getPayloadOrDefault("taskId", "0"));
        
        OnboardingTask task = taskRepository.findById(taskId)
            .orElseThrow(() -> new IllegalArgumentException("Task not found"));
        
        task.setStatus(OnboardingTask.TaskStatus.COMPLETED);
        taskRepository.save(task);
        
        ActionResponse response = ActionResponse.newBuilder()
            .setSuccess(true)
            .setMessage("Task completed")
            .putData("taskId", String.valueOf(taskId))
            .build();
        
        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }
    
    private void handleUpdateGrid(ProcessActionRequest request, StreamObserver<ActionResponse> responseObserver) {
        ActionResponse response = ActionResponse.newBuilder()
            .setSuccess(true)
            .setMessage("Grid updated")
            .build();
        
        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }
    
    private void handleExportData(ProcessActionRequest request, StreamObserver<ActionResponse> responseObserver) {
        ActionResponse response = ActionResponse.newBuilder()
            .setSuccess(true)
            .setMessage("Data exported")
            .putData("exportUrl", "/downloads/export.csv")
            .build();
        
        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }
    
    private com.enterprise.onboarding.grpc.OnboardingTask toProtoTask(OnboardingTask task) {
        return com.enterprise.onboarding.grpc.OnboardingTask.newBuilder()
            .setId(task.getId())
            .setUserId(task.getUserId())
            .setTitle(task.getTitle())
            .setDescription(task.getDescription() != null ? task.getDescription() : "")
            .setStatus(task.getStatus().name())
            .setSequence(task.getSequence() != null ? task.getSequence() : 0)
            .setAssignedAt(task.getAssignedAt().toEpochSecond(java.time.ZoneOffset.UTC))
            .setCompletedAt(task.getCompletedAt() != null ? 
                task.getCompletedAt().toEpochSecond(java.time.ZoneOffset.UTC) : 0)
            .build();
    }
}
