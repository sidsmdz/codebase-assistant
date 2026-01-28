package com.sdui.controller;

import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

/**
 * Layout Controller - Generates SDUI component definitions
 *
 * Demonstrates multiple redundant patterns for the same functionality:
 * - Pattern Group A: Grid row styling (3 patterns)
 * - Pattern Group B: Drawer opening (3 patterns)
 * - Pattern Group C: Form validation (3 patterns)
 *
 * This redundancy is intentional for testing pattern discovery
 */
@Service
public class LayoutController {

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * PATTERN A1: Grid Row Styling - Class-Based
     * Server assigns CSS class names to rows
     */
    public UIRenderPayload buildUserGridClassBased() {
        List<GridRow> rows = Arrays.asList(
            new GridRow("1", Map.of(
                "name", "John Doe",
                "email", "john@example.com",
                "status", "Premium"
            ), "premium-user-blue", null),  // CSS class

            new GridRow("2", Map.of(
                "name", "Jane Smith",
                "email", "jane@example.com",
                "status", "Regular"
            ), "regular-user-white", null)  // CSS class
        );

        GridConfig gridConfig = new GridConfig();
        gridConfig.setMode("CLIENT_SIDE");
        gridConfig.setColumns(buildUserColumns());
        gridConfig.setRows(rows);
        gridConfig.setRowStyleMode("CLASS_BASED");

        Component grid = new Component();
        grid.setId("userGrid_classPattern");
        grid.setType("CLIENT_SIDE_GRID");
        grid.setGridConfig(gridConfig);

        return createRenderPayload("layout_class_based", Arrays.asList(grid));
    }

    /**
     * PATTERN A2: Grid Row Styling - Color-Based
     * Server sends colors directly, no CSS classes
     */
    public UIRenderPayload buildUserGridColorBased() {
        List<GridRow> rows = Arrays.asList(
            new GridRow("1", Map.of(
                "name", "John Doe",
                "email", "john@example.com",
                "status", "Premium"
            ), null, "#e3f2fd"),  // Direct color

            new GridRow("2", Map.of(
                "name", "Jane Smith",
                "email", "jane@example.com",
                "status", "Regular"
            ), null, "#ffffff")  // Direct color
        );

        GridConfig gridConfig = new GridConfig();
        gridConfig.setMode("CLIENT_SIDE");
        gridConfig.setColumns(buildUserColumns());
        gridConfig.setRows(rows);
        gridConfig.setRowStyleMode("COLOR_BASED");

        Component grid = new Component();
        grid.setId("userGrid_colorPattern");
        grid.setType("CLIENT_SIDE_GRID");
        grid.setGridConfig(gridConfig);

        return createRenderPayload("layout_color_based", Arrays.asList(grid));
    }

    /**
     * PATTERN A3: Grid Row Styling - Rule-Based
     * Server sends conditional rules for client evaluation
     */
    public UIRenderPayload buildUserGridRuleBased() {
        List<GridRow> rows = Arrays.asList(
            new GridRow("1", Map.of(
                "name", "John Doe",
                "email", "john@example.com",
                "status", "Premium"
            ), null, null),

            new GridRow("2", Map.of(
                "name", "Jane Smith",
                "email", "jane@example.com",
                "status", "Regular"
            ), null, null)
        );

        // Conditional rules for styling
        List<RowStyleRule> rules = Arrays.asList(
            new RowStyleRule("status === 'Premium'", "premium-user-blue", "#e3f2fd"),
            new RowStyleRule("status === 'Regular'", "regular-user-white", "#ffffff")
        );

        GridConfig gridConfig = new GridConfig();
        gridConfig.setMode("CLIENT_SIDE");
        gridConfig.setColumns(buildUserColumns());
        gridConfig.setRows(rows);
        gridConfig.setRowStyleMode("RULE_BASED");
        gridConfig.setRowStyleRules(rules);

        Component grid = new Component();
        grid.setId("userGrid_rulePattern");
        grid.setType("CLIENT_SIDE_GRID");
        grid.setGridConfig(gridConfig);

        return createRenderPayload("layout_rule_based", Arrays.asList(grid));
    }

