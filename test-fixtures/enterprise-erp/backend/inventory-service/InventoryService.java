package com.enterprise.erp.backend.inventory;

import com.enterprise.erp.domain.models.Product;
import com.enterprise.erp.domain.models.InventoryRecord;
import com.enterprise.erp.domain.models.Enums.InventoryStatus;
import com.enterprise.erp.shared.utils.ValidationUtils;
import com.enterprise.erp.integration.events.EventPublisher;
import com.enterprise.erp.integration.events.InventoryEvent;
import com.enterprise.erp.backend.notification.NotificationServiceClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Inventory Service - Manages product inventory and reservations
 * Demonstrates concurrent access handling and reservation patterns
 */
@Service
@Transactional
public class InventoryService {

    @Autowired
    private InventoryRepository inventoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ReservationRepository reservationRepository;

    @Autowired
    private EventPublisher eventPublisher;

    @Autowired
    private NotificationServiceClient notificationServiceClient;

    // In-memory cache for frequently accessed inventory data
    private final Map<Long, InventoryRecord> inventoryCache = new ConcurrentHashMap<>();

    private static final int LOW_STOCK_THRESHOLD = 10;
    private static final int RESERVATION_TIMEOUT_HOURS = 24;

    /**
     * Check if product is available in requested quantity
     */
    public boolean checkAvailability(Long productId, Integer quantity) {
        if (!ValidationUtils.isValidQuantity(quantity)) {
            return false;
        }

        InventoryRecord inventory = getInventoryRecord(productId);
        if (inventory == null) {
            return false;
        }

        // Available quantity = total quantity - reserved quantity
        int availableQuantity = inventory.getQuantity() - inventory.getReservedQuantity();
        return availableQuantity >= quantity;
    }

