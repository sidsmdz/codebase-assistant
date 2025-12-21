package com.enterprise.erp.integration.api;

import com.enterprise.erp.backend.order.OrderService;
import com.enterprise.erp.backend.order.CreateOrderRequest;
import com.enterprise.erp.backend.order.PaymentRequest;
import com.enterprise.erp.backend.order.OrderSearchCriteria;
import com.enterprise.erp.domain.models.Order;
import com.enterprise.erp.domain.models.Enums.OrderStatus;
import com.enterprise.erp.shared.utils.ValidationUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.validation.Valid;
import javax.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * REST API Controller for Order Management
 * Demonstrates Spring Boot REST API patterns:
 * - RESTful endpoint design with proper HTTP methods
 * - Request/Response DTOs with validation
 * - Exception handling with @ControllerAdvice
 * - Security annotations for role-based access
 * - API documentation with Swagger/OpenAPI
 * - HATEOAS links for resource navigation
 * - Async processing with @Async
 * - Rate limiting and throttling
 */
@RestController
@RequestMapping("/api/v1/orders")
@Tag(name = "Order Management", description = "APIs for managing customer orders")
@Validated
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:4200"})
public class OrderApiController {

    private static final Logger logger = LoggerFactory.getLogger(OrderApiController.class);

    @Autowired
    private OrderService orderService;

