package com.enterprise.onboarding.sdui;

import com.enterprise.onboarding.grpc.*;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Layout builder for Server-Driven UI
 * Constructs dynamic layouts based on user permissions
 */
@Component
public class LayoutBuilder {
    
    public LayoutDefinition buildOnboardingDashboard(Long userId) {
        LayoutDefinition.Builder layout = LayoutDefinition.newBuilder()
            .setType("screen")
            .setConfig(
                LayoutConfig.newBuilder()
                    .setTitle("Onboarding Dashboard")
                    .setTheme("modern")
                    .setShowNavigation(true)
                    .build()
            );
        
        // Task list component
        layout.addComponents(
            ComponentDefinition.newBuilder()
                .setId("task-list")
                .setType("taskList")
                .putProps("title", "Your Onboarding Tasks")
                .putProps("showProgress", "true")
                .setPermissions(
                    PermissionConfig.newBuilder()
                        .setResource("onboarding.tasks")
                        .addRequiredActions("read")
                        .setFallbackBehavior("hide")
                        .build()
                )
                .build()
        );
        
        // Grid component
        layout.addComponents(
            ComponentDefinition.newBuilder()
                .setId("user-grid")
                .setType("grid")
                .putProps("title", "User Data")
                .putProps("pageSize", "50")
                .putProps("sortable", "true")
                .setPermissions(
                    PermissionConfig.newBuilder()
                        .setResource("onboarding.grid")
                        .addRequiredActions("read")
                        .setFallbackBehavior("show_message")
                        .build()
                )
                .build()
        );
        
        return layout.build();
    }
    
    public LayoutDefinition buildTaskListLayout(Long userId, java.util.List<OnboardingTask> tasks, ProgressInfo progress) {
        LayoutDefinition.Builder layout = LayoutDefinition.newBuilder()
            .setType("list")
            .setConfig(
                LayoutConfig.newBuilder()
                    .setTitle("Onboarding Tasks")
                    .putStyles("maxWidth", "800px")
                    .build()
            );
        
        // Progress component
        layout.addComponents(
            ComponentDefinition.newBuilder()
                .setId("progress-bar")
                .setType("progress")
                .putProps("total", String.valueOf(progress.getTotalTasks()))
                .putProps("completed", String.valueOf(progress.getCompletedTasks()))
                .putProps("percentage", String.valueOf(progress.getPercentage()))
                .build()
        );
        
        // Task items
        for (OnboardingTask task : tasks) {
            layout.addComponents(
                ComponentDefinition.newBuilder()
                    .setId("task-" + task.getId())
                    .setType("taskItem")
                    .putProps("title", task.getTitle())
                    .putProps("description", task.getDescription())
                    .putProps("status", task.getStatus())
                    .putProps("sequence", String.valueOf(task.getSequence()))
                    .setPermissions(
                        PermissionConfig.newBuilder()
                            .setResource("onboarding.tasks")
                            .addRequiredActions("write")
                            .setFallbackBehavior("disable")
                            .build()
                    )
                    .build()
            );
        }
        
        return layout.build();
    }
    
    public LayoutDefinition buildGridLayout(Long userId, GridDataResponse gridData) {
        LayoutDefinition.Builder layout = LayoutDefinition.newBuilder()
            .setType("grid")
            .setConfig(
                LayoutConfig.newBuilder()
                    .setTitle("Onboarding Data Grid")
                    .build()
            );
        
        // Grid component with dynamic configuration
        ComponentDefinition.Builder gridComponent = ComponentDefinition.newBuilder()
            .setId("data-grid")
            .setType("serverGrid")
            .putProps("page", String.valueOf(gridData.getPage()))
            .putProps("pageSize", String.valueOf(gridData.getPageSize()))
            .putProps("totalCount", String.valueOf(gridData.getTotalCount()))
            .setPermissions(
                PermissionConfig.newBuilder()
                    .setResource("onboarding.grid")
                    .addRequiredActions("read")
                    .setFallbackBehavior("hide")
                    .build()
            );
        
        // Add column definitions as child components
        for (ColumnDefinition column : gridData.getColumnsList()) {
            gridComponent.addChildren(
                ComponentDefinition.newBuilder()
                    .setId("col-" + column.getField())
                    .setType("gridColumn")
                    .putProps("field", column.getField())
                    .putProps("header", column.getHeader())
                    .putProps("type", column.getType())
                    .putProps("sortable", String.valueOf(column.getSortable()))
                    .putProps("visible", String.valueOf(column.getVisible()))
                    .setPermissions(
                        PermissionConfig.newBuilder()
                            .setResource("onboarding.grid")
                            .addRequiredActions(column.getSensitive() ? "view-sensitive" : "read")
                            .setFallbackBehavior("hide")
                            .build()
                    )
                    .build()
            );
        }
        
        layout.addComponents(gridComponent.build());
        
        return layout.build();
    }
}
