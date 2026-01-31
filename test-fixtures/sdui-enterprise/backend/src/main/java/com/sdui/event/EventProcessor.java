package com.sdui.event;

import com.sdui.handler.ActionHandler;
import com.sdui.engine.SideEffectEngine;
import com.sdui.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class EventProcessor {

    @Autowired
    private ActionHandler actionHandler;

    @Autowired
    private SideEffectEngine sideEffectEngine;

    @Autowired
    private NotificationService notificationService;

    @EventListener
    public void handleUIAction(UIActionEvent event) {
        String actionType = event.getActionType();
        Map<String, Object> payload = event.getPayload();

        ActionResult result = actionHandler.handle(actionType, payload);

        if (result.isSuccess()) {
            sideEffectEngine.processSideEffects(result);
            notificationService.notifyLayoutChange(
                    event.getScreenId(),
                    "ACTION_COMPLETED"
            );
        }
    }

    @EventListener
    public void handleGridAction(GridActionEvent event) {
        String gridId = event.getGridId();
        String action = event.getAction();

        switch (action) {
            case "SORT":
                actionHandler.handleSort(gridId, event.getSortField(), event.getSortDirection());
                break;
            case "FILTER":
                actionHandler.handleFilter(gridId, event.getFilterCriteria());
                break;
            case "EDIT":
                actionHandler.handleCellEdit(gridId, event.getRowId(), event.getColumn(), event.getValue());
                break;
            default:
                throw new IllegalArgumentException("Unknown grid action: " + action);
        }

        sideEffectEngine.processGridUpdate(gridId, action);
    }

    @EventListener
    public void handleSessionEvent(SessionEvent event) {
        if ("DISCONNECT".equals(event.getType())) {
            sideEffectEngine.cleanupSession(event.getSessionId());
        }
    }
}
