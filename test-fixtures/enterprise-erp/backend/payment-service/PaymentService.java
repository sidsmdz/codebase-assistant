package com.enterprise.erp.backend.payment;

import com.enterprise.erp.domain.models.PaymentInfo;
import com.enterprise.erp.domain.models.Enums.PaymentStatus;
import com.enterprise.erp.domain.models.Enums.PaymentMethod;
import com.enterprise.erp.shared.utils.ValidationUtils;
import com.enterprise.erp.integration.events.EventPublisher;
import com.enterprise.erp.integration.events.PaymentEvent;
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
 * Payment Service - Handles payment processing with multiple payment gateways
 * Demonstrates payment gateway abstraction and PCI compliance patterns
 */
@Service
@Transactional
public class PaymentService {

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private PaymentGatewayFactory gatewayFactory;

    @Autowired
    private EventPublisher eventPublisher;

    @Autowired
    private NotificationServiceClient notificationServiceClient;

    @Autowired
    private FraudDetectionService fraudDetectionService;

    private static final BigDecimal FRAUD_THRESHOLD = new BigDecimal("5000.00");
    private static final int MAX_RETRY_ATTEMPTS = 3;

    /**
     * Process payment for an order
     * Includes fraud detection and gateway selection
     */
    @Transactional
    public PaymentResult processPayment(Long orderId, BigDecimal amount, PaymentRequest request) {
        // Validate request
        validatePaymentRequest(request, amount);

        // Check for fraud
        FraudCheckResult fraudCheck = fraudDetectionService.checkTransaction(
                orderId,
                amount,
                request.getPaymentMethod(),
                request.getCustomerIp(),
                request.getUserId()
        );

        if (fraudCheck.isHighRisk()) {
            return createFailedResult(
                    orderId,
                    amount,
                    request,
                    "Transaction flagged as high risk: " + fraudCheck.getReason()
            );
        }

        // Create payment record
        PaymentTransaction transaction = new PaymentTransaction();
        transaction.setOrderId(orderId);
        transaction.setAmount(amount);
        transaction.setPaymentMethod(request.getPaymentMethod());
        transaction.setStatus(PaymentStatus.PENDING);
        transaction.setCreatedAt(LocalDateTime.now());
        transaction.setAttemptCount(1);

        PaymentTransaction savedTransaction = paymentRepository.save(transaction);

        try {
            // Select appropriate payment gateway
            PaymentGateway gateway = gatewayFactory.getGateway(request.getPaymentMethod());

            // Process payment through gateway
            GatewayResponse gatewayResponse = gateway.processPayment(
                    savedTransaction.getId(),
                    amount,
                    request
            );

            if (gatewayResponse.isSuccess()) {
                return handleSuccessfulPayment(savedTransaction, gatewayResponse, request);
            } else {
                return handleFailedPayment(savedTransaction, gatewayResponse, request);
            }

        } catch (PaymentGatewayException e) {
            return handlePaymentException(savedTransaction, e, request);
        }
    }

    /**
     * Handle successful payment
     */
    private PaymentResult handleSuccessfulPayment(
            PaymentTransaction transaction,
            GatewayResponse gatewayResponse,
            PaymentRequest request
    ) {
        // Update transaction status
        transaction.setStatus(PaymentStatus.CAPTURED);
        transaction.setGatewayTransactionId(gatewayResponse.getTransactionId());
        transaction.setGatewayResponse(gatewayResponse.getRawResponse());
        transaction.setProcessedAt(LocalDateTime.now());

        paymentRepository.save(transaction);

        // Create payment info
        PaymentInfo paymentInfo = new PaymentInfo();
        paymentInfo.setTransactionId(gatewayResponse.getTransactionId());
        paymentInfo.setPaymentMethod(request.getPaymentMethod());
        paymentInfo.setAmount(transaction.getAmount());
        paymentInfo.setStatus(PaymentStatus.CAPTURED);
        paymentInfo.setProcessedAt(transaction.getProcessedAt());

        // Mask sensitive card data
        if (request.getCardNumber() != null) {
            paymentInfo.setMaskedCardNumber(maskCardNumber(request.getCardNumber()));
        }

        // Publish payment success event
        eventPublisher.publish(new PaymentEvent(
                PaymentEvent.EventType.PAYMENT_CAPTURED,
                transaction.getId(),
                transaction.getOrderId(),
                transaction.getAmount()
        ));

        // Create successful result
        PaymentResult result = new PaymentResult();
        result.setSuccessful(true);
        result.setTransactionId(transaction.getId());
        result.setGatewayTransactionId(gatewayResponse.getTransactionId());
        result.setPaymentInfo(paymentInfo);
        result.setMessage("Payment processed successfully");

        return result;
    }