    /**
     * PATTERN B1: Drawer Opening - Action-Based
     * Sends separate UI_ACTION message to open drawer
     */
    public UIActionPayload openDrawerActionBased(String drawerId) {
        UIActionPayload action = new UIActionPayload();
        action.setActionId("action_" + System.currentTimeMillis());
        action.setActionType("OPEN_DRAWER");
        action.setTargetComponentId(drawerId);
        action.setParams(Map.of("animate", "true", "duration", "300"));

        System.out.println("Pattern B1: Opening drawer via UI_ACTION");
        return action;
    }

    /**
     * PATTERN B2: Drawer Opening - Render-Based
     * Includes drawer in UI_RENDER with isOpen=true
     */
    public UIRenderPayload openDrawerRenderBased() {
        DrawerConfig drawerConfig = new DrawerConfig();
        drawerConfig.setPosition("RIGHT");
        drawerConfig.setWidth(400);
        drawerConfig.setIsOpen(true);  // Opened via render
        drawerConfig.setOpenMode("RENDER_BASED");

        Component notificationList = new Component();
        notificationList.setId("notificationList");
        notificationList.setType("TEXT");
        notificationList.setProps(Map.of("text", "You have 3 new notifications"));

        Component drawer = new Component();
        drawer.setId("drawer_notifications_render");
        drawer.setType("DRAWER");
        drawer.setDrawerConfig(drawerConfig);
        drawer.setChildren(Arrays.asList(notificationList));

        System.out.println("Pattern B2: Opening drawer via UI_RENDER");
        return createRenderPayload("layout_drawer_render", Arrays.asList(drawer));
    }

    /**
     * PATTERN B3: Drawer Opening - State-Based
     * Sends state sync message, client manages drawer state
     */
    public StateSyncPayload openDrawerStateBased(String drawerId) {
        StateSyncPayload stateSync = new StateSyncPayload();
        stateSync.setStateId("state_" + System.currentTimeMillis());
        stateSync.setStateType("DRAWER_STATE");
        stateSync.setStateData("{\"drawerId\": \"" + drawerId + "\", \"isOpen\": true}");
        stateSync.setDirection("SERVER_TO_CLIENT");

        System.out.println("Pattern B3: Opening drawer via STATE_SYNC");
        return stateSync;
    }

    /**
     * PATTERN C1: Form Validation - Inline
     * Validate each field on INPUT_CHANGED event
     */
    public UIActionPayload validateFieldInline(String fieldId, String value) {
        String validationMessage = validateUsername(value);

        UIActionPayload action = new UIActionPayload();
        action.setActionId("validation_" + System.currentTimeMillis());
        action.setActionType("SHOW_VALIDATION");
        action.setTargetComponentId(fieldId);
        action.setParams(Map.of(
            "valid", validationMessage == null ? "true" : "false",
            "message", validationMessage != null ? validationMessage : "Valid",
            "mode", "INLINE"
        ));

        System.out.println("Pattern C1: Inline validation for field: " + fieldId);
        return action;
    }

    /**
     * PATTERN C2: Form Validation - Batch
     * Validate all fields on FORM_SUBMITTED event
     */
    public UIActionPayload validateFormBatch(Map<String, String> formData) {
        Map<String, String> validationResults = new HashMap<>();

        formData.forEach((fieldId, value) -> {
            if (fieldId.equals("username")) {
                String message = validateUsername(value);
                if (message != null) {
                    validationResults.put(fieldId, message);
                }
            }
        });

        UIActionPayload action = new UIActionPayload();
        action.setActionId("validation_" + System.currentTimeMillis());
        action.setActionType("SHOW_VALIDATION");
        action.setTargetComponentId("userForm");
        action.setParams(Map.of(
            "valid", validationResults.isEmpty() ? "true" : "false",
            "errors", new ObjectMapper().writeValueAsString(validationResults),
            "mode", "BATCH"
        ));

        System.out.println("Pattern C2: Batch validation for form");
        return action;
    }

