package com.sdui.broker;

import com.sdui.event.EventProcessor;
import com.sdui.session.SessionManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
public class MessageRouter {

    @Autowired
    private EventProcessor eventProcessor;

    @Autowired
    private SessionManager sessionManager;

    @Autowired
    private WebSocketBroker webSocketBroker;

    @MessageMapping("/action")
    public void routeAction(@Payload Map<String, Object> message, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        String actionType = (String) message.get("actionType");

        if (!sessionManager.isSessionActive(sessionId)) {
            webSocketBroker.sendToSession(sessionId, Map.of(
                    "type", "ERROR",
                    "message", "Session not active"
            ));
            return;
        }

        switch (actionType) {
            case "GRID_SORT":
            case "GRID_FILTER":
            case "GRID_EDIT":
                routeGridAction(message, sessionId);
                break;
            case "NAVIGATE":
            case "SUBMIT_FORM":
            case "REFRESH":
                routeUIAction(message, sessionId);
                break;
            default:
                webSocketBroker.sendToSession(sessionId, Map.of(
                        "type", "ERROR",
                        "message", "Unknown action type: " + actionType
                ));
        }
    }

    @MessageMapping("/subscribe")
    public void handleSubscription(@Payload Map<String, Object> message, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        String topic = (String) message.get("topic");
        String resourceId = (String) message.get("resourceId");

        if ("screen".equals(topic)) {
            sessionManager.subscribeToScreen(sessionId, resourceId);
        } else if ("grid".equals(topic)) {
            sessionManager.subscribeToGrid(sessionId, resourceId);
        }
    }

    private void routeGridAction(Map<String, Object> message, String sessionId) {
        // Delegate to event processor for grid-specific handling
        eventProcessor.handleGridAction(new GridActionEvent(message));
    }

    private void routeUIAction(Map<String, Object> message, String sessionId) {
        // Delegate to event processor for UI action handling
        eventProcessor.handleUIAction(new UIActionEvent(message, sessionId));
    }
}
