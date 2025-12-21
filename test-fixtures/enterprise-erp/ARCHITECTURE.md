# Enterprise ERP System - Test Fixture

## Overview

This is a production-grade, enterprise-level test fixture demonstrating complex microservices architecture with deep code dependencies. It's designed to thoroughly test the OpenCat chat panel's ability to find relevant patterns across interconnected codebases.

## Architecture

```
enterprise-erp/
├── shared-libs/                    # Shared libraries used across all services
│   ├── domain-models/              # Common domain entities
│   │   ├── User.java              # User entity with roles, addresses, audit
│   │   ├── Order.java             # Order entity with state machine
│   │   └── Enums.java             # All shared enums
│   └── utils/                      # Shared utilities
│       ├── ValidationUtils.java   # Email, phone, credit card validation
│       └── DateTimeUtils.java     # Date/time utilities
│
├── backend/                        # Microservices
│   ├── user-service/
│   │   └── UserService.java       # User management with event publishing
│   ├── order-service/
│   │   └── OrderService.java      # Order orchestration with complex workflow
│   ├── inventory-service/
│   │   └── InventoryService.java  # Inventory with reservation patterns
│   └── payment-service/
│       └── PaymentService.java    # Payment processing with fraud detection
│
├── integration/                    # Integration layer
│   ├── api-gateway/
│   │   └── OrderApiController.java # REST API with Spring Boot patterns
│   └── grpc-services/
│       └── OrderEventStreamService.java # gRPC streaming service
│
└── frontend/                       # React applications
    └── admin-portal/
        └── components/
            ├── UserManagement.tsx  # AG Grid with conditional row coloring
            └── OrderManagement.tsx # AG Grid with master-detail view
```

## Key Patterns Demonstrated

### 1. Shared Libraries & Domain-Driven Design
- **User.java** (320 lines): Shared domain model with roles, addresses, premium status
- **Order.java** (280 lines): Complex entity with state machine and business logic
- **Enums.java** (84 lines): All shared enums for consistency
- **ValidationUtils.java** (193 lines): Email, phone, credit card validation with Luhn algorithm
- **DateTimeUtils.java** (180 lines): Date/time utilities for consistent handling

### 2. Backend Microservices

#### UserService.java (290 lines)
- User CRUD operations with validation
- Event-driven architecture with EventPublisher
- Integration with NotificationServiceClient
- Premium upgrade workflow
- Search and filtering

#### OrderService.java (470 lines)
**Most Complex Service - Demonstrates:**
- **Transaction Management**: @Transactional with Spring
- **Multiple Service Dependencies**: UserService, InventoryService, PaymentService, NotificationService
- **Complex Orchestration**: Order creation with inventory reservation
- **State Machine**: Order status transitions with validation
- **Compensating Transactions**: Releasing inventory on payment failure
- **Event Publishing**: Events for order lifecycle
- **Error Handling**: Try-catch with cleanup logic

**Key Methods:**
- `createOrder()`: Multi-step workflow with validation, inventory check, reservation
- `processPayment()`: Payment processing with success/failure handling
- `cancelOrder()`: Cancellation with refund and inventory release

#### InventoryService.java (390 lines)
- **Concurrency Control**: Synchronized methods, pessimistic locking
- **Reservation Pattern**: Reserve → Confirm/Release workflow
- **Caching**: In-memory cache with ConcurrentHashMap
- **Low Stock Alerts**: Automatic threshold-based notifications
- **Audit Trail**: Inventory change tracking

#### PaymentService.java (430 lines)
- **Payment Gateway Abstraction**: Factory pattern for multiple gateways
- **Fraud Detection**: Integration with fraud detection service
- **Refund Processing**: Full and partial refunds
- **PCI Compliance**: Card number masking
- **Authorize/Capture**: Two-phase payment processing
- **Retry Logic**: Handling transient failures

### 3. Integration Layer

#### OrderApiController.java (550 lines)
**Spring Boot REST API Patterns:**
- RESTful endpoint design (GET, POST, PUT, DELETE)
- `@PreAuthorize` for role-based access control
- Request/Response DTOs with validation
- Swagger/OpenAPI documentation annotations
- HATEOAS links for resource navigation
- Pagination and filtering
- Exception handling with proper HTTP status codes

**Endpoints:**
- `POST /api/v1/orders` - Create order
- `GET /api/v1/orders/{id}` - Get order
- `GET /api/v1/orders` - List orders with filtering
- `POST /api/v1/orders/{id}/payment` - Process payment
- `POST /api/v1/orders/{id}/ship` - Ship order
- `POST /api/v1/orders/{id}/cancel` - Cancel order
- `GET /api/v1/orders/stats` - Get statistics

#### OrderEventStreamService.java (570 lines)
**gRPC Patterns:**
- **Server-side Streaming**: Real-time event notifications
- **Bidirectional Streaming**: Interactive subscriptions
- **Subscription Management**: Dynamic filters, pause/resume
- **Event Replay**: Historical event retrieval
- **Connection Lifecycle**: Proper cleanup and error handling
- **Backpressure**: Managing high-volume event streams