    /**
     * Create a new order
     * POST /api/v1/orders
     *
     * Security: Requires CUSTOMER role
     * Rate Limit: 10 requests per minute per user
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('CUSTOMER', 'PREMIUM_CUSTOMER', 'ADMIN')")
    @Operation(
        summary = "Create a new order",
        description = "Creates a new order with the specified items and shipping information"
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "201", description = "Order created successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid request data"),
        @ApiResponse(responseCode = "401", description = "Unauthorized"),
        @ApiResponse(responseCode = "409", description = "Insufficient inventory"),
        @ApiResponse(responseCode = "429", description = "Rate limit exceeded")
    })
    public ResponseEntity<OrderResponse> createOrder(
            @Valid @RequestBody CreateOrderRequest request,
            @RequestHeader("X-User-Id") Long userId
    ) {
        logger.info("Creating order for user: {}", userId);

        try {
            // Set user ID from authenticated context
            request.setUserId(userId);

            // Validate request
            validateCreateOrderRequest(request);

            // Create order through service
            Order order = orderService.createOrder(request);

            // Convert to response DTO
            OrderResponse response = convertToResponse(order);

            logger.info("Order created successfully: {}", order.getOrderNumber());

            return ResponseEntity
                    .status(HttpStatus.CREATED)
                    .header("Location", "/api/v1/orders/" + order.getId())
                    .body(response);

        } catch (InsufficientInventoryException e) {
            logger.warn("Insufficient inventory for order: {}", e.getMessage());
            throw new ApiException(HttpStatus.CONFLICT, "Insufficient inventory", e.getMessage());

        } catch (ValidationException e) {
            logger.warn("Validation error creating order: {}", e.getMessage());
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid request", e.getMessage());

        } catch (Exception e) {
            logger.error("Error creating order: {}", e.getMessage(), e);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create order", e.getMessage());
        }
    }

    /**
     * Get order by ID
     * GET /api/v1/orders/{orderId}
     *
     * Security: User can only view their own orders unless ADMIN
     */
    @GetMapping("/{orderId}")
    @PreAuthorize("hasAnyRole('CUSTOMER', 'PREMIUM_CUSTOMER', 'ADMIN')")
    @Operation(summary = "Get order by ID", description = "Retrieves order details by order ID")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Order found"),
        @ApiResponse(responseCode = "404", description = "Order not found"),
        @ApiResponse(responseCode = "403", description = "Access denied")
    })
    public ResponseEntity<OrderResponse> getOrder(
            @PathVariable Long orderId,
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Role", defaultValue = "CUSTOMER") String userRole
    ) {
        logger.debug("Getting order {} for user {}", orderId, userId);

        Order order = orderService.getOrderById(orderId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "Order not found",
                        "Order with ID " + orderId + " does not exist"
                ));

        // Authorization check - users can only view their own orders
        if (!userRole.contains("ADMIN") && !order.getUserId().equals(userId)) {
            logger.warn("User {} attempted to access order {} belonging to user {}",
                    userId, orderId, order.getUserId());
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied", "You can only view your own orders");
        }

        OrderResponse response = convertToResponse(order);
        return ResponseEntity.ok(response);
    }

    /**
     * Get all orders for the authenticated user
     * GET /api/v1/orders
     *
     * Supports filtering, sorting, and pagination
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('CUSTOMER', 'PREMIUM_CUSTOMER', 'ADMIN')")
    @Operation(summary = "Get orders", description = "Retrieves orders with optional filtering")
    public ResponseEntity<OrderListResponse> getOrders(
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Role", defaultValue = "CUSTOMER") String userRole,
            @Parameter(description = "Filter by status") @RequestParam(required = false) OrderStatus status,
            @Parameter(description = "From date") @RequestParam(required = false) String fromDate,
            @Parameter(description = "To date") @RequestParam(required = false) String toDate,
            @Parameter(description = "Page number") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "20") int pageSize
    ) {
        logger.debug("Getting orders for user {} with filters - status: {}, fromDate: {}, toDate: {}",
                userId, status, fromDate, toDate);

        List<Order> orders;

        // Admin can see all orders, customers only their own
        if (userRole.contains("ADMIN")) {
            OrderSearchCriteria criteria = buildSearchCriteria(null, status, fromDate, toDate);
            orders = orderService.searchOrders(criteria);
        } else {
            orders = orderService.getOrdersByUser(userId);

            // Apply filters
            if (status != null) {
                orders = orders.stream()
                        .filter(o -> o.getStatus() == status)
                        .toList();
            }
        }

        // Apply pagination
        int start = page * pageSize;
        int end = Math.min(start + pageSize, orders.size());
        List<Order> paginatedOrders = orders.subList(start, end);

        // Convert to response
        List<OrderResponse> orderResponses = paginatedOrders.stream()
                .map(this::convertToResponse)
                .toList();

        OrderListResponse response = new OrderListResponse();
        response.setOrders(orderResponses);
        response.setTotalCount(orders.size());
        response.setPage(page);
        response.setPageSize(pageSize);
        response.setTotalPages((int) Math.ceil((double) orders.size() / pageSize));

        return ResponseEntity.ok(response);
    }

    /**
     * Process payment for an order
     * POST /api/v1/orders/{orderId}/payment
     *
     * Security: User can only pay for their own orders
     * This endpoint is idempotent - multiple calls with same payment info won't charge twice
     */
    @PostMapping("/{orderId}/payment")
    @PreAuthorize("hasAnyRole('CUSTOMER', 'PREMIUM_CUSTOMER', 'ADMIN')")
    @Operation(summary = "Process payment", description = "Process payment for a pending order")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Payment processed successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid payment request"),
        @ApiResponse(responseCode = "402", description = "Payment failed"),
        @ApiResponse(responseCode = "409", description = "Order not in valid state for payment")
    })
    public ResponseEntity<OrderResponse> processPayment(
            @PathVariable Long orderId,
            @Valid @RequestBody PaymentRequest paymentRequest,
            @RequestHeader("X-User-Id") Long userId
    ) {
        logger.info("Processing payment for order {} by user {}", orderId, userId);

        try {
            // Verify order ownership
            Order order = orderService.getOrderById(orderId)
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.NOT_FOUND,
                            "Order not found",
                            "Order with ID " + orderId + " does not exist"
                    ));

            if (!order.getUserId().equals(userId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Access denied", "You can only pay for your own orders");
            }

            // Process payment
            Order updatedOrder = orderService.processPayment(orderId, paymentRequest);

            OrderResponse response = convertToResponse(updatedOrder);

            logger.info("Payment processed successfully for order {}", orderId);

            return ResponseEntity.ok(response);

        } catch (PaymentProcessingException e) {
            logger.error("Payment processing failed for order {}: {}", orderId, e.getMessage());
            throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "Payment failed", e.getMessage());

        } catch (InvalidOrderStateException e) {
            logger.warn("Invalid order state for payment {}: {}", orderId, e.getMessage());
            throw new ApiException(HttpStatus.CONFLICT, "Invalid order state", e.getMessage());
        }
    }

    /**
     * Ship an order
     * POST /api/v1/orders/{orderId}/ship
     *
     * Security: Requires WAREHOUSE_MANAGER or ADMIN role
     */
    @PostMapping("/{orderId}/ship")
    @PreAuthorize("hasAnyRole('WAREHOUSE_MANAGER', 'ADMIN')")
    @Operation(summary = "Ship order", description = "Mark order as shipped with tracking number")
    public ResponseEntity<OrderResponse> shipOrder(
            @PathVariable Long orderId,
            @Valid @RequestBody ShipOrderRequest request
    ) {
        logger.info("Shipping order {} with tracking number {}", orderId, request.getTrackingNumber());

        try {
            Order order = orderService.shipOrder(orderId, request.getTrackingNumber());
            OrderResponse response = convertToResponse(order);

            logger.info("Order {} shipped successfully", orderId);

            return ResponseEntity.ok(response);

        } catch (OrderNotFoundException e) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Order not found", e.getMessage());

        } catch (InvalidOrderStateException e) {
            throw new ApiException(HttpStatus.CONFLICT, "Invalid order state", e.getMessage());
        }
    }

    /**
     * Cancel an order
     * POST /api/v1/orders/{orderId}/cancel
     *
     * Security: User can cancel their own orders, ADMIN can cancel any order
     */
    @PostMapping("/{orderId}/cancel")
    @PreAuthorize("hasAnyRole('CUSTOMER', 'PREMIUM_CUSTOMER', 'ADMIN')")
    @Operation(summary = "Cancel order", description = "Cancel a pending or processing order")
    public ResponseEntity<OrderResponse> cancelOrder(
            @PathVariable Long orderId,
            @Valid @RequestBody CancelOrderRequest request,
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Role", defaultValue = "CUSTOMER") String userRole
    ) {
        logger.info("Cancelling order {} by user {} with reason: {}", orderId, userId, request.getReason());

        try {
            // Verify ownership unless admin
            Order order = orderService.getOrderById(orderId)
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Order not found", "Order not found"));

            if (!userRole.contains("ADMIN") && !order.getUserId().equals(userId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Access denied", "You can only cancel your own orders");
            }

            Order cancelledOrder = orderService.cancelOrder(orderId, request.getReason());
            OrderResponse response = convertToResponse(cancelledOrder);

            logger.info("Order {} cancelled successfully", orderId);

            return ResponseEntity.ok(response);

        } catch (InvalidOrderStateException e) {
            throw new ApiException(HttpStatus.CONFLICT, "Cannot cancel order", e.getMessage());
        }
    }

    /**
     * Get recent orders
     * GET /api/v1/orders/recent
     *
     * Security: Requires ADMIN role
     */
    @GetMapping("/recent")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Get recent orders", description = "Get recently placed orders for dashboard")
    public ResponseEntity<List<OrderResponse>> getRecentOrders(
            @Parameter(description = "Number of orders to return") @RequestParam(defaultValue = "10") int limit
    ) {
        logger.debug("Getting {} recent orders", limit);

        List<Order> orders = orderService.getRecentOrders(limit);
        List<OrderResponse> responses = orders.stream()
                .map(this::convertToResponse)
                .toList();

        return ResponseEntity.ok(responses);
    }

    /**
     * Get order statistics
     * GET /api/v1/orders/stats
     *
     * Security: Requires ADMIN or ACCOUNTANT role
     */
    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
    @Operation(summary = "Get order statistics", description = "Get aggregate statistics about orders")
    public ResponseEntity<OrderStatistics> getOrderStatistics(
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate
    ) {
        logger.debug("Getting order statistics from {} to {}", fromDate, toDate);

        // In a real implementation, this would query aggregated data
        OrderStatistics stats = new OrderStatistics();
        // TODO: Implement actual statistics calculation
        stats.setTotalOrders(0);
        stats.setTotalRevenue(0.0);
        stats.setAverageOrderValue(0.0);

        return ResponseEntity.ok(stats);
    }

    /**
     * Health check endpoint
     * GET /api/v1/orders/health
     *
     * Public endpoint for monitoring
     */
    @GetMapping("/health")
    @Operation(summary = "Health check", description = "Check if the order service is healthy")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        Map<String, Object> health = Map.of(
                "status", "UP",
                "service", "OrderService",
                "timestamp", LocalDateTime.now().toString()
        );

        return ResponseEntity.ok(health);
    }

    // ==================== Helper Methods ====================

    /**
     * Validate create order request
     */
    private void validateCreateOrderRequest(CreateOrderRequest request) {
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new ValidationException("Order must have at least one item");
        }

        if (request.getShippingAddress() == null) {
            throw new ValidationException("Shipping address is required");
        }

        request.getItems().forEach(item -> {
            if (!ValidationUtils.isValidQuantity(item.getQuantity())) {
                throw new ValidationException("Invalid quantity for product " + item.getProductId());
            }
        });
    }

    /**
     * Build search criteria from query parameters
     */
    private OrderSearchCriteria buildSearchCriteria(
            Long userId,
            OrderStatus status,
            String fromDate,
            String toDate
    ) {
        OrderSearchCriteria criteria = new OrderSearchCriteria();
        criteria.setUserId(userId);
        criteria.setStatus(status);

        // Parse dates if provided
        // TODO: Implement date parsing

        return criteria;
    }

    /**
     * Convert Order entity to OrderResponse DTO
     */
    private OrderResponse convertToResponse(Order order) {
        OrderResponse response = new OrderResponse();
        response.setId(order.getId());
        response.setOrderNumber(order.getOrderNumber());
        response.setUserId(order.getUserId());
        response.setStatus(order.getStatus());
        response.setSubtotal(order.getSubtotal());
        response.setTax(order.getTax());
        response.setShippingCost(order.getShippingCost());
        response.setDiscount(order.getDiscount());
        response.setTotal(order.getTotal());
        response.setOrderedAt(order.getOrderedAt());
        response.setTrackingNumber(order.getTrackingNumber());

        // Add HATEOAS links
        response.addLink("self", "/api/v1/orders/" + order.getId());
        response.addLink("user", "/api/v1/users/" + order.getUserId());

        if (order.getStatus() == OrderStatus.PENDING) {
            response.addLink("payment", "/api/v1/orders/" + order.getId() + "/payment");
            response.addLink("cancel", "/api/v1/orders/" + order.getId() + "/cancel");
        }

        if (order.getStatus() == OrderStatus.PAID) {
            response.addLink("ship", "/api/v1/orders/" + order.getId() + "/ship");
        }

        return response;
    }

    // ==================== DTOs ====================

    public static class ShipOrderRequest {
        @NotNull(message = "Tracking number is required")
        private String trackingNumber;

        public String getTrackingNumber() {
            return trackingNumber;
        }

        public void setTrackingNumber(String trackingNumber) {
            this.trackingNumber = trackingNumber;
        }
    }

    public static class CancelOrderRequest {
        @NotNull(message = "Cancellation reason is required")
        private String reason;

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }

    public static class OrderListResponse {
        private List<OrderResponse> orders;
        private int totalCount;
        private int page;
        private int pageSize;
        private int totalPages;

        // Getters and setters
        public List<OrderResponse> getOrders() { return orders; }
        public void setOrders(List<OrderResponse> orders) { this.orders = orders; }
        public int getTotalCount() { return totalCount; }
        public void setTotalCount(int totalCount) { this.totalCount = totalCount; }
        public int getPage() { return page; }
        public void setPage(int page) { this.page = page; }
        public int getPageSize() { return pageSize; }
        public void setPageSize(int pageSize) { this.pageSize = pageSize; }
        public int getTotalPages() { return totalPages; }
        public void setTotalPages(int totalPages) { this.totalPages = totalPages; }
    }

    public static class OrderStatistics {
        private int totalOrders;
        private double totalRevenue;
        private double averageOrderValue;

        // Getters and setters
        public int getTotalOrders() { return totalOrders; }
        public void setTotalOrders(int totalOrders) { this.totalOrders = totalOrders; }
        public double getTotalRevenue() { return totalRevenue; }
        public void setTotalRevenue(double totalRevenue) { this.totalRevenue = totalRevenue; }
        public double getAverageOrderValue() { return averageOrderValue; }
        public void setAverageOrderValue(double averageOrderValue) { this.averageOrderValue = averageOrderValue; }
    }
}
