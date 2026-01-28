package com.sdui.broker;

import org.springframework.stereotype.Component;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sdui.controller.EventProcessor;
import com.sdui.controller.SideEffectEngine;

/**
 * Message Router - Routes incoming messages to appropriate handlers
 *
 * Patterns demonstrated:
 * - Strategy pattern for message type handling
 * - Dependency injection for handler registration
 * - Async processing for non-blocking operation
 */
@Component
public class MessageRouter {

    private final EventProcessor eventProcessor;
    private final SideEffectEngine sideEffectEngine;
    private final ObjectMapper objectMapper;

    public MessageRouter(EventProcessor eventProcessor, SideEffectEngine sideEffectEngine) {
        this.eventProcessor = eventProcessor;
        this.sideEffectEngine = sideEffectEngine;
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Route message based on type
     */
    public void routeMessage(String sessionId, WebSocketBroker.BrokerMessage message) {
        String messageType = message.getType();

        System.out.println("Routing message type: " + messageType + " from session: " + sessionId);

        switch (messageType) {
            case "UI_EVENT":
                handleUIEvent(sessionId, message);
                break;

            case "STATE_SYNC":
                handleStateSync(sessionId, message);
                break;

            case "HEARTBEAT":
                handleHeartbeat(sessionId, message);
                break;

            default:
                System.err.println("Unknown message type: " + messageType);
        }
    }

    /**
     * Handle UI events from client
     * Pattern: UI-triggered flow (Client → Server → Client)
     */
    private void handleUIEvent(String sessionId, WebSocketBroker.BrokerMessage message) {
        try {
            // Deserialize event payload
            UIEventPayload event = objectMapper.readValue(message.getPayload(), UIEventPayload.class);

            System.out.println("Processing UI event: " + event.getEventType() +
                    " from component: " + event.getComponentId());

            // Delegate to event processor
            eventProcessor.processEvent(sessionId, event);

        } catch (Exception e) {
            System.err.println("Error handling UI event: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Handle state synchronization
     * Pattern: Bidirectional state sync
     */
    private void handleStateSync(String sessionId, WebSocketBroker.BrokerMessage message) {
        try {
            // Deserialize state payload
            StateSyncPayload state = objectMapper.readValue(message.getPayload(), StateSyncPayload.class);

            System.out.println("Syncing state: " + state.getStateType() + " for session: " + sessionId);

            // Process state synchronization
            sideEffectEngine.syncState(sessionId, state);

        } catch (Exception e) {
            System.err.println("Error handling state sync: " + e.getMessage());
        }
    }

    /**
     * Handle heartbeat (keep-alive)
     */
    private void handleHeartbeat(String sessionId, WebSocketBroker.BrokerMessage message) {
        System.out.println("Heartbeat from session: " + sessionId);
        // Session manager already updated activity timestamp
    }

    // Payload POJOs
    public static class UIEventPayload {
        private String eventId;
        private String eventType;
        private String componentId;
        private String sessionId;
        private Map<String, String> data;
        private long clientTimestamp;

        // Getters and setters
        public String getEventId() { return eventId; }
        public void setEventId(String eventId) { this.eventId = eventId; }

        public String getEventType() { return eventType; }
        public void setEventType(String eventType) { this.eventType = eventType; }

        public String getComponentId() { return componentId; }
        public void setComponentId(String componentId) { this.componentId = componentId; }

        public String getSessionId() { return sessionId; }
        public void setSessionId(String sessionId) { this.sessionId = sessionId; }

        public Map<String, String> getData() { return data; }
        public void setData(Map<String, String> data) { this.data = data; }

        public long getClientTimestamp() { return clientTimestamp; }
        public void setClientTimestamp(long clientTimestamp) { this.clientTimestamp = clientTimestamp; }
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
}