    /**
     * PATTERN C3: Form Validation - Real-Time Debounced
     * Validate with debounce to reduce server calls
     */
    public UIActionPayload validateFieldDebounced(String fieldId, String value) {
        // Simulated debounced validation
        String validationMessage = validateUsername(value);

        UIActionPayload action = new UIActionPayload();
        action.setActionId("validation_" + System.currentTimeMillis());
        action.setActionType("SHOW_VALIDATION");
        action.setTargetComponentId(fieldId);
        action.setParams(Map.of(
            "valid", validationMessage == null ? "true" : "false",
            "message", validationMessage != null ? validationMessage : "Available",
            "mode", "REALTIME_DEBOUNCED",
            "debounceMs", "500"
        ));

        System.out.println("Pattern C3: Debounced validation for field: " + fieldId);
        return action;
    }

    /**
     * Server-Side Grid Pattern
     * Pattern D: Server-side data loading with virtual scrolling
     */
    public UIRenderPayload buildServerSideGrid() {
        ServerSideGridConfig serverConfig = new ServerSideGridConfig();
        serverConfig.setDataSourceUrl("/api/users");
        serverConfig.setCacheBlockSize(100);
        serverConfig.setMaxBlocksInCache(10);

        GridConfig gridConfig = new GridConfig();
        gridConfig.setMode("SERVER_SIDE");
        gridConfig.setColumns(buildUserColumns());
        gridConfig.setServerSideConfig(serverConfig);
        gridConfig.setEnableFiltering(true);
        gridConfig.setEnableSorting(true);

        Component grid = new Component();
        grid.setId("userGrid_serverSide");
        grid.setType("SERVER_SIDE_GRID");
        grid.setGridConfig(gridConfig);

        System.out.println("Pattern D: Server-side grid with virtual scrolling");
        return createRenderPayload("layout_server_grid", Arrays.asList(grid));
    }

    /**
     * Modal with Form Pattern
     * Pattern E: Modal dialog with form and validation
     */
    public UIRenderPayload buildModalWithForm() {
        // Form fields
        FormField usernameField = new FormField();
        usernameField.setFieldId("username");
        usernameField.setLabel("Username");
        usernameField.setInputType("TEXT_INPUT");
        usernameField.setRequired(true);

        FormConfig formConfig = new FormConfig();
        formConfig.setFormId("createUserForm");
        formConfig.setFields(Arrays.asList(usernameField));
        formConfig.setValidationMode("INLINE");
        formConfig.setSubmitAction("CREATE_USER");

        Component form = new Component();
        form.setId("userForm");
        form.setType("FORM");
        form.setFormConfig(formConfig);

        // Modal containing form
        ModalConfig modalConfig = new ModalConfig();
        modalConfig.setTitle("Create New User");
        modalConfig.setWidth(600);
        modalConfig.setHeight(400);
        modalConfig.setBackdrop(true);
        modalConfig.setCloseOnBackdrop(false);

        Component modal = new Component();
        modal.setId("modal_createUser");
        modal.setType("MODAL");
        modal.setModalConfig(modalConfig);
        modal.setChildren(Arrays.asList(form));

        System.out.println("Pattern E: Modal with form");
        return createRenderPayload("layout_modal_form", Arrays.asList(modal));
    }

    // Helper methods
    private List<ColumnDef> buildUserColumns() {
        return Arrays.asList(
            new ColumnDef("name", "Name", "text", true, true, 200),
            new ColumnDef("email", "Email", "text", true, true, 250),
            new ColumnDef("status", "Status", "text", true, true, 150)
        );
    }

    private UIRenderPayload createRenderPayload(String layoutId, List<Component> components) {
        UIRenderPayload payload = new UIRenderPayload();
        payload.setLayoutId(layoutId);
        payload.setComponents(components);
        payload.setMode("FULL_RENDER");
        payload.setTimestamp(System.currentTimeMillis());
        return payload;
    }

    private String validateUsername(String username) {
        if (username == null || username.trim().isEmpty()) {
            return "Username is required";
        }
        if (username.length() < 3) {
            return "Username must be at least 3 characters";
        }
        if (username.equals("admin")) {
            return "Username 'admin' is reserved";
        }
        return null; // Valid
    }

    // POJOs (simplified - would use proto-generated classes in production)
    public static class UIRenderPayload {
        private String layoutId;
        private List<Component> components;
        private String mode;
        private long timestamp;

