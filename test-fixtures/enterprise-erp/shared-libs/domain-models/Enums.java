package com.enterprise.erp.domain.models;

/**
 * Shared enums used across all microservices
 */
public class Enums {

    public enum UserStatus {
        PENDING,
        ACTIVE,
        SUSPENDED,
        DEACTIVATED,
        BANNED
    }

    public enum Role {
        CUSTOMER,
        PREMIUM_CUSTOMER,
        ADMIN,
        SUPER_ADMIN,
        SUPPORT,
        WAREHOUSE_MANAGER,
        ACCOUNTANT
    }

    public enum OrderStatus {
        PENDING,
        PROCESSING,
        PAID,
        PAYMENT_FAILED,
        SHIPPED,
        DELIVERED,
        CANCELLED,
        REFUNDED
    }

    public enum PaymentStatus {
        PENDING,
        AUTHORIZED,
        CAPTURED,
        FAILED,
        REFUNDED,
        PARTIALLY_REFUNDED
    }

    public enum PaymentMethod {
        CREDIT_CARD,
        DEBIT_CARD,
        PAYPAL,
        BANK_TRANSFER,
        CASH_ON_DELIVERY
    }

    public enum InventoryStatus {
        IN_STOCK,
        LOW_STOCK,
        OUT_OF_STOCK,
        DISCONTINUED,
        BACKORDERED
    }

    public enum NotificationType {
        EMAIL,
        SMS,
        PUSH,
        IN_APP
    }

    public enum EventType {
        USER_CREATED,
        USER_UPDATED,
        USER_DELETED,
        ORDER_PLACED,
        ORDER_PAID,
        ORDER_SHIPPED,
        ORDER_DELIVERED,
        ORDER_CANCELLED,
        PAYMENT_PROCESSED,
        PAYMENT_FAILED,
        INVENTORY_UPDATED,
        INVENTORY_LOW_STOCK_ALERT
    }
}