### 4. Frontend Components (React + AG Grid)

#### UserManagement.tsx (470 lines)
**AG Grid Patterns:**
- **CRITICAL PATTERN - Conditional Row Coloring**:
  - Premium users → Blue background (`#e3f2fd`)
  - Regular users → White background
  - Suspended users → Yellow background
  - Banned users → Red background
- Custom cell renderers for status badges, roles, currency
- Quick search and filtering
- Pagination
- Export to CSV
- Real-time data updates

**Row Styling Implementation:**
```typescript
const getRowClass = useCallback((params: RowClassParams) => {
    const user = params.data as User;
    if (user.isPremium) return 'premium-row';
    if (user.status === 'SUSPENDED') return 'suspended-row';
    if (user.status === 'BANNED') return 'banned-row';
    return 'regular-row';
}, []);
```

#### OrderManagement.tsx (570 lines)
**Advanced AG Grid Patterns:**
- **Master-Detail View**: Expandable rows showing order items
- **Complex Conditional Styling**:
  - PAID orders → Green background
  - PENDING orders → Yellow background
  - FAILED orders → Red background
  - Premium orders → Blue left border
  - High value orders (>$1000) → Gold right border
- **Status-based Action Buttons**: Dynamic buttons based on order state
- **Real-time Updates**: WebSocket integration
- Custom cell renderers with icons and badges
- Detailed item breakdown in expanded view

## Dependencies Between Services

```
OrderService depends on:
  → UserServiceClient (get user, check premium status)
  → InventoryServiceClient (check availability, reserve, confirm, release)
  → PaymentServiceClient (process payment, refund)
  → NotificationServiceClient (send confirmations)
  → EventPublisher (publish order events)

InventoryService depends on:
  → NotificationServiceClient (low stock alerts)
  → EventPublisher (inventory events)

PaymentService depends on:
  → PaymentGatewayFactory (multiple payment gateways)
  → FraudDetectionService (fraud checks)
  → EventPublisher (payment events)

UserService depends on:
  → NotificationServiceClient (user notifications)
  → EventPublisher (user events)

OrderApiController depends on:
  → OrderService (all order operations)
```

## Technologies & Frameworks

- **Backend**: Java, Spring Boot, Spring Security
- **Data**: JPA/Hibernate, SQL
- **Integration**: gRPC, REST, WebSocket
- **Frontend**: React, TypeScript, AG Grid
- **Validation**: javax.validation, custom validators
- **Documentation**: Swagger/OpenAPI
- **Event-Driven**: Custom event publisher pattern
- **Concurrency**: Java synchronization, locks
- **Security**: Role-based access control, PCI compliance

## File Statistics

| File | Lines | Purpose |
|------|-------|---------|
| OrderService.java | 470 | Order orchestration |
| PaymentService.java | 430 | Payment processing |
| InventoryService.java | 390 | Inventory management |
| OrderManagement.tsx | 570 | Orders AG Grid |
| OrderEventStreamService.java | 570 | gRPC streaming |
| OrderApiController.java | 550 | REST API |
| UserManagement.tsx | 470 | Users AG Grid |
| User.java | 320 | User domain model |
| UserService.java | 290 | User management |
| Order.java | 280 | Order domain model |
| ValidationUtils.java | 193 | Validation utilities |
| DateTimeUtils.java | 180 | Date/time utilities |
| Enums.java | 84 | Shared enums |

**Total: ~4,800 lines of production-grade code**

## Testing the Chat Panel

This fixture is perfect for testing queries like:

1. **"Show me Spring Boot REST API patterns"**
   - Should find OrderApiController.java with @RestController, @RequestMapping, etc.

2. **"How to implement AG Grid with blue rows for premium users?"**
   - Should find UserManagement.tsx with the `getRowClass` implementation

3. **"Show me gRPC server-side streaming examples"**
   - Should find OrderEventStreamService.java

4. **"How do I handle payment processing with refunds?"**
   - Should find PaymentService.java with processRefund method

5. **"Show me inventory reservation patterns"**
   - Should find InventoryService.java with reserve/confirm/release workflow

6. **"How to implement conditional row coloring in AG Grid based on order status?"**
   - Should find OrderManagement.tsx with complex row styling

7. **"Show me @Transactional patterns with compensation"**
   - Should find OrderService.java processPayment method

8. **"How to implement credit card validation with Luhn algorithm?"**
   - Should find ValidationUtils.java

## Architecture Highlights

1. **Separation of Concerns**: Clear separation between layers (domain, service, API, UI)
2. **Dependency Injection**: Spring @Autowired throughout
3. **Event-Driven**: Asynchronous event publishing for loose coupling
4. **Transaction Management**: Proper @Transactional boundaries
5. **Error Handling**: Comprehensive exception handling with compensating actions
6. **Security**: Role-based access control at API level
7. **Real-time Updates**: WebSocket and gRPC streaming
8. **Caching**: Strategic caching for performance
9. **Validation**: Multi-layer validation (DTOs, services, domain)
10. **Documentation**: Self-documenting code with OpenAPI annotations
