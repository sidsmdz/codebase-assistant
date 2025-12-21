package com.enterprise.erp.integration.grpc;

import com.enterprise.erp.grpc.OrderEventStreamGrpc;
import com.enterprise.erp.grpc.OrderEventRequest;
import com.enterprise.erp.grpc.OrderEventResponse;
import com.enterprise.erp.grpc.SubscribeRequest;
import com.enterprise.erp.domain.models.Order;
import com.enterprise.erp.domain.models.Enums.OrderStatus;
import com.enterprise.erp.integration.events.EventPublisher;
import com.enterprise.erp.integration.events.OrderEvent;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * gRPC Service for streaming order events in real-time
 * Demonstrates:
 * - Server-side streaming for real-time event notifications
 * - Bidirectional streaming for interactive event subscriptions
 * - Event filtering and subscription management
 * - Connection lifecycle management
 * - Backpressure handling
 *
 * This service enables microservices to subscribe to order events
 * without polling, reducing latency and system load
 */
@GrpcService
public class OrderEventStreamService extends OrderEventStreamGrpc.OrderEventStreamServiceImplBase {

    private static final Logger logger = LoggerFactory.getLogger(OrderEventStreamService.class);

    @Autowired
    private EventPublisher eventPublisher;

    // Track active subscriptions for managing connections
    private final Map<String, StreamObserver<OrderEventResponse>> activeSubscriptions = new ConcurrentHashMap<>();

    // Subscription ID generator
    private final AtomicLong subscriptionIdGenerator = new AtomicLong(0);

    // Statistics tracking
    private final AtomicLong totalEventsPublished = new AtomicLong(0);
    private final AtomicLong totalSubscribers = new AtomicLong(0);

    /**
     * Server-side streaming RPC: Subscribe to order events
     * Client sends one subscription request and receives a stream of events
     *
     * Usage example:
     * - Warehouse service subscribes to PAID and SHIPPED events
     * - Analytics service subscribes to all events for reporting
     * - Notification service subscribes to status changes
     */
    @Override
    public void subscribeToOrderEvents(
            SubscribeRequest request,
            StreamObserver<OrderEventResponse> responseObserver
    ) {
        String subscriptionId = generateSubscriptionId();

        logger.info("New subscription request: {} for event types: {}",
                subscriptionId, request.getEventTypesList());

        try {
            // Register the subscription
            activeSubscriptions.put(subscriptionId, responseObserver);
            totalSubscribers.incrementAndGet();

            // Send confirmation
            OrderEventResponse confirmation = OrderEventResponse.newBuilder()
                    .setEventType("SUBSCRIPTION_CONFIRMED")
                    .setSubscriptionId(subscriptionId)
                    .setTimestamp(System.currentTimeMillis())
                    .setMessage("Successfully subscribed to order events")
                    .build();

            responseObserver.onNext(confirmation);

            // Register event listener for this subscription
            EventListener listener = new EventListener() {
                @Override
                public void onEvent(OrderEvent event) {
                    // Filter events based on subscription preferences
                    if (shouldPublishEvent(event, request)) {
                        publishEventToSubscriber(event, responseObserver, subscriptionId);
                    }
                }
            };

            eventPublisher.registerListener(subscriptionId, listener);

            logger.info("Subscription {} registered successfully. Total active: {}",
                    subscriptionId, activeSubscriptions.size());

        } catch (Exception e) {
            logger.error("Error setting up subscription {}: {}", subscriptionId, e.getMessage());
            responseObserver.onError(e);
            cleanup(subscriptionId);
        }
    }

