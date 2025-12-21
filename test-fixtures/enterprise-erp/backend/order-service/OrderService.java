package com.enterprise.erp.backend.order;

import com.enterprise.erp.domain.models.Order;
import com.enterprise.erp.domain.models.OrderItem;
import com.enterprise.erp.domain.models.User;
import com.enterprise.erp.domain.models.Enums.OrderStatus;
import com.enterprise.erp.shared.utils.ValidationUtils;
import com.enterprise.erp.shared.utils.DateTimeUtils;
import com.enterprise.erp.integration.events.EventPublisher;
import com.enterprise.erp.integration.events.OrderEvent;
import com.enterprise.erp.backend.user.UserServiceClient;
import com.enterprise.erp.backend.inventory.InventoryServiceClient;
import com.enterprise.erp.backend.payment.PaymentServiceClient;
import com.enterprise.erp.backend.notification.NotificationServiceClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Order Service - Orchestrates order processing workflow
 * Dependencies: UserService, InventoryService, PaymentService, NotificationService
 * This demonstrates complex inter-service communication patterns
 */
@Service
@Transactional
public class OrderService {

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private UserServiceClient userServiceClient;

    @Autowired
    private InventoryServiceClient inventoryServiceClient;

    @Autowired
    private PaymentServiceClient paymentServiceClient;

    @Autowired
    private NotificationServiceClient notificationServiceClient;

    @Autowired
    private EventPublisher eventPublisher;

    @Autowired
    private OrderValidator orderValidator;

    @Autowired
    private PricingEngine pricingEngine;

    /**
     * Create new order with inventory reservation and validation
     * Complex workflow demonstrating multiple service interactions
     */
    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        // Validate request
        if (!ValidationUtils.isValidQuantity(request.getItems().size())) {
            throw new ValidationException("Order must have at least one item");
        }

        // Get user from UserService
        User user = userServiceClient.getUserById(request.getUserId())
                .orElseThrow(() -> new UserNotFoundException("User not found: " + request.getUserId()));

        if (!user.isActive()) {
            throw new InvalidOrderException("Cannot create order for inactive user");
        }

        // Validate all items and check inventory
        for (OrderItemRequest itemRequest : request.getItems()) {
            // Check inventory availability
            boolean available = inventoryServiceClient.checkAvailability(
                    itemRequest.getProductId(),
                    itemRequest.getQuantity()
            );

            if (!available) {
                throw new InsufficientInventoryException(
                        "Product " + itemRequest.getProductId() + " not available in requested quantity"
                );
            }
        }

        // Create order entity
        String orderNumber = generateOrderNumber();
        Order order = new Order(orderNumber, user.getId());
        order.setUser(user);
        order.setShippingAddress(request.getShippingAddress());

        // Add items and calculate pricing
        for (OrderItemRequest itemRequest : request.getItems()) {
            ProductInfo product = inventoryServiceClient.getProductInfo(itemRequest.getProductId());

            OrderItem item = new OrderItem();
            item.setProductId(itemRequest.getProductId());
            item.setProductName(product.getName());
            item.setQuantity(itemRequest.getQuantity());
            item.setUnitPrice(product.getPrice());

            // Apply product-specific discounts
            if (user.isPremium() && product.isPremiumEligible()) {
                BigDecimal discount = product.getPrice().multiply(new BigDecimal("0.10")); // 10% premium discount
                item.setDiscount(discount);
            }

            order.addItem(item);
        }

        // Calculate shipping cost
        BigDecimal shippingCost = pricingEngine.calculateShipping(
                order,
                user,
                request.getShippingAddress()
        );
        order.setShippingCost(shippingCost);

        // Apply promotional discounts
        if (request.getPromotionCode() != null) {
            BigDecimal promoDiscount = pricingEngine.calculatePromotionalDiscount(
                    order,
                    request.getPromotionCode()
            );
            order.applyDiscount(promoDiscount);
        }