    /**
     * Handle failed payment
     */
    private PaymentResult handleFailedPayment(
            PaymentTransaction transaction,
            GatewayResponse gatewayResponse,
            PaymentRequest request
    ) {
        transaction.setStatus(PaymentStatus.FAILED);
        transaction.setGatewayResponse(gatewayResponse.getRawResponse());
        transaction.setFailureReason(gatewayResponse.getErrorMessage());
        transaction.setProcessedAt(LocalDateTime.now());

        paymentRepository.save(transaction);

        // Publish payment failed event
        eventPublisher.publish(new PaymentEvent(
                PaymentEvent.EventType.PAYMENT_FAILED,
                transaction.getId(),
                transaction.getOrderId(),
                transaction.getAmount()
        ));

        // Create failed result
        PaymentResult result = new PaymentResult();
        result.setSuccessful(false);
        result.setTransactionId(transaction.getId());
        result.setFailureReason(gatewayResponse.getErrorMessage());
        result.setMessage("Payment failed: " + gatewayResponse.getErrorMessage());

        return result;
    }

    /**
     * Handle payment processing exception
     */
    private PaymentResult handlePaymentException(
            PaymentTransaction transaction,
            Exception exception,
            PaymentRequest request
    ) {
        transaction.setStatus(PaymentStatus.FAILED);
        transaction.setFailureReason(exception.getMessage());
        transaction.setProcessedAt(LocalDateTime.now());

        paymentRepository.save(transaction);

        // Publish payment failed event
        eventPublisher.publish(new PaymentEvent(
                PaymentEvent.EventType.PAYMENT_FAILED,
                transaction.getId(),
                transaction.getOrderId(),
                transaction.getAmount()
        ));

        return createFailedResult(
                transaction.getOrderId(),
                transaction.getAmount(),
                request,
                "Payment processing error: " + exception.getMessage()
        );
    }

    /**
     * Process refund for a payment
     */
    @Transactional
    public RefundResult processRefund(String gatewayTransactionId, BigDecimal amount, String reason) {
        // Find original payment transaction
        PaymentTransaction originalTransaction = paymentRepository.findByGatewayTransactionId(gatewayTransactionId)
                .orElseThrow(() -> new PaymentNotFoundException("Payment not found: " + gatewayTransactionId));

        if (originalTransaction.getStatus() != PaymentStatus.CAPTURED) {
            throw new InvalidPaymentStateException("Can only refund captured payments");
        }

        // Validate refund amount
        BigDecimal totalRefunded = getRefundedAmount(originalTransaction.getId());
        BigDecimal remainingAmount = originalTransaction.getAmount().subtract(totalRefunded);

        if (amount.compareTo(remainingAmount) > 0) {
            throw new InvalidRefundAmountException(
                    "Refund amount exceeds remaining amount. Remaining: " + remainingAmount
            );
        }

        try {
            // Create refund transaction
            RefundTransaction refund = new RefundTransaction();
            refund.setOriginalTransactionId(originalTransaction.getId());
            refund.setAmount(amount);
            refund.setReason(reason);
            refund.setStatus(PaymentStatus.PENDING);
            refund.setCreatedAt(LocalDateTime.now());

            RefundTransaction savedRefund = paymentRepository.saveRefund(refund);

            // Process refund through gateway
            PaymentGateway gateway = gatewayFactory.getGateway(originalTransaction.getPaymentMethod());
            GatewayResponse gatewayResponse = gateway.processRefund(gatewayTransactionId, amount);

            if (gatewayResponse.isSuccess()) {
                // Update refund status
                savedRefund.setStatus(PaymentStatus.REFUNDED);
                savedRefund.setGatewayRefundId(gatewayResponse.getTransactionId());
                savedRefund.setProcessedAt(LocalDateTime.now());
                paymentRepository.saveRefund(savedRefund);

                // Update original transaction status
                BigDecimal newTotalRefunded = totalRefunded.add(amount);
                if (newTotalRefunded.compareTo(originalTransaction.getAmount()) == 0) {
                    originalTransaction.setStatus(PaymentStatus.REFUNDED);
                } else {
                    originalTransaction.setStatus(PaymentStatus.PARTIALLY_REFUNDED);
                }
                paymentRepository.save(originalTransaction);

                // Publish refund event
                eventPublisher.publish(new PaymentEvent(
                        PaymentEvent.EventType.REFUND_PROCESSED,
                        originalTransaction.getId(),
                        originalTransaction.getOrderId(),
                        amount
                ));

                RefundResult result = new RefundResult();
                result.setSuccessful(true);
                result.setRefundId(savedRefund.getId());
                result.setGatewayRefundId(gatewayResponse.getTransactionId());
                result.setAmount(amount);
                result.setMessage("Refund processed successfully");

                return result;

            } else {
                savedRefund.setStatus(PaymentStatus.FAILED);
                savedRefund.setFailureReason(gatewayResponse.getErrorMessage());
                paymentRepository.saveRefund(savedRefund);

                RefundResult result = new RefundResult();
                result.setSuccessful(false);
                result.setFailureReason(gatewayResponse.getErrorMessage());
                result.setMessage("Refund failed: " + gatewayResponse.getErrorMessage());

                return result;
            }

        } catch (PaymentGatewayException e) {
            throw new RefundProcessingException("Failed to process refund: " + e.getMessage(), e);
        }
    }

