package com.sdui.controller;

import org.springframework.stereotype.Service;
import com.sdui.broker.MessageRouter.UIEventPayload;
import com.sdui.broker.WebSocketBroker;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

/**
 * Event Processor - Handles UI events from client
 *
 * Patterns demonstrated:
 * - UI-triggered flows (button clicks, selections, input changes)
 * - Event-driven architecture
 * - Server-side business logic execution
 * - Dynamic UI re-rendering based on events
 */
@Service
public class EventProcessor {

    private final LayoutController layoutController;
    private final WebSocketBroker broker;
    private final SideEffectEngine sideEffectEngine;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public EventProcessor(LayoutController layoutController,
                          WebSocketBroker broker,
                          SideEffectEngine sideEffectEngine) {
        this.layoutController = layoutController;
        this.broker = broker;
        this.sideEffectEngine = sideEffectEngine;
    }

    /**
     * Process UI event and generate appropriate response
     */
    public void processEvent(String sessionId, UIEventPayload event) {
        String eventType = event.getEventType();
        String componentId = event.getComponentId();
        Map<String, String> data = event.getData();

        System.out.println("Processing event: " + eventType + " from " + componentId);

        switch (eventType) {
            case "BUTTON_CLICK":
                handleButtonClick(sessionId, componentId, data);
                break;

            case "ROW_SELECTED":
                handleRowSelected(sessionId, componentId, data);
                break;

            case "INPUT_CHANGED":
                handleInputChanged(sessionId, componentId, data);
                break;

            case "FORM_SUBMITTED":
                handleFormSubmitted(sessionId, componentId, data);
                break;

            case "FILTER_CHANGED":
                handleFilterChanged(sessionId, componentId, data);
                break;

            case "DRAWER_OPENED":
            case "DRAWER_CLOSED":
                handleDrawerToggle(sessionId, componentId, eventType, data);
                break;

            default:
                System.err.println("Unknown event type: " + eventType);
        }
    }

    /**
     * Handle button clicks - demonstrates UI-triggered rendering
     */
    private void handleButtonClick(String sessionId, String componentId, Map<String, String> data) {
        String buttonId = data.get("buttonId");

        System.out.println("Button clicked: " + buttonId);

        // Different buttons trigger different UI responses
        switch (buttonId) {
            case "loadUsers_classPattern":
                // Pattern A1: Render grid with class-based row styling
                sendUIRender(sessionId, layoutController.buildUserGridClassBased());
                break;

            case "loadUsers_colorPattern":
                // Pattern A2: Render grid with color-based row styling
                sendUIRender(sessionId, layoutController.buildUserGridColorBased());
                break;

            case "loadUsers_rulePattern":
                // Pattern A3: Render grid with rule-based row styling
                sendUIRender(sessionId, layoutController.buildUserGridRuleBased());
                break;

            case "loadServerGrid":
                // Pattern D: Render server-side grid
                sendUIRender(sessionId, layoutController.buildServerSideGrid());
                break;

            case "openNotifications_action":
                // Pattern B1: Open drawer via UI_ACTION
                sendUIAction(sessionId, layoutController.openDrawerActionBased("drawer_notifications"));
                break;

            case "openNotifications_render":
                // Pattern B2: Open drawer via UI_RENDER
                sendUIRender(sessionId, layoutController.openDrawerRenderBased());
                break;

            case "openNotifications_state":
                // Pattern B3: Open drawer via STATE_SYNC
                sendStateSync(sessionId, layoutController.openDrawerStateBased("drawer_notifications"));
                break;

            case "createUser":
                // Pattern E: Open modal with form
                sendUIRender(sessionId, layoutController.buildModalWithForm());
                break;

            default:
                System.out.println("Unhandled button: " + buttonId);
        }
    }

    /**
     * Handle grid row selection
     * Pattern: Client interaction triggers server-side logic
     */
    private void handleRowSelected(String sessionId, String componentId, Map<String, String> data) {
        String rowId = data.get("rowId");
        String userName = data.get("userName");

        System.out.println("Row selected: " + rowId + " (" + userName + ")");

        // Trigger side effect: load user details in drawer
        sideEffectEngine.loadUserDetails(sessionId, rowId);
    }

