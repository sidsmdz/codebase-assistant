package com.example.sdui.backend;

import io.grpc.stub.StreamObserver;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Server-Driven UI Layout Controller
 *
 * This controller manages the entire UI layout from the server side.
 * It handles:
 * 1. Initial layout generation with AG Grid
 * 2. User event processing (button clicks, row selections)
 * 3. Dynamic layout updates (tab changes, grid updates)
 * 4. Streaming layout changes to connected clients
 */
@Service
public class LayoutController extends LayoutServiceGrpc.LayoutServiceImplBase {

    private final Map<String, LayoutState> sessionStates = new ConcurrentHashMap<>();
    private final Map<String, StreamObserver<LayoutUpdate>> activeStreams = new ConcurrentHashMap<>();

    /**
     * Get initial layout when user loads the app
     * Returns a layout with AG Grid showing user data
     */
    @Override
    public void getInitialLayout(LayoutRequest request, StreamObserver<LayoutResponse> responseObserver) {
        String sessionId = request.getSessionId();

        // Create initial layout state
        LayoutState state = new LayoutState(request.getUserId(), sessionId);
        sessionStates.put(sessionId, state);

        // Build initial layout with AG Grid
        LayoutResponse layout = buildUserGridLayout(state);

        responseObserver.onNext(layout);
        responseObserver.onCompleted();
    }

    /**
     * Stream layout updates to client
     * Server pushes updates when state changes
     */
    @Override
    public void streamLayoutUpdates(LayoutRequest request, StreamObserver<LayoutUpdate> responseObserver) {
        String sessionId = request.getSessionId();

        // Register stream for this session
        activeStreams.put(sessionId, responseObserver);

        // Keep stream open - updates sent via pushLayoutUpdate()
    }

    /**
     * Handle user events from client
     * Process clicks, selections, etc. and return updated layout
     */
    @Override
    public void sendUserEvent(UserEvent event, StreamObserver<LayoutResponse> responseObserver) {
        String sessionId = extractSessionFromEvent(event);
        LayoutState state = sessionStates.get(sessionId);

        if (state == null) {
            responseObserver.onError(new IllegalStateException("Session not found"));
            return;
        }

        LayoutResponse response = null;

        switch (event.getType()) {
            case BUTTON_CLICK:
                response = handleButtonClick(event, state);
                break;

            case ROW_SELECTED:
                response = handleRowSelection(event, state);
                break;

            case TAB_CHANGED:
                response = handleTabChange(event, state);
                break;

            default:
                response = LayoutResponse.newBuilder()
                    .setSuccess(false)
                    .build();
        }

        responseObserver.onNext(response);
        responseObserver.onCompleted();

        // Also push update to streaming clients
        pushLayoutUpdate(sessionId, response);
    }

    /**
     * Build AG Grid layout with user data
     * Grid shows users with custom row styling (blue for premium, white for regular)
     */
    private LayoutResponse buildUserGridLayout(LayoutState state) {
        // Create AG Grid columns
        List<ColumnDef> columns = Arrays.asList(
            ColumnDef.newBuilder()
                .setField("name")
                .setHeaderName("Name")
                .setSortable(true)
                .setFilter(true)
                .setWidth(200)
                .build(),
            ColumnDef.newBuilder()
                .setField("email")
                .setHeaderName("Email")
                .setSortable(true)
                .setFilter(true)
                .setWidth(250)
                .build(),
            ColumnDef.newBuilder()
                .setField("role")
                .setHeaderName("Role")
                .setSortable(true)
                .setFilter(true)
                .setWidth(150)
                .build(),
            ColumnDef.newBuilder()
                .setField("status")
                .setHeaderName("Status")
                .setSortable(true)
                .setFilter(true)
                .setWidth(120)
                .build()
        );

        // Create rows with custom styling
        List<Row> rows = Arrays.asList(
            Row.newBuilder()
                .setId("1")
                .putData("name", "John Doe")
                .putData("email", "john@example.com")
                .putData("role", "Admin")
                .putData("status", "Premium")
                .setRowClass("premium-user-blue")  // Blue row for premium
                .build(),
            Row.newBuilder()
                .setId("2")
                .putData("name", "Jane Smith")
                .putData("email", "jane@example.com")
                .putData("role", "User")
                .putData("status", "Regular")
                .setRowClass("regular-user-white")  // White row for regular
                .build(),
            Row.newBuilder()
                .setId("3")
                .putData("name", "Bob Johnson")
                .putData("email", "bob@example.com")
                .putData("role", "Manager")
                .putData("status", "Premium")
                .setRowClass("premium-user-blue")
                .build()
        );

        // Build AG Grid config
        GridConfig gridConfig = GridConfig.newBuilder()
            .addAllColumns(columns)
            .addAllRows(rows)
            .setPagination(true)
            .setPageSize(10)
            .setRowSelection("single")
            .build();

        // Create AG Grid component
        Component agGrid = Component.newBuilder()
            .setId("userGrid")
            .setType(ComponentType.AG_GRID)
            .putProps("theme", "ag-theme-material")
            .putProps("rowHeight", "48")
            .putProps("onRowSelected", "handleRowSelected")
            .setGridConfig(gridConfig)
            .build();

        // Wrap in container
        Component container = Component.newBuilder()
            .setId("mainContainer")
            .setType(ComponentType.CONTAINER)
            .putProps("padding", "24px")
            .addChildren(agGrid)
            .build();

        return LayoutResponse.newBuilder()
            .setLayoutId(UUID.randomUUID().toString())
            .addComponents(container)
            .setTheme("light")
            .setSuccess(true)
            .build();
    }

