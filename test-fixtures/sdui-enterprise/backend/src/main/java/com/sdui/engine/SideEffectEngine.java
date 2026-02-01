package com.sdui.engine;

import com.sdui.service.NotificationService;
import com.sdui.session.SessionManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.sdui.util.Observable;

@Component
public class SideEffectEngine extends Observable {

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private SessionManager sessionManager;

    public void processSideEffects(ActionResult result) {
        String resultType = result.getType();
        Map<String, Object> data = result.getData();

        switch (resultType) {
            case "NAVIGATED":
                String screenId = (String) data.get("screenId");
                notificationService.notifyLayoutChange(screenId, "NAVIGATION");
                notifyObservers("NAVIGATION", data);
                break;
            case "FORM_SUBMITTED":
                notificationService.broadcastSystemEvent("FORM_SUBMIT", "Form submitted successfully");
                notifyObservers("FORM_SUBMIT", data);
                break;
            case "REFRESHED":
                String refreshScreenId = (String) data.get("screenId");
                notificationService.notifyLayoutChange(refreshScreenId, "REFRESH");
                notifyObservers("REFRESH", data);
                break;
        }
    }

    public void processGridUpdate(String gridId, String action) {
        notificationService.notifyGridUpdate(gridId, action, Map.of("gridId", gridId));
        notifyObservers("GRID_" + action, Map.of("gridId", gridId));
    }

    public void cleanupSession(String sessionId) {
        sessionManager.removeSession(sessionId);
        notifyObservers("SESSION_CLEANUP", Map.of("sessionId", sessionId));
    }

    private void notifyObservers(String eventType, Map<String, Object> data) {
        for (SideEffectObserver observer : observers) {
            observer.onSideEffect(eventType, data);
        }
    }
}