    /**
     * Authorize payment without capturing (for delayed capture)
     */
    @Transactional
    public PaymentResult authorizePayment(Long orderId, BigDecimal amount, PaymentRequest request) {
        validatePaymentRequest(request, amount);

        PaymentTransaction transaction = new PaymentTransaction();
        transaction.setOrderId(orderId);
        transaction.setAmount(amount);
        transaction.setPaymentMethod(request.getPaymentMethod());
        transaction.setStatus(PaymentStatus.PENDING);
        transaction.setCreatedAt(LocalDateTime.now());

        PaymentTransaction savedTransaction = paymentRepository.save(transaction);

        try {
            PaymentGateway gateway = gatewayFactory.getGateway(request.getPaymentMethod());
            GatewayResponse gatewayResponse = gateway.authorizePayment(
                    savedTransaction.getId(),
                    amount,
                    request
            );

            if (gatewayResponse.isSuccess()) {
                savedTransaction.setStatus(PaymentStatus.AUTHORIZED);
                savedTransaction.setGatewayTransactionId(gatewayResponse.getTransactionId());
                savedTransaction.setProcessedAt(LocalDateTime.now());
                paymentRepository.save(savedTransaction);

                eventPublisher.publish(new PaymentEvent(
                        PaymentEvent.EventType.PAYMENT_AUTHORIZED,
                        transaction.getId(),
                        orderId,
                        amount
                ));

                PaymentInfo paymentInfo = new PaymentInfo();
                paymentInfo.setTransactionId(gatewayResponse.getTransactionId());
                paymentInfo.setPaymentMethod(request.getPaymentMethod());
                paymentInfo.setAmount(amount);
                paymentInfo.setStatus(PaymentStatus.AUTHORIZED);

                PaymentResult result = new PaymentResult();
                result.setSuccessful(true);
                result.setTransactionId(savedTransaction.getId());
                result.setGatewayTransactionId(gatewayResponse.getTransactionId());
                result.setPaymentInfo(paymentInfo);

                return result;
            } else {
                savedTransaction.setStatus(PaymentStatus.FAILED);
                savedTransaction.setFailureReason(gatewayResponse.getErrorMessage());
                paymentRepository.save(savedTransaction);

                return createFailedResult(orderId, amount, request, gatewayResponse.getErrorMessage());
            }

        } catch (PaymentGatewayException e) {
            return handlePaymentException(savedTransaction, e, request);
        }
    }

    /**
     * Capture previously authorized payment
     */
    @Transactional
    public PaymentResult capturePayment(String gatewayTransactionId, BigDecimal amount) {
        PaymentTransaction transaction = paymentRepository.findByGatewayTransactionId(gatewayTransactionId)
                .orElseThrow(() -> new PaymentNotFoundException("Payment not found: " + gatewayTransactionId));

        if (transaction.getStatus() != PaymentStatus.AUTHORIZED) {
            throw new InvalidPaymentStateException("Can only capture authorized payments");
        }

        try {
            PaymentGateway gateway = gatewayFactory.getGateway(transaction.getPaymentMethod());
            GatewayResponse gatewayResponse = gateway.capturePayment(gatewayTransactionId, amount);

            if (gatewayResponse.isSuccess()) {
                transaction.setStatus(PaymentStatus.CAPTURED);
                transaction.setCapturedAt(LocalDateTime.now());
                paymentRepository.save(transaction);

                eventPublisher.publish(new PaymentEvent(
                        PaymentEvent.EventType.PAYMENT_CAPTURED,
                        transaction.getId(),
                        transaction.getOrderId(),
                        amount
                ));

                PaymentResult result = new PaymentResult();
                result.setSuccessful(true);
                result.setTransactionId(transaction.getId());
                result.setMessage("Payment captured successfully");

                return result;
            } else {
                throw new CaptureFailedException("Failed to capture payment: " + gatewayResponse.getErrorMessage());
            }

        } catch (PaymentGatewayException e) {
            throw new CaptureFailedException("Payment capture error: " + e.getMessage(), e);
        }
    }

