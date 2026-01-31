package com.sdui.handler;

import com.sdui.service.GridDataService;
import com.sdui.service.LayoutService;
import com.sdui.registry.ComponentRegistry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class ActionHandler {

    @Autowired
    private GridDataService gridDataService;

    @Autowired
    private LayoutService layoutService;

    @Autowired
    private ComponentRegistry componentRegistry;

    public ActionResult handle(String actionType, Map<String, Object> payload) {
        switch (actionType) {
            case "NAVIGATE":
                return handleNavigation(payload);
            case "SUBMIT_FORM":
                return handleFormSubmit(payload);
            case "REFRESH":
                return handleRefresh(payload);
            default:
                return ActionResult.failure("Unknown action: " + actionType);
        }
    }

    private ActionResult handleNavigation(Map<String, Object> payload) {
        String targetScreen = (String) payload.get("screenId");
        layoutService.getLayout(targetScreen);
        return ActionResult.success("NAVIGATED", Map.of("screenId", targetScreen));
    }

    private ActionResult handleFormSubmit(Map<String, Object> payload) {
        String componentId = (String) payload.get("componentId");
        Map<String, Object> formData = (Map<String, Object>) payload.get("formData");
        componentRegistry.validateComponent(componentId);
        return ActionResult.success("FORM_SUBMITTED", formData);
    }

    private ActionResult handleRefresh(Map<String, Object> payload) {
        String screenId = (String) payload.get("screenId");
        layoutService.getLayout(screenId);
        return ActionResult.success("REFRESHED", Map.of("screenId", screenId));
    }

    public void handleSort(String gridId, String sortField, String sortDirection) {
        gridDataService.sortGridData(gridId, sortField, sortDirection);
    }

    public void handleFilter(String gridId, Map<String, Object> filterCriteria) {
        // Apply filter criteria to grid data
        String sortField = (String) filterCriteria.getOrDefault("sortField", "id");
        gridDataService.fetchGridData(gridId, 0, 50, sortField, "ASC");
    }

    public void handleCellEdit(String gridId, String rowId, String column, Object value) {
        gridDataService.updateCell(gridId, rowId, column, value);
    }
}
