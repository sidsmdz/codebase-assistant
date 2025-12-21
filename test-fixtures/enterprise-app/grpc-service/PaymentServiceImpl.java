package com.enterprise.grpc.service;

import com.enterprise.grpc.PaymentServiceGrpc;
import com.enterprise.grpc.proto.PaymentRequest;
import com.enterprise.grpc.proto.PaymentResponse;
import com.enterprise.grpc.proto.RefundRequest;
import com.enterprise.grpc.proto.RefundResponse;
import io.grpc.stub.StreamObserver;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.logging.Logger;

/**
 * gRPC implementation of Payment Service.
 * Handles payment processing and refunds for orders.
 */
@Service
public class PaymentServiceImpl extends PaymentServiceGrpc.PaymentServiceImplBase {

    private static final Logger logger = Logger.getLogger(PaymentServiceImpl.class.getName());

    /**
     * Processes a payment for an order.
     * @param request Payment request containing order and amount details
     * @param responseObserver Response observer for async response
     */
    @Override
    public void processPayment(
        PaymentRequest request,
        StreamObserver<PaymentResponse> responseObserver
    ) {
        logger.info("Processing payment for order: " + request.getOrderId());

        try {
            Long orderId = request.getOrderId();
            BigDecimal amount = new BigDecimal(request.getAmount());
            String paymentMethod = request.getPaymentMethod();

            // Simulate payment gateway integration
            boolean success = validateAndProcessPayment(orderId, amount, paymentMethod);

            PaymentResponse response = PaymentResponse.newBuilder()
                .setSuccess(success)
                .setTransactionId(generateTransactionId(orderId))
                .setMessage(success ? "Payment successful" : "Payment declined")
                .build();

            responseObserver.onNext(response);
            responseObserver.onCompleted();

            logger.info("Payment " + (success ? "successful" : "failed") + " for order: " + orderId);

        } catch (Exception e) {
            logger.severe("Payment processing error: " + e.getMessage());
            responseObserver.onError(e);
        }
    }

    /**
     * Processes a refund for a cancelled order.
     * @param request Refund request containing order and amount details
     * @param responseObserver Response observer for async response
     */
    @Override
    public void processRefund(
        RefundRequest request,
        StreamObserver<RefundResponse> responseObserver
    ) {
        logger.info("Processing refund for order: " + request.getOrderId());

        try {
            Long orderId = request.getOrderId();
            BigDecimal amount = new BigDecimal(request.getAmount());

            // Simulate refund processing
            boolean success = executeRefund(orderId, amount);

            RefundResponse response = RefundResponse.newBuilder()
                .setSuccess(success)
                .setRefundId(generateRefundId(orderId))
                .setMessage(success ? "Refund processed" : "Refund failed")
                .build();

            responseObserver.onNext(response);
            responseObserver.onCompleted();

            logger.info("Refund " + (success ? "successful" : "failed") + " for order: " + orderId);

        } catch (Exception e) {
            logger.severe("Refund processing error: " + e.getMessage());
            responseObserver.onError(e);
        }
    }

    /**
     * Validates and processes payment through external gateway.
     * @param orderId Order ID
     * @param amount Payment amount
     * @param paymentMethod Payment method (CARD, PAYPAL, etc.)
     * @return true if payment successful
     */
    private boolean validateAndProcessPayment(
        Long orderId,
        BigDecimal amount,
        String paymentMethod
    ) {
        // Validation logic
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            logger.warning("Invalid amount: " + amount);
            return false;
        }

        if (paymentMethod == null || paymentMethod.isEmpty()) {
            logger.warning("Invalid payment method");
            return false;
        }

        // Simulate external payment gateway call
        // In real implementation, this would call Stripe, PayPal, etc.
        return simulatePaymentGateway(orderId, amount, paymentMethod);
    }

    /**
     * Executes refund through payment gateway.
     * @param orderId Order ID
     * @param amount Refund amount
     * @return true if refund successful
     */
    private boolean executeRefund(Long orderId, BigDecimal amount) {
        // Simulate refund processing
        logger.info("Executing refund of " + amount + " for order " + orderId);

        // In real implementation, this would call payment gateway refund API
        return true; // Simulate success
    }

    /**
     * Simulates external payment gateway processing.
     * @param orderId Order ID
     * @param amount Amount to charge
     * @param paymentMethod Payment method
     * @return Payment success status
     */
    private boolean simulatePaymentGateway(
        Long orderId,
        BigDecimal amount,
        String paymentMethod
    ) {
        // Simulate payment processing delay
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        // Simulate 95% success rate
        return Math.random() > 0.05;
    }

    /**
     * Generates a unique transaction ID.
     * @param orderId Order ID
     * @return Transaction ID
     */
    private String generateTransactionId(Long orderId) {
        return "TXN-" + orderId + "-" + System.currentTimeMillis();
    }

    /**
     * Generates a unique refund ID.
     * @param orderId Order ID
     * @return Refund ID
     */
    private String generateRefundId(Long orderId) {
        return "RFN-" + orderId + "-" + System.currentTimeMillis();
    }
}