    /**
     * Get payment transaction by ID
     */
    public Optional<PaymentTransaction> getTransaction(Long transactionId) {
        return paymentRepository.findById(transactionId);
    }

    /**
     * Get payment transactions for an order
     */
    public List<PaymentTransaction> getTransactionsByOrder(Long orderId) {
        return paymentRepository.findByOrderId(orderId).stream()
                .sorted((t1, t2) -> t2.getCreatedAt().compareTo(t1.getCreatedAt()))
                .collect(Collectors.toList());
    }

    /**
     * Get total refunded amount for a transaction
     */
    private BigDecimal getRefundedAmount(Long transactionId) {
        List<RefundTransaction> refunds = paymentRepository.findRefundsByTransactionId(transactionId);
        return refunds.stream()
                .filter(r -> r.getStatus() == PaymentStatus.REFUNDED)
                .map(RefundTransaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Validate payment request
     */
    private void validatePaymentRequest(PaymentRequest request, BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ValidationException("Invalid payment amount");
        }

        if (request.getPaymentMethod() == null) {
            throw new ValidationException("Payment method is required");
        }

        // Validate based on payment method
        switch (request.getPaymentMethod()) {
            case CREDIT_CARD:
            case DEBIT_CARD:
                if (!ValidationUtils.isValidCreditCard(request.getCardNumber())) {
                    throw new ValidationException("Invalid card number");
                }
                if (!ValidationUtils.isNotEmpty(request.getCvv())) {
                    throw new ValidationException("CVV is required");
                }
                if (request.getExpiryMonth() == null || request.getExpiryYear() == null) {
                    throw new ValidationException("Card expiry is required");
                }
                break;

            case PAYPAL:
                if (!ValidationUtils.isValidEmail(request.getPaypalEmail())) {
                    throw new ValidationException("Valid PayPal email is required");
                }
                break;

            case BANK_TRANSFER:
                if (!ValidationUtils.isNotEmpty(request.getBankAccountNumber())) {
                    throw new ValidationException("Bank account number is required");
                }
                break;
        }
    }

    /**
     * Mask card number for security (PCI compliance)
     */
    private String maskCardNumber(String cardNumber) {
        if (cardNumber == null || cardNumber.length() < 4) {
            return "****";
        }
        String lastFour = cardNumber.substring(cardNumber.length() - 4);
        return "**** **** **** " + lastFour;
    }

    /**
     * Create failed payment result
     */
    private PaymentResult createFailedResult(
            Long orderId,
            BigDecimal amount,
            PaymentRequest request,
            String reason
    ) {
        PaymentResult result = new PaymentResult();
        result.setSuccessful(false);
        result.setFailureReason(reason);
        result.setMessage("Payment failed: " + reason);
        return result;
    }

    /**
     * Generate payment report for date range
     */
    public PaymentReport generateReport(LocalDateTime startDate, LocalDateTime endDate) {
        List<PaymentTransaction> transactions = paymentRepository
                .findByCreatedAtBetween(startDate, endDate);

        PaymentReport report = new PaymentReport();
        report.setStartDate(startDate);
        report.setEndDate(endDate);
        report.setTotalTransactions(transactions.size());

        BigDecimal totalAmount = transactions.stream()
                .filter(t -> t.getStatus() == PaymentStatus.CAPTURED)
                .map(PaymentTransaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        report.setTotalAmount(totalAmount);
        report.setSuccessfulTransactions(transactions.stream()
                .filter(t -> t.getStatus() == PaymentStatus.CAPTURED).count());
        report.setFailedTransactions(transactions.stream()
                .filter(t -> t.getStatus() == PaymentStatus.FAILED).count());

        // Group by payment method
        report.setByPaymentMethod(transactions.stream()
                .collect(Collectors.groupingBy(
                        PaymentTransaction::getPaymentMethod,
                        Collectors.counting()
                )));

        report.setGeneratedAt(LocalDateTime.now());

        return report;
    }
}
