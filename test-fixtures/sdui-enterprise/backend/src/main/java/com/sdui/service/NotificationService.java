package com.sdui.service;

import com.sdui.notification.NotificationBuilder;
import com.sdui.session.SessionManager;
import com.sdui.broker.WebSocketBroker;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class NotificationService {

    @Autowired
    private NotificationBuilder notificationBuilder;

    @Autowired
    private SessionManager sessionManager;

    @Autowired
    private WebSocketBroker webSocketBroker;

    private final Map<String, List<String>> subscriptions = new ConcurrentHashMap<>();

    public void notifyLayoutChange(String screenId, String changeType) {
        Map<String, Object> notification = notificationBuilder
                .withType("LAYOUT_CHANGE")
                .withPayload("screenId", screenId)
                .withPayload("changeType", changeType)
                .build();

        List<String> sessions = sessionManager.getSessionsForScreen(screenId);
        for (String sessionId : sessions) {
            webSocketBroker.sendToSession(sessionId, notification);
        }
    }

    public void notifyGridUpdate(String gridId, String updateType, Object data) {
        Map<String, Object> notification = notificationBuilder
                .withType("GRID_UPDATE")
                .withPayload("gridId", gridId)
                .withPayload("updateType", updateType)
                .withPayload("data", data)
                .build();

        List<String> sessions = sessionManager.getSessionsForGrid(gridId);
        for (String sessionId : sessions) {
            webSocketBroker.sendToSession(sessionId, notification);
        }
    }

    public void broadcastSystemEvent(String eventType, String message) {
        Map<String, Object> notification = notificationBuilder
                .withType("SYSTEM_EVENT")
                .withPayload("eventType", eventType)
                .withPayload("message", message)
                .build();

        webSocketBroker.broadcast(notification);
    }

    public void subscribe(String sessionId, String topic) {
        subscriptions.computeIfAbsent(topic, k -> new java.util.ArrayList<>()).add(sessionId);
    }

    public void unsubscribe(String sessionId, String topic) {
        List<String> sessions = subscriptions.get(topic);
        if (sessions != null) {
            sessions.remove(sessionId);
        }
    }
}
