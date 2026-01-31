package com.sdui.broker;

import com.sdui.session.SessionManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class WebSocketBroker {

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private SessionManager sessionManager;

    public void sendToSession(String sessionId, Map<String, Object> message) {
        if (sessionManager.isSessionActive(sessionId)) {
            messagingTemplate.convertAndSendToUser(
                    sessionId,
                    "/queue/updates",
                    message
            );
        }
    }

    public void sendToTopic(String topic, Map<String, Object> message) {
        messagingTemplate.convertAndSend("/topic/" + topic, message);
    }

    public void broadcast(Map<String, Object> message) {
        messagingTemplate.convertAndSend("/topic/broadcast", message);
    }

    public void sendGridUpdate(String gridId, Map<String, Object> update) {
        messagingTemplate.convertAndSend("/topic/grid/" + gridId, update);
    }

    public void sendLayoutUpdate(String screenId, Map<String, Object> update) {
        messagingTemplate.convertAndSend("/topic/layout/" + screenId, update);
    }
}