    /**
     * Handle button click - Show AG Grid
     */
    private LayoutResponse handleButtonClick(UserEvent event, LayoutState state) {
        // When button clicked, show AG Grid with user data
        return buildUserGridLayout(state);
    }

    /**
     * Handle row selection in AG Grid
     * When user selects a row, create new layout with tabs and switch to details tab
     */
    private LayoutResponse handleRowSelection(UserEvent event, LayoutState state) {
        String selectedUserId = event.getDataMap().get("rowId");
        state.setSelectedUser(selectedUserId);

        // Get user details
        Map<String, String> userData = getUserData(selectedUserId);

        // Create tab layout
        // Tab 1: User List (the AG Grid)
        Component gridTab = Component.newBuilder()
            .setId("userListTab")
            .setType(ComponentType.TAB_PANEL)
            .addChildren(buildUserGridLayout(state).getComponents(0))
            .build();

        // Tab 2: User Details (shown after row selection)
        Component detailsContent = Component.newBuilder()
            .setId("detailsContent")
            .setType(ComponentType.CONTAINER)
            .putProps("padding", "24px")
            .addChildren(
                Component.newBuilder()
                    .setId("userName")
                    .setType(ComponentType.TEXT)
                    .putProps("variant", "h4")
                    .putProps("text", userData.get("name"))
                    .build()
            )
            .addChildren(
                Component.newBuilder()
                    .setId("userEmail")
                    .setType(ComponentType.TEXT)
                    .putProps("variant", "body1")
                    .putProps("text", "Email: " + userData.get("email"))
                    .build()
            )
            .addChildren(
                Component.newBuilder()
                    .setId("userRole")
                    .setType(ComponentType.TEXT)
                    .putProps("variant", "body1")
                    .putProps("text", "Role: " + userData.get("role"))
                    .build()
            )
            .build();

        Component detailsTab = Component.newBuilder()
            .setId("detailsTab")
            .setType(ComponentType.TAB_PANEL)
            .addChildren(detailsContent)
            .build();

        // Create tabs configuration
        TabConfig tabConfig = TabConfig.newBuilder()
            .addTabs(Tab.newBuilder()
                .setId("userList")
                .setLabel("User List")
                .addContent(gridTab)
                .build())
            .addTabs(Tab.newBuilder()
                .setId("details")
                .setLabel("User Details")
                .addContent(detailsTab)
                .build())
            .setActiveTab(1)  // Switch to details tab (index 1)
            .build();

        // Create tabs component
        Component tabs = Component.newBuilder()
            .setId("mainTabs")
            .setType(ComponentType.TABS)
            .putProps("orientation", "horizontal")
            .setTabConfig(tabConfig)
            .build();

        return LayoutResponse.newBuilder()
            .setLayoutId(UUID.randomUUID().toString())
            .addComponents(tabs)
            .setTheme("light")
            .setSuccess(true)
            .build();
    }

    /**
     * Handle tab change
     */
    private LayoutResponse handleTabChange(UserEvent event, LayoutState state) {
        // Return current layout with updated active tab
        return LayoutResponse.newBuilder()
            .setSuccess(true)
            .build();
    }

    /**
     * Push layout update to streaming clients
     */
    private void pushLayoutUpdate(String sessionId, LayoutResponse layout) {
        StreamObserver<LayoutUpdate> stream = activeStreams.get(sessionId);
        if (stream != null) {
            LayoutUpdate update = LayoutUpdate.newBuilder()
                .setUpdateId(UUID.randomUUID().toString())
                .setType(UpdateType.FULL_REFRESH)
                .addAllComponents(layout.getComponentsList())
                .build();

            stream.onNext(update);
        }
    }

    /**
     * Get user data by ID
     */
    private Map<String, String> getUserData(String userId) {
        Map<String, String> data = new HashMap<>();
        switch (userId) {
            case "1":
                data.put("name", "John Doe");
                data.put("email", "john@example.com");
                data.put("role", "Admin");
                data.put("status", "Premium");
                break;
            case "2":
                data.put("name", "Jane Smith");
                data.put("email", "jane@example.com");
                data.put("role", "User");
                data.put("status", "Regular");
                break;
            case "3":
                data.put("name", "Bob Johnson");
                data.put("email", "bob@example.com");
                data.put("role", "Manager");
                data.put("status", "Premium");
                break;
        }
        return data;
    }

    private String extractSessionFromEvent(UserEvent event) {
        return event.getDataMap().get("sessionId");
    }

    /**
     * Internal layout state
     */
    private static class LayoutState {
        private final String userId;
        private final String sessionId;
        private String selectedUser;
        private int activeTab;

        public LayoutState(String userId, String sessionId) {
            this.userId = userId;
            this.sessionId = sessionId;
            this.activeTab = 0;
        }

        public void setSelectedUser(String userId) {
            this.selectedUser = userId;
        }

        public String getSelectedUser() {
            return selectedUser;
        }
    }
}