    /**
     * Get product information including pricing
     */
    public ProductInfo getProductInfo(Long productId) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ProductNotFoundException("Product not found: " + productId));

        InventoryRecord inventory = getInventoryRecord(productId);

        ProductInfo info = new ProductInfo();
        info.setId(product.getId());
        info.setName(product.getName());
        info.setDescription(product.getDescription());
        info.setPrice(product.getPrice());
        info.setSku(product.getSku());
        info.setCategory(product.getCategory());
        info.setPremiumEligible(product.isPremiumEligible());

        if (inventory != null) {
            info.setAvailableQuantity(inventory.getQuantity() - inventory.getReservedQuantity());
            info.setStatus(inventory.getStatus());
        } else {
            info.setAvailableQuantity(0);
            info.setStatus(InventoryStatus.OUT_OF_STOCK);
        }

        return info;
    }

    /**
     * Reserve inventory for an order
     * Uses pessimistic locking to prevent overselling
     */
    @Transactional
    public synchronized void reserveInventory(Long productId, Integer quantity, String orderNumber) {
        if (!ValidationUtils.isValidQuantity(quantity)) {
            throw new ValidationException("Invalid quantity: " + quantity);
        }

        InventoryRecord inventory = inventoryRepository.findByProductIdForUpdate(productId)
                .orElseThrow(() -> new ProductNotFoundException("Product not found: " + productId));

        int availableQuantity = inventory.getQuantity() - inventory.getReservedQuantity();

        if (availableQuantity < quantity) {
            throw new InsufficientInventoryException(
                    "Insufficient inventory for product " + productId +
                    ". Available: " + availableQuantity + ", Requested: " + quantity
            );
        }

        // Create reservation record
        InventoryReservation reservation = new InventoryReservation();
        reservation.setProductId(productId);
        reservation.setQuantity(quantity);
        reservation.setOrderNumber(orderNumber);
        reservation.setReservedAt(LocalDateTime.now());
        reservation.setExpiresAt(LocalDateTime.now().plusHours(RESERVATION_TIMEOUT_HOURS));
        reservation.setStatus(ReservationStatus.RESERVED);

        reservationRepository.save(reservation);

        // Update reserved quantity
        inventory.setReservedQuantity(inventory.getReservedQuantity() + quantity);
        inventoryRepository.save(inventory);

        // Update cache
        inventoryCache.put(productId, inventory);

        // Check if low stock alert needed
        int newAvailableQuantity = inventory.getQuantity() - inventory.getReservedQuantity();
        if (newAvailableQuantity <= LOW_STOCK_THRESHOLD && inventory.getStatus() != InventoryStatus.LOW_STOCK) {
            handleLowStock(inventory);
        }

        // Publish inventory updated event
        eventPublisher.publish(new InventoryEvent(
                InventoryEvent.EventType.INVENTORY_RESERVED,
                productId,
                quantity
        ));
    }

    /**
     * Confirm inventory reservation (called after successful payment)
     */
    @Transactional
    public synchronized void confirmReservation(Long productId, String orderNumber) {
        InventoryReservation reservation = reservationRepository.findByOrderNumber(orderNumber)
                .orElseThrow(() -> new ReservationNotFoundException("Reservation not found: " + orderNumber));

        if (reservation.getStatus() != ReservationStatus.RESERVED) {
            throw new InvalidReservationStateException("Reservation is not in RESERVED state");
        }

        InventoryRecord inventory = inventoryRepository.findByProductIdForUpdate(productId)
                .orElseThrow(() -> new ProductNotFoundException("Product not found: " + productId));

        // Deduct from both total and reserved quantity
        inventory.setQuantity(inventory.getQuantity() - reservation.getQuantity());
        inventory.setReservedQuantity(inventory.getReservedQuantity() - reservation.getQuantity());
        inventoryRepository.save(inventory);

        // Mark reservation as confirmed
        reservation.setStatus(ReservationStatus.CONFIRMED);
        reservation.setConfirmedAt(LocalDateTime.now());
        reservationRepository.save(reservation);

        // Update cache
        inventoryCache.put(productId, inventory);

        // Update inventory status if out of stock
        if (inventory.getQuantity() <= 0) {
            inventory.setStatus(InventoryStatus.OUT_OF_STOCK);
            inventoryRepository.save(inventory);
        }

        // Publish event
        eventPublisher.publish(new InventoryEvent(
                InventoryEvent.EventType.INVENTORY_DEDUCTED,
                productId,
                reservation.getQuantity()
        ));
    }

    /**
     * Release inventory reservation (called on order cancellation or payment failure)
     */
    @Transactional
    public synchronized void releaseReservation(Long productId, String orderNumber) {
        InventoryReservation reservation = reservationRepository.findByOrderNumber(orderNumber)
                .orElseThrow(() -> new ReservationNotFoundException("Reservation not found: " + orderNumber));

        if (reservation.getStatus() == ReservationStatus.CONFIRMED) {
            throw new InvalidReservationStateException("Cannot release confirmed reservation");
        }

        if (reservation.getStatus() == ReservationStatus.RELEASED) {
            // Already released, idempotent operation
            return;
        }

        InventoryRecord inventory = inventoryRepository.findByProductIdForUpdate(productId)
                .orElseThrow(() -> new ProductNotFoundException("Product not found: " + productId));

        // Release reserved quantity
        inventory.setReservedQuantity(inventory.getReservedQuantity() - reservation.getQuantity());

        // Update status if back in stock
        if (inventory.getStatus() == InventoryStatus.OUT_OF_STOCK && inventory.getQuantity() > 0) {
            inventory.setStatus(InventoryStatus.IN_STOCK);
        }

        inventoryRepository.save(inventory);

        // Mark reservation as released
        reservation.setStatus(ReservationStatus.RELEASED);
        reservation.setReleasedAt(LocalDateTime.now());
        reservationRepository.save(reservation);

        // Update cache
        inventoryCache.put(productId, inventory);

        // Publish event
        eventPublisher.publish(new InventoryEvent(
                InventoryEvent.EventType.INVENTORY_RELEASED,
                productId,
                reservation.getQuantity()
        ));
    }

    /**
     * Add stock to inventory
     */
    @Transactional
    public InventoryRecord addStock(Long productId, Integer quantity, String reason) {
        if (!ValidationUtils.isValidQuantity(quantity)) {
            throw new ValidationException("Invalid quantity: " + quantity);
        }

        InventoryRecord inventory = inventoryRepository.findByProductId(productId)
                .orElseGet(() -> {
                    InventoryRecord newInventory = new InventoryRecord();
                    newInventory.setProductId(productId);
                    newInventory.setQuantity(0);
                    newInventory.setReservedQuantity(0);
                    newInventory.setStatus(InventoryStatus.OUT_OF_STOCK);
                    return newInventory;
                });

        int previousQuantity = inventory.getQuantity();
        inventory.setQuantity(inventory.getQuantity() + quantity);

        // Update status
        if (inventory.getQuantity() > LOW_STOCK_THRESHOLD) {
            inventory.setStatus(InventoryStatus.IN_STOCK);
        } else if (inventory.getQuantity() > 0) {
            inventory.setStatus(InventoryStatus.LOW_STOCK);
        }

        InventoryRecord savedInventory = inventoryRepository.save(inventory);

        // Update cache
        inventoryCache.put(productId, savedInventory);

        // Create audit record
        createAuditRecord(productId, "STOCK_ADDED", previousQuantity, savedInventory.getQuantity(), reason);

        // Publish event
        eventPublisher.publish(new InventoryEvent(
                InventoryEvent.EventType.STOCK_ADDED,
                productId,
                quantity
        ));

        return savedInventory;
    }

    /**
     * Adjust inventory for stocktaking or corrections
     */
    @Transactional
    public InventoryRecord adjustInventory(Long productId, Integer newQuantity, String reason) {
        if (newQuantity == null || newQuantity < 0) {
            throw new ValidationException("Invalid quantity: " + newQuantity);
        }

        InventoryRecord inventory = inventoryRepository.findByProductId(productId)
                .orElseThrow(() -> new ProductNotFoundException("Product not found: " + productId));

        int previousQuantity = inventory.getQuantity();
        int adjustment = newQuantity - previousQuantity;

        inventory.setQuantity(newQuantity);

        // Update status
        if (inventory.getQuantity() > LOW_STOCK_THRESHOLD) {
            inventory.setStatus(InventoryStatus.IN_STOCK);
        } else if (inventory.getQuantity() > 0) {
            inventory.setStatus(InventoryStatus.LOW_STOCK);
        } else {
            inventory.setStatus(InventoryStatus.OUT_OF_STOCK);
        }

        InventoryRecord savedInventory = inventoryRepository.save(inventory);

        // Update cache
        inventoryCache.put(productId, savedInventory);

        // Create audit record
        createAuditRecord(productId, "INVENTORY_ADJUSTED", previousQuantity, newQuantity, reason);

        // Publish event
        eventPublisher.publish(new InventoryEvent(
                InventoryEvent.EventType.INVENTORY_ADJUSTED,
                productId,
                adjustment
        ));

        return savedInventory;
    }

    /**
     * Get inventory record with caching
     */
    private InventoryRecord getInventoryRecord(Long productId) {
        // Check cache first
        if (inventoryCache.containsKey(productId)) {
            return inventoryCache.get(productId);
        }

        // Load from database
        Optional<InventoryRecord> inventory = inventoryRepository.findByProductId(productId);
        inventory.ifPresent(record -> inventoryCache.put(productId, record));

        return inventory.orElse(null);
    }

    /**
     * Handle low stock alert
     */
    private void handleLowStock(InventoryRecord inventory) {
        inventory.setStatus(InventoryStatus.LOW_STOCK);
        inventoryRepository.save(inventory);

        // Send notification to warehouse managers
        notificationServiceClient.sendLowStockAlert(inventory);

        // Publish low stock event
        eventPublisher.publish(new InventoryEvent(
                InventoryEvent.EventType.LOW_STOCK_ALERT,
                inventory.getProductId(),
                inventory.getQuantity() - inventory.getReservedQuantity()
        ));
    }

    /**
     * Create audit record for inventory changes
     */
    private void createAuditRecord(Long productId, String action, int previousQty, int newQty, String reason) {
        InventoryAudit audit = new InventoryAudit();
        audit.setProductId(productId);
        audit.setAction(action);
        audit.setPreviousQuantity(previousQty);
        audit.setNewQuantity(newQty);
        audit.setAdjustment(newQty - previousQty);
        audit.setReason(reason);
        audit.setTimestamp(LocalDateTime.now());

        // This would be saved to audit repository
        // auditRepository.save(audit);
    }

    /**
     * Clean up expired reservations (scheduled task)
     */
    @Transactional
    public void cleanupExpiredReservations() {
        List<InventoryReservation> expiredReservations = reservationRepository
                .findByStatusAndExpiresAtBefore(ReservationStatus.RESERVED, LocalDateTime.now());

        for (InventoryReservation reservation : expiredReservations) {
            try {
                releaseReservation(reservation.getProductId(), reservation.getOrderNumber());
            } catch (Exception e) {
                System.err.println("Failed to release expired reservation: " + e.getMessage());
            }
        }
    }

    /**
     * Get all low stock products
     */
    public List<InventoryRecord> getLowStockProducts() {
        return inventoryRepository.findAll().stream()
                .filter(inv -> (inv.getQuantity() - inv.getReservedQuantity()) <= LOW_STOCK_THRESHOLD)
                .filter(inv -> inv.getStatus() != InventoryStatus.DISCONTINUED)
                .sorted((a, b) -> Integer.compare(
                        a.getQuantity() - a.getReservedQuantity(),
                        b.getQuantity() - b.getReservedQuantity()
                ))
                .collect(Collectors.toList());
    }

    /**
     * Get inventory report
     */
    public InventoryReport getInventoryReport() {
        List<InventoryRecord> allInventory = inventoryRepository.findAll();

        InventoryReport report = new InventoryReport();
        report.setTotalProducts(allInventory.size());
        report.setTotalQuantity(allInventory.stream().mapToInt(InventoryRecord::getQuantity).sum());
        report.setTotalReserved(allInventory.stream().mapToInt(InventoryRecord::getReservedQuantity).sum());

        report.setInStockCount(allInventory.stream()
                .filter(inv -> inv.getStatus() == InventoryStatus.IN_STOCK).count());
        report.setLowStockCount(allInventory.stream()
                .filter(inv -> inv.getStatus() == InventoryStatus.LOW_STOCK).count());
        report.setOutOfStockCount(allInventory.stream()
                .filter(inv -> inv.getStatus() == InventoryStatus.OUT_OF_STOCK).count());

        BigDecimal totalValue = allInventory.stream()
                .map(inv -> {
                    Product product = productRepository.findById(inv.getProductId()).orElse(null);
                    if (product != null) {
                        return product.getPrice().multiply(new BigDecimal(inv.getQuantity()));
                    }
                    return BigDecimal.ZERO;
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        report.setTotalInventoryValue(totalValue);
        report.setGeneratedAt(LocalDateTime.now());

        return report;
    }
}
