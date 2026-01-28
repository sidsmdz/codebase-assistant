package com.sdui.controller;

import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import com.sdui.broker.MessageRouter.StateSyncPayload;
import com.sdui.broker.WebSocketBroker;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Side Effect Engine - Handles server-triggered UI updates
 *
 * Patterns demonstrated:
 * - Server-initiated rendering (push notifications, real-time updates)
 * - Background job completion triggers
 * - Scheduled tasks that update UI
 * - Event-driven side effects
 */
@Service
public class SideEffectEngine {

    private final LayoutController layoutController;
    private final WebSocketBroker broker;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Track pending tasks per session
    private final Map<String, List<PendingTask>> pendingTasks = new ConcurrentHashMap<>();

    public SideEffectEngine(LayoutController layoutController, WebSocketBroker broker) {
        this.layoutController = layoutController;
        this.broker = broker;
    }

    /**
     * PATTERN: Server-triggered drawer opening
     * Triggered when background job completes (e.g., report generation)
     */
    public void notifyJobComplete(String sessionId, String jobId, String jobType) {
        System.out.println("Background job completed: " + jobId + " (type: " + jobType + ")");

        // Pattern B1: Open notification drawer via UI_ACTION
        LayoutController.UIActionPayload action =
                layoutController.openDrawerActionBased("drawer_notifications");

        sendUIAction(sessionId, action);

        // Also send the notification content
        // This demonstrates server-triggered content rendering
    }

    /**
     * PATTERN: Load user details when row is selected
     * Server-side data fetching triggered by client event
     */
    public void loadUserDetails(String sessionId, String userId) {
        System.out.println("Loading user details for: " + userId);

        // Simulate database query
        Map<String, String> userDetails = fetchUserDetails(userId);

        // Build drawer with user details
        LayoutController.Component detailsContent = buildUserDetailsComponent(userDetails);

        // Open drawer with details (Pattern B2: Render-based)
        LayoutController.DrawerConfig drawerConfig = new LayoutController.DrawerConfig();
        drawerConfig.setPosition("RIGHT");
        drawerConfig.setWidth(400);
        drawerConfig.setIsOpen(true);
        drawerConfig.setOpenMode("RENDER_BASED");

        LayoutController.Component drawer = new LayoutController.Component();
        drawer.setId("drawer_userDetails");
        drawer.setType("DRAWER");
        drawer.setDrawerConfig(drawerConfig);
        drawer.setChildren(Arrays.asList(detailsContent));

        LayoutController.UIRenderPayload payload = new LayoutController.UIRenderPayload();
        payload.setLayoutId("layout_user_details");
        payload.setComponents(Arrays.asList(drawer));
        payload.setMode("DELTA_RENDER"); // Delta update, not full replace
        payload.setTimestamp(System.currentTimeMillis());

        sendUIRender(sessionId, payload);
    }

    /**
     * PATTERN: Scheduled task that pushes UI updates
     * Real-time data updates (e.g., stock prices, order status)
     */
    @Scheduled(fixedRate = 30000) // Every 30 seconds
    public void pushScheduledUpdates() {
        System.out.println("Checking for scheduled UI updates...");

        // Check for pending tasks and update UIs
        pendingTasks.forEach((sessionId, tasks) -> {
            tasks.forEach(task -> {
                if (task.isDue()) {
                    System.out.println("Pushing update for task: " + task.getTaskId());
                    pushTaskUpdate(sessionId, task);
                    task.markComplete();
                }
            });

            // Remove completed tasks
            tasks.removeIf(PendingTask::isComplete);
        });
    }

    /**
     * PATTERN: Real-time data change notification
     * Database CDC (Change Data Capture) triggers UI update
     */
    public void handleDataChange(String entityType, String entityId, String changeType) {
        System.out.println("Data change detected: " + entityType + "/" + entityId + " - " + changeType);

        // Find affected sessions and push updates
        // This demonstrates reactive, data-driven UI updates
        if (entityType.equals("USER")) {
            // Update any grids showing this user
            pushGridUpdate(entityId);
        }
    }

    /**
     * Handle state synchronization from client
     */
    public void syncState(String sessionId, StateSyncPayload state) {
        String stateType = state.getStateType();
        String stateData = state.getStateData();

        System.out.println("Syncing state: " + stateType + " for session: " + sessionId);

        // Store state on server (e.g., grid filters, sort order, form data)
        // This enables state persistence across sessions
    }