        // Getters and setters
        public String getLayoutId() { return layoutId; }
        public void setLayoutId(String layoutId) { this.layoutId = layoutId; }
        public List<Component> getComponents() { return components; }
        public void setComponents(List<Component> components) { this.components = components; }
        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }
        public long getTimestamp() { return timestamp; }
        public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
    }

    public static class UIActionPayload {
        private String actionId;
        private String actionType;
        private String targetComponentId;
        private Map<String, String> params;

        // Getters and setters
        public String getActionId() { return actionId; }
        public void setActionId(String actionId) { this.actionId = actionId; }
        public String getActionType() { return actionType; }
        public void setActionType(String actionType) { this.actionType = actionType; }
        public String getTargetComponentId() { return targetComponentId; }
        public void setTargetComponentId(String targetComponentId) { this.targetComponentId = targetComponentId; }
        public Map<String, String> getParams() { return params; }
        public void setParams(Map<String, String> params) { this.params = params; }
    }

    public static class StateSyncPayload {
        private String stateId;
        private String stateType;
        private String stateData;
        private String direction;

        // Getters and setters
        public String getStateId() { return stateId; }
        public void setStateId(String stateId) { this.stateId = stateId; }
        public String getStateType() { return stateType; }
        public void setStateType(String stateType) { this.stateType = stateType; }
        public String getStateData() { return stateData; }
        public void setStateData(String stateData) { this.stateData = stateData; }
        public String getDirection() { return direction; }
        public void setDirection(String direction) { this.direction = direction; }
    }

    public static class Component {
        private String id;
        private String type;
        private Map<String, String> props;
        private List<Component> children;
        private GridConfig gridConfig;
        private DrawerConfig drawerConfig;
        private ModalConfig modalConfig;
        private FormConfig formConfig;

        // Getters and setters
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public Map<String, String> getProps() { return props; }
        public void setProps(Map<String, String> props) { this.props = props; }
        public List<Component> getChildren() { return children; }
        public void setChildren(List<Component> children) { this.children = children; }
        public GridConfig getGridConfig() { return gridConfig; }
        public void setGridConfig(GridConfig gridConfig) { this.gridConfig = gridConfig; }
        public DrawerConfig getDrawerConfig() { return drawerConfig; }
        public void setDrawerConfig(DrawerConfig drawerConfig) { this.drawerConfig = drawerConfig; }
        public ModalConfig getModalConfig() { return modalConfig; }
        public void setModalConfig(ModalConfig modalConfig) { this.modalConfig = modalConfig; }
        public FormConfig getFormConfig() { return formConfig; }
        public void setFormConfig(FormConfig formConfig) { this.formConfig = formConfig; }
    }

    public static class GridConfig {
        private String mode;
        private List<ColumnDef> columns;
        private List<GridRow> rows;
        private ServerSideGridConfig serverSideConfig;
        private String rowStyleMode;
        private List<RowStyleRule> rowStyleRules;
        private boolean enableFiltering;
        private boolean enableSorting;

        // Getters and setters
        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }
        public List<ColumnDef> getColumns() { return columns; }
        public void setColumns(List<ColumnDef> columns) { this.columns = columns; }
        public List<GridRow> getRows() { return rows; }
        public void setRows(List<GridRow> rows) { this.rows = rows; }
        public ServerSideGridConfig getServerSideConfig() { return serverSideConfig; }
        public void setServerSideConfig(ServerSideGridConfig serverSideConfig) { this.serverSideConfig = serverSideConfig; }
        public String getRowStyleMode() { return rowStyleMode; }
        public void setRowStyleMode(String rowStyleMode) { this.rowStyleMode = rowStyleMode; }
        public List<RowStyleRule> getRowStyleRules() { return rowStyleRules; }
        public void setRowStyleRules(List<RowStyleRule> rowStyleRules) { this.rowStyleRules = rowStyleRules; }
        public boolean isEnableFiltering() { return enableFiltering; }
        public void setEnableFiltering(boolean enableFiltering) { this.enableFiltering = enableFiltering; }
        public boolean isEnableSorting() { return enableSorting; }
        public void setEnableSorting(boolean enableSorting) { this.enableSorting = enableSorting; }
    }

    public static class ColumnDef {
        private String field;
        private String headerName;
        private String type;
        private boolean sortable;
        private boolean filterable;
        private int width;

        public ColumnDef(String field, String headerName, String type, boolean sortable, boolean filterable, int width) {
            this.field = field;
            this.headerName = headerName;
            this.type = type;
            this.sortable = sortable;
            this.filterable = filterable;
            this.width = width;
        }

        // Getters
        public String getField() { return field; }
        public String getHeaderName() { return headerName; }
        public String getType() { return type; }
        public boolean isSortable() { return sortable; }
        public boolean isFilterable() { return filterable; }
        public int getWidth() { return width; }
    }

    public static class GridRow {
        private String id;
        private Map<String, String> data;
        private String rowClass;
        private String rowColor;

        public GridRow(String id, Map<String, String> data, String rowClass, String rowColor) {
            this.id = id;
            this.data = data;
            this.rowClass = rowClass;
            this.rowColor = rowColor;
        }

        // Getters
        public String getId() { return id; }
        public Map<String, String> getData() { return data; }
        public String getRowClass() { return rowClass; }
        public String getRowColor() { return rowColor; }
    }

    public static class RowStyleRule {
        private String condition;
        private String className;
        private String color;

        public RowStyleRule(String condition, String className, String color) {
            this.condition = condition;
            this.className = className;
            this.color = color;
        }

        // Getters
        public String getCondition() { return condition; }
        public String getClassName() { return className; }
        public String getColor() { return color; }
    }

    public static class ServerSideGridConfig {
        private String dataSourceUrl;
        private int cacheBlockSize;
        private int maxBlocksInCache;

        // Getters and setters
        public String getDataSourceUrl() { return dataSourceUrl; }
        public void setDataSourceUrl(String dataSourceUrl) { this.dataSourceUrl = dataSourceUrl; }
        public int getCacheBlockSize() { return cacheBlockSize; }
        public void setCacheBlockSize(int cacheBlockSize) { this.cacheBlockSize = cacheBlockSize; }
        public int getMaxBlocksInCache() { return maxBlocksInCache; }
        public void setMaxBlocksInCache(int maxBlocksInCache) { this.maxBlocksInCache = maxBlocksInCache; }
    }

    public static class DrawerConfig {
        private String position;
        private int width;
        private boolean isOpen;
        private String openMode;

        // Getters and setters
        public String getPosition() { return position; }
        public void setPosition(String position) { this.position = position; }
        public int getWidth() { return width; }
        public void setWidth(int width) { this.width = width; }
        public boolean isOpen() { return isOpen; }
        public void setIsOpen(boolean isOpen) { this.isOpen = isOpen; }
        public String getOpenMode() { return openMode; }
        public void setOpenMode(String openMode) { this.openMode = openMode; }
    }

    public static class ModalConfig {
        private String title;
        private int width;
        private int height;
        private boolean backdrop;
        private boolean closeOnBackdrop;

        // Getters and setters
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public int getWidth() { return width; }
        public void setWidth(int width) { this.width = width; }
        public int getHeight() { return height; }
        public void setHeight(int height) { this.height = height; }
        public boolean isBackdrop() { return backdrop; }
        public void setBackdrop(boolean backdrop) { this.backdrop = backdrop; }
        public boolean isCloseOnBackdrop() { return closeOnBackdrop; }
        public void setCloseOnBackdrop(boolean closeOnBackdrop) { this.closeOnBackdrop = closeOnBackdrop; }
    }

    public static class FormConfig {
        private String formId;
        private List<FormField> fields;
        private String validationMode;
        private String submitAction;

        // Getters and setters
        public String getFormId() { return formId; }
        public void setFormId(String formId) { this.formId = formId; }
        public List<FormField> getFields() { return fields; }
        public void setFields(List<FormField> fields) { this.fields = fields; }
        public String getValidationMode() { return validationMode; }
        public void setValidationMode(String validationMode) { this.validationMode = validationMode; }
        public String getSubmitAction() { return submitAction; }
        public void setSubmitAction(String submitAction) { this.submitAction = submitAction; }
    }

    public static class FormField {
        private String fieldId;
        private String label;
        private String inputType;
        private boolean required;

        // Getters and setters
        public String getFieldId() { return fieldId; }
        public void setFieldId(String fieldId) { this.fieldId = fieldId; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public String getInputType() { return inputType; }
        public void setInputType(String inputType) { this.inputType = inputType; }
        public boolean isRequired() { return required; }
        public void setRequired(boolean required) { this.required = required; }
    }
}
