package com.sdui.broker;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;
import java.io.IOException;

/**
 * WebSocket Broker - Central message router
 * Handles bidirectional communication between React client and Java backend
 *
 * Patterns demonstrated:
 * - Session management with concurrent maps
 * - Message routing based on type
 * - Error handling and recovery
 */
@Component
public class WebSocketBroker extends TextWebSocketHandler {

    private final Map<String, WebSocketSession> activeSessions = new ConcurrentHashMap<>();
    private final MessageRouter messageRouter;
    private final SessionManager sessionManager;
    private final ObjectMapper objectMapper;

    public WebSocketBroker(MessageRouter messageRouter, SessionManager sessionManager) {
        this.messageRouter = messageRouter;
        this.sessionManager = sessionManager;
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String sessionId = session.getId();
        activeSessions.put(sessionId, session);
        sessionManager.registerSession(sessionId, session);

        System.out.println("WebSocket connected: " + sessionId);

        // Send initial connection acknowledgment
        sendConnectionAck(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String sessionId = session.getId();
        String payload = message.getPayload();

        try {
            // Parse message envelope
            BrokerMessage brokerMessage = objectMapper.readValue(payload, BrokerMessage.class);

            // Update session activity
            sessionManager.updateActivity(sessionId);

            // Route message based on type
            messageRouter.routeMessage(sessionId, brokerMessage);

        } catch (Exception e) {
            System.err.println("Error processing message from " + sessionId + ": " + e.getMessage());
            sendError(session, "PROCESSING_ERROR", e.getMessage());
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        String sessionId = session.getId();
        System.err.println("WebSocket error for session " + sessionId + ": " + exception.getMessage());
        sessionManager.handleError(sessionId, exception);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String sessionId = session.getId();
        activeSessions.remove(sessionId);
        sessionManager.unregisterSession(sessionId);

        System.out.println("WebSocket disconnected: " + sessionId + ", status: " + status);
    }

    /**
     * Send message to specific session
     */
    public void sendToSession(String sessionId, BrokerMessage message) {
        WebSocketSession session = activeSessions.get(sessionId);
        if (session != null && session.isOpen()) {
            try {
                String json = objectMapper.writeValueAsString(message);
                session.sendMessage(new TextMessage(json));
            } catch (IOException e) {
                System.err.println("Failed to send message to " + sessionId + ": " + e.getMessage());
            }
        }
    }

    /**
     * Broadcast message to all active sessions
     */
    public void broadcast(BrokerMessage message) {
        activeSessions.forEach((sessionId, session) -> {
            if (session.isOpen()) {
                sendToSession(sessionId, message);
            }
        });
    }

    /**
     * Send connection acknowledgment
     */
    private void sendConnectionAck(WebSocketSession session) throws IOException {
        BrokerMessage ack = new BrokerMessage();
        ack.setMessageId("ack_" + System.currentTimeMillis());
        ack.setTimestamp(System.currentTimeMillis());
        ack.setType("CONNECTION_ACK");

        Map<String, String> metadata = new HashMap<>();
        metadata.put("sessionId", session.getId());
        metadata.put("status", "connected");
        ack.setMetadata(metadata);

        String json = objectMapper.writeValueAsString(ack);
        session.sendMessage(new TextMessage(json));
    }

    /**
     * Send error message to client
     */
    private void sendError(WebSocketSession session, String errorCode, String errorMessage) {
        try {
            BrokerMessage error = new BrokerMessage();
            error.setMessageId("error_" + System.currentTimeMillis());
            error.setTimestamp(System.currentTimeMillis());
            error.setType("ERROR");

            Map<String, String> errorData = new HashMap<>();
            errorData.put("code", errorCode);
            errorData.put("message", errorMessage);
            error.setPayload(objectMapper.writeValueAsBytes(errorData));

            String json = objectMapper.writeValueAsString(error);
            session.sendMessage(new TextMessage(json));
        } catch (Exception e) {
            System.err.println("Failed to send error message: " + e.getMessage());
        }
    }

    // POJO for message envelope
    public static class BrokerMessage {
        private String messageId;
        private long timestamp;
        private String type;
        private byte[] payload;
        private Map<String, String> metadata;

        // Getters and setters
        public String getMessageId() { return messageId; }
        public void setMessageId(String messageId) { this.messageId = messageId; }

        public long getTimestamp() { return timestamp; }
        public void setTimestamp(long timestamp) { this.timestamp = timestamp; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public byte[] getPayload() { return payload; }
        public void setPayload(byte[] payload) { this.payload = payload; }

        public Map<String, String> getMetadata() { return metadata; }
        public void setMetadata(Map<String, String> metadata) { this.metadata = metadata; }
    }
}