    /**
     * Schedule a task that will trigger UI update
     */
    public void scheduleUIUpdate(String sessionId, PendingTask task) {
        pendingTasks.computeIfAbsent(sessionId, k -> new ArrayList<>()).add(task);
        System.out.println("Scheduled task: " + task.getTaskId() + " for session: " + sessionId);
    }

    // Helper methods
    private Map<String, String> fetchUserDetails(String userId) {
        // Simulate database query
        Map<String, String> details = new HashMap<>();
        details.put("id", userId);
        details.put("name", "John Doe");
        details.put("email", "john@example.com");
        details.put("status", "Premium");
        details.put("joinDate", "2023-01-15");
        details.put("lastLogin", "2025-12-20");
        return details;
    }

    private LayoutController.Component buildUserDetailsComponent(Map<String, String> details) {
        LayoutController.Component container = new LayoutController.Component();
        container.setId("userDetailsContainer");
        container.setType("CONTAINER");

        // Build detail fields
        List<LayoutController.Component> fields = new ArrayList<>();
        details.forEach((key, value) -> {
            LayoutController.Component field = new LayoutController.Component();
            field.setId("field_" + key);
            field.setType("TEXT");
            field.setProps(Map.of("text", key + ": " + value));
            fields.add(field);
        });

        container.setChildren(fields);
        return container;
    }

    private void pushTaskUpdate(String sessionId, PendingTask task) {
        // Build UI update for task completion
        LayoutController.Component notification = new LayoutController.Component();
        notification.setId("notification_" + task.getTaskId());
        notification.setType("TEXT");
        notification.setProps(Map.of(
            "text", "Task completed: " + task.getTaskId(),
            "variant", "success"
        ));

        LayoutController.UIRenderPayload payload = new LayoutController.UIRenderPayload();
        payload.setLayoutId("layout_task_notification");
        payload.setComponents(Arrays.asList(notification));
        payload.setMode("APPEND"); // Append notification, don't replace
        payload.setTimestamp(System.currentTimeMillis());

        sendUIRender(sessionId, payload);
    }

    private void pushGridUpdate(String userId) {
        // Update grid row for changed user
        // This would identify which sessions have the user grid visible
        // and push a delta update to those grids
        System.out.println("Pushing grid update for user: " + userId);
    }

    // Message sending helpers
    private void sendUIRender(String sessionId, LayoutController.UIRenderPayload payload) {
        try {
            WebSocketBroker.BrokerMessage message = new WebSocketBroker.BrokerMessage();
            message.setMessageId("render_" + System.currentTimeMillis());
            message.setTimestamp(System.currentTimeMillis());
            message.setType("UI_RENDER");
            message.setPayload(objectMapper.writeValueAsBytes(payload));

            broker.sendToSession(sessionId, message);
        } catch (Exception e) {
            System.err.println("Error sending UI_RENDER: " + e.getMessage());
        }
    }

    private void sendUIAction(String sessionId, LayoutController.UIActionPayload payload) {
        try {
            WebSocketBroker.BrokerMessage message = new WebSocketBroker.BrokerMessage();
            message.setMessageId("action_" + System.currentTimeMillis());
            message.setTimestamp(System.currentTimeMillis());
            message.setType("UI_ACTION");
            message.setPayload(objectMapper.writeValueAsBytes(payload));

            broker.sendToSession(sessionId, message);
        } catch (Exception e) {
            System.err.println("Error sending UI_ACTION: " + e.getMessage());
        }
    }

    /**
     * Pending task holder
     */
    public static class PendingTask {
        private final String taskId;
        private final String taskType;
        private final long scheduledTime;
        private boolean complete;

        public PendingTask(String taskId, String taskType, long delayMs) {
            this.taskId = taskId;
            this.taskType = taskType;
            this.scheduledTime = System.currentTimeMillis() + delayMs;
            this.complete = false;
        }

        public boolean isDue() {
            return System.currentTimeMillis() >= scheduledTime && !complete;
        }

        public void markComplete() {
            this.complete = true;
        }

        public boolean isComplete() {
            return complete;
        }

        public String getTaskId() {
            return taskId;
        }

        public String getTaskType() {
            return taskType;
        }
    }
}
