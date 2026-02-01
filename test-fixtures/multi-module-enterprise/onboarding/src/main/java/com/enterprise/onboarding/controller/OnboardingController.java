package com.enterprise.onboarding.controller;

import com.enterprise.common.annotations.RequiresPermission;
import com.enterprise.onboarding.model.OnboardingTask;
import com.enterprise.onboarding.model.OnboardingTask.TaskStatus;
import com.enterprise.onboarding.service.OnboardingService;
import com.enterprise.onboarding.service.OnboardingService.OnboardingProgress;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/onboarding")
public class OnboardingController {
    
    @Autowired
    private OnboardingService onboardingService;
    
    @PostMapping("/tasks")
    @RequiresPermission(resource = "onboarding.tasks", action = "create")
    public ResponseEntity<OnboardingTask> createTask(@RequestBody CreateTaskRequest request) {
        OnboardingTask task = onboardingService.createTask(
            request.getUserId(),
            request.getTitle(),
            request.getDescription(),
            request.getSequence(),
            request.getRequesterId()
        );
        return ResponseEntity.ok(task);
    }
    
    @GetMapping("/users/{userId}/tasks")
    @RequiresPermission(resource = "onboarding.tasks", action = "read")
    public ResponseEntity<List<OnboardingTask>> getUserTasks(
            @PathVariable Long userId,
            @RequestParam Long requesterId) {
        List<OnboardingTask> tasks = onboardingService.getUserTasks(userId, requesterId);
        return ResponseEntity.ok(tasks);
    }
    
    @PatchMapping("/tasks/{taskId}/status")
    @RequiresPermission(resource = "onboarding.tasks", action = "write")
    public ResponseEntity<OnboardingTask> updateTaskStatus(
            @PathVariable Long taskId,
            @RequestBody UpdateStatusRequest request) {
        OnboardingTask task = onboardingService.updateTaskStatus(
            taskId,
            request.getStatus(),
            request.getRequesterId()
        );
        return ResponseEntity.ok(task);
    }
    
    @DeleteMapping("/tasks/{taskId}")
    @RequiresPermission(resource = "onboarding.tasks", action = "delete")
    public ResponseEntity<Void> deleteTask(
            @PathVariable Long taskId,
            @RequestParam Long requesterId) {
        onboardingService.deleteTask(taskId, requesterId);
        return ResponseEntity.ok().build();
    }
    
    @GetMapping("/users/{userId}/progress")
    @RequiresPermission(resource = "onboarding.tasks", action = "read")
    public ResponseEntity<OnboardingProgress> getProgress(
            @PathVariable Long userId,
            @RequestParam Long requesterId) {
        OnboardingProgress progress = onboardingService.getProgress(userId, requesterId);
        return ResponseEntity.ok(progress);
    }
    
    // DTOs
    public static class CreateTaskRequest {
        private Long userId;
        private String title;
        private String description;
        private Integer sequence;
        private Long requesterId;
        
        public Long getUserId() { return userId; }
        public void setUserId(Long userId) { this.userId = userId; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public Integer getSequence() { return sequence; }
        public void setSequence(Integer sequence) { this.sequence = sequence; }
        public Long getRequesterId() { return requesterId; }
        public void setRequesterId(Long requesterId) { this.requesterId = requesterId; }
    }
    
    public static class UpdateStatusRequest {
        private TaskStatus status;
        private Long requesterId;
        
        public TaskStatus getStatus() { return status; }
        public void setStatus(TaskStatus status) { this.status = status; }
        public Long getRequesterId() { return requesterId; }
        public void setRequesterId(Long requesterId) { this.requesterId = requesterId; }
    }
}