    /**
     * Bidirectional streaming RPC: Interactive event stream
     * Client can send commands to modify subscription in real-time
     * Server sends events based on current subscription filter
     *
     * This enables dynamic subscription management:
     * - Add/remove event types from filter
     * - Pause/resume event streaming
     * - Request event replay from specific timestamp
     */
    @Override
    public StreamObserver<OrderEventRequest> streamOrderEvents(
            StreamObserver<OrderEventResponse> responseObserver
    ) {
        String subscriptionId = generateSubscriptionId();

        logger.info("New bidirectional stream started: {}", subscriptionId);

        // State for this subscription
        SubscriptionState state = new SubscriptionState(subscriptionId);
        activeSubscriptions.put(subscriptionId, responseObserver);
        totalSubscribers.incrementAndGet();

        return new StreamObserver<OrderEventRequest>() {
            @Override
            public void onNext(OrderEventRequest request) {
                try {
                    handleSubscriptionCommand(request, state, responseObserver);
                } catch (Exception e) {
                    logger.error("Error handling request in stream {}: {}",
                            subscriptionId, e.getMessage());
                }
            }

            @Override
            public void onError(Throwable t) {
                logger.error("Error in stream {}: {}", subscriptionId, t.getMessage());
                cleanup(subscriptionId);
            }

            @Override
            public void onCompleted() {
                logger.info("Stream {} completed by client", subscriptionId);

                // Send final acknowledgment
                OrderEventResponse farewell = OrderEventResponse.newBuilder()
                        .setEventType("SUBSCRIPTION_ENDED")
                        .setSubscriptionId(subscriptionId)
                        .setTimestamp(System.currentTimeMillis())
                        .setMessage("Subscription ended successfully")
                        .build();

                responseObserver.onNext(farewell);
                responseObserver.onCompleted();
                cleanup(subscriptionId);
            }
        };
    }

    /**
     * Unary RPC: Get subscription statistics
     * Returns metrics about active subscriptions and event throughput
     */
    @Override
    public void getSubscriptionStats(
            com.enterprise.erp.grpc.StatsRequest request,
            StreamObserver<com.enterprise.erp.grpc.SubscriptionStats> responseObserver
    ) {
        try {
            com.enterprise.erp.grpc.SubscriptionStats stats =
                    com.enterprise.erp.grpc.SubscriptionStats.newBuilder()
                    .setActiveSubscriptions(activeSubscriptions.size())
                    .setTotalEventsPublished(totalEventsPublished.get())
                    .setTotalSubscribers(totalSubscribers.get())
                    .setAverageEventsPerSecond(calculateEventRate())
                    .setTimestamp(System.currentTimeMillis())
                    .build();

            responseObserver.onNext(stats);
            responseObserver.onCompleted();

            logger.debug("Stats requested - Active: {}, Total Events: {}",
                    activeSubscriptions.size(), totalEventsPublished.get());

        } catch (Exception e) {
            logger.error("Error getting stats: {}", e.getMessage());
            responseObserver.onError(e);
        }
    }

    /**
     * Handle subscription commands in bidirectional stream
     */
    private void handleSubscriptionCommand(
            OrderEventRequest request,
            SubscriptionState state,
            StreamObserver<OrderEventResponse> responseObserver
    ) {
        String command = request.getCommand();

        logger.debug("Processing command '{}' for subscription {}",
                command, state.getSubscriptionId());

        switch (command.toUpperCase()) {
            case "SUBSCRIBE":
                handleSubscribeCommand(request, state, responseObserver);
                break;

            case "UNSUBSCRIBE":
                handleUnsubscribeCommand(request, state, responseObserver);
                break;

            case "PAUSE":
                state.setPaused(true);
                sendAck(responseObserver, "Subscription paused", state.getSubscriptionId());
                break;

            case "RESUME":
                state.setPaused(false);
                sendAck(responseObserver, "Subscription resumed", state.getSubscriptionId());
                break;

            case "FILTER":
                updateFilter(request, state, responseObserver);
                break;

            case "REPLAY":
                replayEvents(request, state, responseObserver);
                break;

            case "PING":
                sendAck(responseObserver, "PONG", state.getSubscriptionId());
                break;

            default:
                logger.warn("Unknown command '{}' for subscription {}",
                        command, state.getSubscriptionId());
                sendError(responseObserver, "Unknown command: " + command,
                        state.getSubscriptionId());
        }
    }