    /**
     * Handle input field changes
     * Pattern: Real-time validation as user types
     */
    private void handleInputChanged(String sessionId, String componentId, Map<String, String> data) {
        String fieldId = data.get("fieldId");
        String value = data.get("value");
        String validationMode = data.getOrDefault("validationMode", "INLINE");

        System.out.println("Input changed: " + fieldId + " = " + value);

        // Choose validation pattern based on mode
        switch (validationMode) {
            case "INLINE":
                // Pattern C1: Inline validation
                sendUIAction(sessionId, layoutController.validateFieldInline(fieldId, value));
                break;

            case "REALTIME_DEBOUNCED":
                // Pattern C3: Debounced validation
                sendUIAction(sessionId, layoutController.validateFieldDebounced(fieldId, value));
                break;

            default:
                // No validation on change
                break;
        }
    }

    /**
     * Handle form submission
     * Pattern: Batch validation on submit
     */
    private void handleFormSubmitted(String sessionId, String componentId, Map<String, String> data) {
        System.out.println("Form submitted: " + componentId);

        // Pattern C2: Batch validation
        LayoutController.UIActionPayload validation =
                layoutController.validateFormBatch(data);

        sendUIAction(sessionId, validation);

        // If valid, process form data
        String isValid = validation.getParams().get("valid");
        if ("true".equals(isValid)) {
            System.out.println("Form is valid, processing submission...");
            // Process form data (save to database, etc.)
            // Then send success response
        }
    }

    /**
     * Handle grid filter changes
     * Pattern: Server-side filtering for server-side grid
     */
    private void handleFilterChanged(String sessionId, String componentId, Map<String, String> data) {
        String filterField = data.get("field");
        String filterValue = data.get("value");

        System.out.println("Filter changed: " + filterField + " = " + filterValue);

        // For server-side grid, trigger data reload with filters
        // This demonstrates server-side data processing pattern
    }

    /**
     * Handle drawer open/close events
     * Pattern: Track client-side state changes on server
     */
    private void handleDrawerToggle(String sessionId, String componentId,
                                     String eventType, Map<String, String> data) {
        System.out.println("Drawer " + eventType + ": " + componentId);

        // Could trigger analytics, state persistence, etc.
    }

    // Message sending helpers
    private void sendUIRender(String sessionId, LayoutController.UIRenderPayload payload) {
        try {
            WebSocketBroker.BrokerMessage message = new WebSocketBroker.BrokerMessage();
            message.setMessageId("render_" + System.currentTimeMillis());
            message.setTimestamp(System.currentTimeMillis());
            message.setType("UI_RENDER");
            message.setPayload(objectMapper.writeValueAsBytes(payload));

            broker.sendToSession(sessionId, message);
        } catch (Exception e) {
            System.err.println("Error sending UI_RENDER: " + e.getMessage());
        }
    }

    private void sendUIAction(String sessionId, LayoutController.UIActionPayload payload) {
        try {
            WebSocketBroker.BrokerMessage message = new WebSocketBroker.BrokerMessage();
            message.setMessageId("action_" + System.currentTimeMillis());
            message.setTimestamp(System.currentTimeMillis());
            message.setType("UI_ACTION");
            message.setPayload(objectMapper.writeValueAsBytes(payload));

            broker.sendToSession(sessionId, message);
        } catch (Exception e) {
            System.err.println("Error sending UI_ACTION: " + e.getMessage());
        }
    }

    private void sendStateSync(String sessionId, LayoutController.StateSyncPayload payload) {
        try {
            WebSocketBroker.BrokerMessage message = new WebSocketBroker.BrokerMessage();
            message.setMessageId("state_" + System.currentTimeMillis());
            message.setTimestamp(System.currentTimeMillis());
            message.setType("STATE_SYNC");
            message.setPayload(objectMapper.writeValueAsBytes(payload));

            broker.sendToSession(sessionId, message);
        } catch (Exception e) {
            System.err.println("Error sending STATE_SYNC: " + e.getMessage());
        }
    }
}
