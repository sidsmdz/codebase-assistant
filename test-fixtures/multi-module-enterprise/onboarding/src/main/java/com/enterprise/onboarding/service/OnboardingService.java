package com.enterprise.onboarding.service;

import com.enterprise.common.security.PermissionChecker;
import com.enterprise.common.security.Permitted;
import com.enterprise.onboarding.model.OnboardingTask;
import com.enterprise.onboarding.model.OnboardingTask.TaskStatus;
import com.enterprise.onboarding.repository.OnboardingTaskRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Service for managing onboarding tasks with permission checks
 */
@Service
public class OnboardingService implements Permitted {
    
    @Autowired
    private OnboardingTaskRepository taskRepository;
    
    @Autowired
    private PermissionChecker permissionChecker;
    
    private static final String RESOURCE = "onboarding.tasks";
    
    /**
     * Create a new onboarding task for a user
     */
    @Transactional
    public OnboardingTask createTask(Long userId, String title, String description, Integer sequence, Long requesterId) {
        // Check if requester has permission to create tasks
        permissionChecker.requirePermission(requesterId, RESOURCE, "create");
        
        OnboardingTask task = new OnboardingTask();
        task.setUserId(userId);
        task.setTitle(title);
        task.setDescription(description);
        task.setSequence(sequence);
        
        return taskRepository.save(task);
    }
    
    /**
     * Get all tasks for a user
     */
    public List<OnboardingTask> getUserTasks(Long userId, Long requesterId) {
        // Check if requester has permission to view tasks
        permissionChecker.requirePermission(requesterId, RESOURCE, "read");
        
        return taskRepository.findByUserIdOrderBySequenceAsc(userId);
    }
    
    /**
     * Update task status
     */
    @Transactional
    public OnboardingTask updateTaskStatus(Long taskId, TaskStatus status, Long requesterId) {
        // Check if requester has permission to update tasks
        permissionChecker.requirePermission(requesterId, RESOURCE, "write");
        
        OnboardingTask task = taskRepository.findById(taskId)
            .orElseThrow(() -> new IllegalArgumentException("Task not found"));
        
        task.setStatus(status);
        return taskRepository.save(task);
    }
    
    /**
     * Delete a task
     */
    @Transactional
    public void deleteTask(Long taskId, Long requesterId) {
        // Check if requester has permission to delete tasks
        permissionChecker.requirePermission(requesterId, RESOURCE, "delete");
        
        taskRepository.deleteById(taskId);
    }
    
    /**
     * Get progress for a user
     */
    public OnboardingProgress getProgress(Long userId, Long requesterId) {
        // Check if requester has permission to view progress
        permissionChecker.requirePermission(requesterId, RESOURCE, "read");
        
        List<OnboardingTask> allTasks = taskRepository.findByUserIdOrderBySequenceAsc(userId);
        long completedCount = taskRepository.countByUserIdAndStatus(userId, TaskStatus.COMPLETED);
        
        return new OnboardingProgress(
            allTasks.size(),
            (int) completedCount,
            allTasks.isEmpty() ? 0 : (int) ((completedCount * 100) / allTasks.size())
        );
    }
    
    @Override
    public boolean isPermitted(Long userId, String action) {
        return permissionChecker.checkPermission(userId, RESOURCE, action);
    }
    
    @Override
    public String getResourceIdentifier() {
        return RESOURCE;
    }
    
    @Override
    public String[] getAvailableActions() {
        return new String[]{"create", "read", "write", "delete"};
    }
    
    public static class OnboardingProgress {
        private int totalTasks;
        private int completedTasks;
        private int percentage;
        
        public OnboardingProgress(int totalTasks, int completedTasks, int percentage) {
            this.totalTasks = totalTasks;
            this.completedTasks = completedTasks;
            this.percentage = percentage;
        }
        
        public int getTotalTasks() { return totalTasks; }
        public int getCompletedTasks() { return completedTasks; }
        public int getPercentage() { return percentage; }
    }
}
