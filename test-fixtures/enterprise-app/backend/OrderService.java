package com.enterprise.backend.service;

import com.enterprise.backend.repository.OrderRepository;
import com.enterprise.backend.repository.UserRepository;
import com.enterprise.backend.model.Order;
import com.enterprise.backend.model.User;
import com.enterprise.grpc.PaymentServiceGrpc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service for managing orders and payment processing.
 * Integrates with payment gRPC service and user service.
 */
@Service
@Transactional
public class OrderService {

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PaymentServiceGrpc paymentService;

    @Autowired
    private AuditService auditService;

    /**
     * Creates a new order for a user.
     * @param userId User placing the order
     * @param items List of order items
     * @return Created order
     */
    public Order createOrder(Long userId, List<OrderItem> items) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("User not found"));

        Order order = new Order();
        order.setUserId(userId);
        order.setStatus("PENDING");
        order.setCreatedAt(LocalDateTime.now());
        order.setItems(items);

        BigDecimal totalAmount = calculateTotal(items);
        order.setTotalAmount(totalAmount);

        Order savedOrder = orderRepository.save(order);

        auditService.logOrderCreation(savedOrder.getId(), userId, totalAmount);

        return savedOrder;
    }

    /**
     * Processes payment for an order.
     * @param orderId Order ID
     * @param paymentMethod Payment method
     * @return Payment result
     */
    public PaymentResult processPayment(Long orderId, String paymentMethod) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new RuntimeException("Order not found"));

        try {
            // Call gRPC payment service
            boolean paymentSuccess = paymentService.processPayment(
                orderId,
                order.getTotalAmount(),
                paymentMethod
            );

            if (paymentSuccess) {
                order.setStatus("PAID");
                order.setPaidAt(LocalDateTime.now());
                orderRepository.save(order);

                auditService.logPaymentSuccess(orderId);

                return new PaymentResult(true, "Payment processed successfully");
            } else {
                order.setStatus("PAYMENT_FAILED");
                orderRepository.save(order);

                auditService.logPaymentFailure(orderId);

                return new PaymentResult(false, "Payment declined");
            }
        } catch (Exception e) {
            order.setStatus("ERROR");
            orderRepository.save(order);

            auditService.logError("processPayment", orderId, e);

            throw new RuntimeException("Payment processing failed", e);
        }
    }

    /**
     * Retrieves all orders for a specific user.
     * @param userId User ID
     * @return List of user's orders
     */
    public List<Order> getOrdersByUserId(Long userId) {
        return orderRepository.findByUserId(userId).stream()
            .sorted((o1, o2) -> o2.getCreatedAt().compareTo(o1.getCreatedAt()))
            .collect(Collectors.toList());
    }

    /**
     * Retrieves orders by status.
     * @param status Order status
     * @return List of orders with the status
     */
    public List<Order> getOrdersByStatus(String status) {
        return orderRepository.findAll().stream()
            .filter(order -> status.equals(order.getStatus()))
            .collect(Collectors.toList());
    }

    /**
     * Cancels an existing order.
     * @param orderId Order ID
     */
    public void cancelOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new RuntimeException("Order not found"));

        if ("PAID".equals(order.getStatus())) {
            // Process refund through gRPC service
            paymentService.processRefund(orderId, order.getTotalAmount());
        }

        order.setStatus("CANCELLED");
        order.setCancelledAt(LocalDateTime.now());
        orderRepository.save(order);

        auditService.logOrderCancellation(orderId);
    }

    /**
     * Calculates total amount for order items.
     * @param items List of order items
     * @return Total amount
     */
    private BigDecimal calculateTotal(List<OrderItem> items) {
        return items.stream()
            .map(item -> item.getPrice().multiply(new BigDecimal(item.getQuantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Gets order statistics for a user.
     * @param userId User ID
     * @return Order statistics
     */
    public OrderStatistics getOrderStatistics(Long userId) {
        List<Order> orders = getOrdersByUserId(userId);

        long totalOrders = orders.size();
        long completedOrders = orders.stream()
            .filter(o -> "COMPLETED".equals(o.getStatus()))
            .count();

        BigDecimal totalSpent = orders.stream()
            .filter(o -> "PAID".equals(o.getStatus()) || "COMPLETED".equals(o.getStatus()))
            .map(Order::getTotalAmount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new OrderStatistics(totalOrders, completedOrders, totalSpent);
    }

    /**
     * Inner class for payment results.
     */
    public static class PaymentResult {
        private boolean success;
        private String message;

        public PaymentResult(boolean success, String message) {
            this.success = success;
            this.message = message;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
    }

    /**
     * Inner class for order statistics.
     */
    public static class OrderStatistics {
        private long totalOrders;
        private long completedOrders;
        private BigDecimal totalSpent;

        public OrderStatistics(long totalOrders, long completedOrders, BigDecimal totalSpent) {
            this.totalOrders = totalOrders;
            this.completedOrders = completedOrders;
            this.totalSpent = totalSpent;
        }

        public long getTotalOrders() { return totalOrders; }
        public long getCompletedOrders() { return completedOrders; }
        public BigDecimal getTotalSpent() { return totalSpent; }
    }

    /**
     * Inner class for order items.
     */
    public static class OrderItem {
        private String productId;
        private String productName;
        private int quantity;
        private BigDecimal price;

        public String getProductId() { return productId; }
        public void setProductId(String productId) { this.productId = productId; }

        public String getProductName() { return productName; }
        public void setProductName(String productName) { this.productName = productName; }

        public int getQuantity() { return quantity; }
        public void setQuantity(int quantity) { this.quantity = quantity; }

        public BigDecimal getPrice() { return price; }
        public void setPrice(BigDecimal price) { this.price = price; }
    }
}