        // Reserve inventory for all items
        for (OrderItem item : order.getItems()) {
            inventoryServiceClient.reserveInventory(
                    item.getProductId(),
                    item.getQuantity(),
                    orderNumber
            );
        }

        // Save order
        Order savedOrder = orderRepository.save(order);

        // Publish order created event
        eventPublisher.publish(new OrderEvent(
                OrderEvent.EventType.ORDER_PLACED,
                savedOrder.getId(),
                savedOrder
        ));

        // Send order confirmation notification
        notificationServiceClient.sendOrderConfirmation(user, savedOrder);

        return savedOrder;
    }

    /**
     * Process order payment
     * Coordinates with PaymentService and updates order status
     */
    @Transactional
    public Order processPayment(Long orderId, PaymentRequest paymentRequest) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException("Order not found: " + orderId));

        if (!order.requiresPayment()) {
            throw new InvalidOrderStateException("Order is not in a state that requires payment");
        }

        // Mark order as processing
        order.markAsProcessing();
        orderRepository.save(order);

        try {
            // Process payment through PaymentService
            PaymentResult paymentResult = paymentServiceClient.processPayment(
                    order.getId(),
                    order.getTotal(),
                    paymentRequest
            );

            if (paymentResult.isSuccessful()) {
                // Update order with payment info
                order.setPaymentInfo(paymentResult.getPaymentInfo());
                order.markAsPaid();

                // Confirm inventory reservation
                for (OrderItem item : order.getItems()) {
                    inventoryServiceClient.confirmReservation(
                            item.getProductId(),
                            order.getOrderNumber()
                    );
                }

                // Publish payment success event
                eventPublisher.publish(new OrderEvent(
                        OrderEvent.EventType.ORDER_PAID,
                        order.getId(),
                        order
                ));

                // Send payment confirmation
                notificationServiceClient.sendPaymentConfirmation(order.getUser(), order);

                // Automatically request fulfillment
                requestFulfillment(order);

            } else {
                // Payment failed - release inventory
                order.setStatus(OrderStatus.PAYMENT_FAILED);

                for (OrderItem item : order.getItems()) {
                    inventoryServiceClient.releaseReservation(
                            item.getProductId(),
                            order.getOrderNumber()
                    );
                }

                // Publish payment failed event
                eventPublisher.publish(new OrderEvent(
                        OrderEvent.EventType.PAYMENT_FAILED,
                        order.getId(),
                        order
                ));

                // Send payment failure notification
                notificationServiceClient.sendPaymentFailureNotification(
                        order.getUser(),
                        order,
                        paymentResult.getFailureReason()
                );
            }

            return orderRepository.save(order);

        } catch (Exception e) {
            // Handle payment processing exception
            order.setStatus(OrderStatus.PAYMENT_FAILED);
            orderRepository.save(order);

            // Release inventory reservations
            for (OrderItem item : order.getItems()) {
                try {
                    inventoryServiceClient.releaseReservation(
                            item.getProductId(),
                            order.getOrderNumber()
                    );
                } catch (Exception ex) {
                    // Log but don't fail
                    System.err.println("Failed to release inventory: " + ex.getMessage());
                }
            }

            throw new PaymentProcessingException("Payment processing failed: " + e.getMessage(), e);
        }
    }

    /**
     * Request order fulfillment from warehouse
     */
    private void requestFulfillment(Order order) {
        FulfillmentRequest fulfillmentRequest = new FulfillmentRequest(
                order.getId(),
                order.getOrderNumber(),
                order.getItems(),
                order.getShippingAddress()
        );

        // This would typically call WarehouseService
        // warehouseServiceClient.requestFulfillment(fulfillmentRequest);
    }

    /**
     * Mark order as shipped
     */
    @Transactional
    public Order shipOrder(Long orderId, String trackingNumber) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException("Order not found: " + orderId));

        if (!ValidationUtils.isNotEmpty(trackingNumber)) {
            throw new ValidationException("Tracking number is required");
        }

        order.markAsShipped(trackingNumber);
        Order shippedOrder = orderRepository.save(order);

        // Publish shipped event
        eventPublisher.publish(new OrderEvent(
                OrderEvent.EventType.ORDER_SHIPPED,
                shippedOrder.getId(),
                shippedOrder
        ));

        // Send shipping notification
        notificationServiceClient.sendShippingNotification(
                shippedOrder.getUser(),
                shippedOrder,
                trackingNumber
        );

        return shippedOrder;
    }

    /**
     * Cancel order with inventory release and refund
     */
    @Transactional
    public Order cancelOrder(Long orderId, String cancellationReason) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException("Order not found: " + orderId));

        if (!order.canBeCancelled()) {
            throw new InvalidOrderStateException("Order cannot be cancelled in its current state");
        }

        // If order was paid, process refund
        if (order.getStatus() == OrderStatus.PAID) {
            paymentServiceClient.processRefund(
                    order.getPaymentInfo().getTransactionId(),
                    order.getTotal(),
                    "Order cancelled: " + cancellationReason
            );
        }

        // Release inventory
        for (OrderItem item : order.getItems()) {
            inventoryServiceClient.releaseReservation(
                    item.getProductId(),
                    order.getOrderNumber()
            );
        }

        order.cancel(cancellationReason);
        Order cancelledOrder = orderRepository.save(order);

        // Publish cancellation event
        eventPublisher.publish(new OrderEvent(
                OrderEvent.EventType.ORDER_CANCELLED,
                cancelledOrder.getId(),
                cancelledOrder
        ));

        // Send cancellation notification
        notificationServiceClient.sendCancellationNotification(
                cancelledOrder.getUser(),
                cancelledOrder,
                cancellationReason
        );

        return cancelledOrder;
    }

    /**
     * Get order by ID
     */
    public Optional<Order> getOrderById(Long orderId) {
        return orderRepository.findById(orderId);
    }

    /**
     * Get orders by user
     */
    public List<Order> getOrdersByUser(Long userId) {
        return orderRepository.findByUserId(userId).stream()
                .sorted((o1, o2) -> o2.getOrderedAt().compareTo(o1.getOrderedAt()))
                .collect(Collectors.toList());
    }

    /**
     * Get recent orders
     */
    public List<Order> getRecentOrders(int limit) {
        LocalDateTime cutoffDate = DateTimeUtils.subtractDays(LocalDateTime.now(), 30);

        return orderRepository.findAll().stream()
                .filter(order -> order.getOrderedAt().isAfter(cutoffDate))
                .sorted((o1, o2) -> o2.getOrderedAt().compareTo(o1.getOrderedAt()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    /**
     * Search orders with complex criteria
     */
    public List<Order> searchOrders(OrderSearchCriteria criteria) {
        return orderRepository.findAll().stream()
                .filter(order -> matchesCriteria(order, criteria))
                .collect(Collectors.toList());
    }

    /**
     * Generate unique order number
     */
    private String generateOrderNumber() {
        String timestamp = String.valueOf(System.currentTimeMillis());
        String uuid = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        return "ORD-" + timestamp.substring(timestamp.length() - 8) + "-" + uuid;
    }

    /**
     * Check if order matches search criteria
     */
    private boolean matchesCriteria(Order order, OrderSearchCriteria criteria) {
        if (criteria.getStatus() != null && order.getStatus() != criteria.getStatus()) {
            return false;
        }

        if (criteria.getUserId() != null && !order.getUserId().equals(criteria.getUserId())) {
            return false;
        }

        if (criteria.getOrderNumber() != null && !order.getOrderNumber().equals(criteria.getOrderNumber())) {
            return false;
        }

        if (criteria.getFromDate() != null && order.getOrderedAt().isBefore(criteria.getFromDate())) {
            return false;
        }

        if (criteria.getToDate() != null && order.getOrderedAt().isAfter(criteria.getToDate())) {
            return false;
        }

        return true;
    }
}