    /**
     * Handle SUBSCRIBE command - start listening to specific event types
     */
    private void handleSubscribeCommand(
            OrderEventRequest request,
            SubscriptionState state,
            StreamObserver<OrderEventResponse> responseObserver
    ) {
        request.getEventTypesList().forEach(eventType -> {
            state.addEventType(eventType);
        });

        // Register event listener if not already registered
        if (!state.isListenerRegistered()) {
            EventListener listener = new EventListener() {
                @Override
                public void onEvent(OrderEvent event) {
                    if (!state.isPaused() && state.hasEventType(event.getEventType().name())) {
                        publishEventToSubscriber(event, responseObserver, state.getSubscriptionId());
                    }
                }
            };

            eventPublisher.registerListener(state.getSubscriptionId(), listener);
            state.setListenerRegistered(true);
        }

        sendAck(responseObserver,
                "Subscribed to event types: " + request.getEventTypesList(),
                state.getSubscriptionId());
    }

    /**
     * Handle UNSUBSCRIBE command - stop listening to specific event types
     */
    private void handleUnsubscribeCommand(
            OrderEventRequest request,
            SubscriptionState state,
            StreamObserver<OrderEventResponse> responseObserver
    ) {
        request.getEventTypesList().forEach(eventType -> {
            state.removeEventType(eventType);
        });

        sendAck(responseObserver,
                "Unsubscribed from event types: " + request.getEventTypesList(),
                state.getSubscriptionId());
    }

    /**
     * Update event filter dynamically
     */
    private void updateFilter(
            OrderEventRequest request,
            SubscriptionState state,
            StreamObserver<OrderEventResponse> responseObserver
    ) {
        // Update filter criteria (e.g., specific user IDs, order statuses, etc.)
        state.setFilterCriteria(request.getFilterMap());

        sendAck(responseObserver, "Filter updated", state.getSubscriptionId());
    }

    /**
     * Replay historical events from a specific timestamp
     * Useful for recovering from connection issues or catching up
     */
    private void replayEvents(
            OrderEventRequest request,
            SubscriptionState state,
            StreamObserver<OrderEventResponse> responseObserver
    ) {
        long fromTimestamp = request.getFromTimestamp();

        logger.info("Replaying events for subscription {} from timestamp {}",
                state.getSubscriptionId(), fromTimestamp);

        // In a real implementation, this would query an event store
        // For this example, we'll send a placeholder response
        sendAck(responseObserver,
                "Replay requested from timestamp: " + fromTimestamp,
                state.getSubscriptionId());

        // TODO: Implement actual event replay from event store
        // List<OrderEvent> historicalEvents = eventStore.getEventsSince(fromTimestamp);
        // historicalEvents.forEach(event -> publishEventToSubscriber(event, responseObserver, state.getSubscriptionId()));
    }

    /**
     * Publish an event to a specific subscriber
     */
    private void publishEventToSubscriber(
            OrderEvent event,
            StreamObserver<OrderEventResponse> responseObserver,
            String subscriptionId
    ) {
        try {
            OrderEventResponse response = convertEventToResponse(event, subscriptionId);
            responseObserver.onNext(response);
            totalEventsPublished.incrementAndGet();

            logger.trace("Published event {} to subscription {}",
                    event.getEventType(), subscriptionId);

        } catch (Exception e) {
            logger.error("Error publishing event to subscription {}: {}",
                    subscriptionId, e.getMessage());
            cleanup(subscriptionId);
        }
    }

    /**
     * Convert internal OrderEvent to gRPC OrderEventResponse
     */
    private OrderEventResponse convertEventToResponse(OrderEvent event, String subscriptionId) {
        OrderEventResponse.Builder builder = OrderEventResponse.newBuilder()
                .setEventType(event.getEventType().name())
                .setSubscriptionId(subscriptionId)
                .setOrderId(event.getOrderId())
                .setTimestamp(System.currentTimeMillis());

        // Add order details if available
        if (event.getOrder() != null) {
            Order order = event.getOrder();
            builder.setOrderNumber(order.getOrderNumber())
                   .setOrderStatus(order.getStatus().name())
                   .setUserId(order.getUserId())
                   .setTotalAmount(order.getTotal().doubleValue());
        }

        return builder.build();
    }

    /**
     * Determine if event should be published based on subscription preferences
     */
    private boolean shouldPublishEvent(OrderEvent event, SubscribeRequest request) {
        // If no specific event types requested, publish all events
        if (request.getEventTypesList().isEmpty()) {
            return true;
        }

        // Check if event type is in the subscription list
        return request.getEventTypesList().contains(event.getEventType().name());
    }

    /**
     * Send acknowledgment message
     */
    private void sendAck(
            StreamObserver<OrderEventResponse> responseObserver,
            String message,
            String subscriptionId
    ) {
        OrderEventResponse ack = OrderEventResponse.newBuilder()
                .setEventType("ACK")
                .setSubscriptionId(subscriptionId)
                .setMessage(message)
                .setTimestamp(System.currentTimeMillis())
                .build();

        responseObserver.onNext(ack);
    }

    /**
     * Send error message
     */
    private void sendError(
            StreamObserver<OrderEventResponse> responseObserver,
            String errorMessage,
            String subscriptionId
    ) {
        OrderEventResponse error = OrderEventResponse.newBuilder()
                .setEventType("ERROR")
                .setSubscriptionId(subscriptionId)
                .setMessage(errorMessage)
                .setTimestamp(System.currentTimeMillis())
                .build();

        responseObserver.onNext(error);
    }

    /**
     * Clean up subscription resources
     */
    private void cleanup(String subscriptionId) {
        activeSubscriptions.remove(subscriptionId);
        eventPublisher.unregisterListener(subscriptionId);

        logger.info("Cleaned up subscription {}. Remaining active: {}",
                subscriptionId, activeSubscriptions.size());
    }

    /**
     * Generate unique subscription ID
     */
    private String generateSubscriptionId() {
        return "SUB-" + System.currentTimeMillis() + "-" + subscriptionIdGenerator.incrementAndGet();
    }

    /**
     * Calculate events per second rate
     */
    private double calculateEventRate() {
        // Simplified calculation - in production, use a sliding window
        // For now, return a placeholder
        return totalEventsPublished.get() / 60.0; // Average over last minute (simplified)
    }

    /**
     * Subscription state management class
     */
    private static class SubscriptionState {
        private final String subscriptionId;
        private final Map<String, String> eventTypes = new ConcurrentHashMap<>();
        private Map<String, String> filterCriteria = new ConcurrentHashMap<>();
        private boolean paused = false;
        private boolean listenerRegistered = false;

        public SubscriptionState(String subscriptionId) {
            this.subscriptionId = subscriptionId;
        }

        public String getSubscriptionId() {
            return subscriptionId;
        }

        public void addEventType(String eventType) {
            eventTypes.put(eventType, eventType);
        }

        public void removeEventType(String eventType) {
            eventTypes.remove(eventType);
        }

        public boolean hasEventType(String eventType) {
            return eventTypes.containsKey(eventType);
        }

        public boolean isPaused() {
            return paused;
        }

        public void setPaused(boolean paused) {
            this.paused = paused;
        }

        public boolean isListenerRegistered() {
            return listenerRegistered;
        }

        public void setListenerRegistered(boolean listenerRegistered) {
            this.listenerRegistered = listenerRegistered;
        }

        public void setFilterCriteria(Map<String, String> filterCriteria) {
            this.filterCriteria = filterCriteria;
        }

        public Map<String, String> getFilterCriteria() {
            return filterCriteria;
        }
    }

    /**
     * Event listener interface
     */
    private interface EventListener {
        void onEvent(OrderEvent event);
    }
}
