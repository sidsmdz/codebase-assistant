# OpenCat AST + BM25 Search - Test Guide

## Overview

This guide demonstrates the comprehensive testing setup for the OpenCat hybrid search system using a realistic enterprise-grade multi-module project.

## Test Project Structure

```
test-fixtures/enterprise-app/
├── backend/                    # Spring Boot Backend
│   ├── UserService.java        # User management service
│   ├── UserController.java     # REST API endpoints
│   └── OrderService.java       # Order processing service
│
├── grpc-service/               # gRPC Microservices
│   └── PaymentServiceImpl.java # Payment processing gRPC service
│
└── frontend/                   # React/TypeScript Frontend
    ├── UserGrid.tsx            # AG Grid with conditional row coloring
    └── OrderGrid.tsx           # Advanced AG Grid with multiple color schemes
```

## Test Project Features

### 1. Spring Boot Backend

**UserService.java** - Enterprise-grade service layer:
- ✅ CRUD operations with repository pattern
- ✅ gRPC service integration
- ✅ Audit logging
- ✅ Stream API for filtering
- ✅ Transaction management
- ✅ Error handling patterns

**UserController.java** - RESTful API:
- ✅ `@RestController` with multiple endpoints
- ✅ GET, POST, PUT, DELETE operations
- ✅ Request/response DTOs
- ✅ Bulk import functionality

**OrderService.java** - Complex business logic:
- ✅ Payment processing integration
- ✅ Order state management
- ✅ Refund processing
- ✅ Statistics calculation

### 2. gRPC Services

**PaymentServiceImpl.java** - Microservice implementation:
- ✅ gRPC service with `StreamObserver`
- ✅ Async response handling
- ✅ Payment gateway simulation
- ✅ Transaction ID generation
- ✅ Error handling with logging

### 3. React/TypeScript Frontend

**UserGrid.tsx** - AG Grid with Conditional Styling:
- ✅ **BLUE rows**: Premium users (`status === 'PREMIUM'`)
- ✅ **WHITE rows**: Regular users (default)
- ✅ **RED tint**: Inactive users
- ✅ React hooks (`useState`, `useEffect`)
- ✅ Custom cell renderers
- ✅ Editable cells with auto-save
- ✅ Row selection for bulk operations

**OrderGrid.tsx** - Advanced AG Grid Implementation:
- ✅ **BLUE rows**: Paid orders (`status === 'PAID'`)
- ✅ **WHITE rows**: Pending orders
- ✅ **GREEN rows**: Completed orders
- ✅ **RED rows**: Cancelled/Failed orders
- ✅ **YELLOW rows**: Processing orders
- ✅ Status badges with color coding
- ✅ Action buttons per row
- ✅ Bulk operations
- ✅ Complex cell renderers

## Running the Tests

### Setup

```bash
cd /home/sid/awesomeProject/codebase-assistant

# Install dependencies
npm install

# Install test dependencies
npm install --save-dev jest @jest/globals @types/jest ts-jest

# Configure Jest (if not already configured)
npx ts-jest config:init
```

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- hybrid-search.test.ts

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

## Example Search Queries

The test suite includes realistic search scenarios you might encounter when building an enterprise application.

### AG Grid Styling Queries

#### Query: "how to color AG Grid rows blue for some and white for others"

**Expected Results:**
- `UserGrid.tsx` - Shows `getRowStyle()` function
- Demonstrates conditional styling based on user status
- Blue background for premium users, white for regular users

**Code Example Found:**
```typescript
const getRowStyle = (params: RowClassParams): any => {
    const user = params.data as User;

    // Blue background for premium users
    if (user.status === 'PREMIUM') {
        return {
            backgroundColor: '#cfe2ff',
            fontWeight: 'bold'
        };
    }

    // White (default) for regular users
    return {
        backgroundColor: '#ffffff'
    };
};
```

#### Query: "ag grid highlight premium users with blue background"

**Expected Results:**
- Premium user styling implementation
- Row class assignment
- CSS styling for premium rows

### Spring Boot Patterns

#### Query: "getUserById method"

**Expected Results:**
- `UserService.getUserById()` method
- Shows repository pattern usage
- Demonstrates Optional return type
- Error handling with audit logging

**Code Example Found:**
```java
public Optional<User> getUserById(Long userId) {
    auditService.logAccess("getUserById", userId);

    try {
        return userRepository.findById(userId)
            .map(user -> {
                user.setPermissions(userServiceGrpc.getUserPermissions(userId));
                return user;
            });
    } catch (Exception e) {
        auditService.logError("getUserById", userId, e);
        throw new RuntimeException("Failed to retrieve user", e);
    }
}
```

#### Query: "spring boot service class with @Autowired"

**Expected Results:**
- Spring service classes with dependency injection
- Shows `@Service` annotation
- Multiple `@Autowired` fields
- Integration with repositories and gRPC services

### gRPC Integration

#### Query: "grpc payment processing service"

**Expected Results:**
- `PaymentServiceImpl` class
- StreamObserver async pattern
- Payment gateway integration
- Transaction handling

**Code Example Found:**
```java
@Override
public void processPayment(
    PaymentRequest request,
    StreamObserver<PaymentResponse> responseObserver
) {
    logger.info("Processing payment for order: " + request.getOrderId());

    try {
        boolean success = validateAndProcessPayment(...);

        PaymentResponse response = PaymentResponse.newBuilder()
            .setSuccess(success)
            .setTransactionId(generateTransactionId(orderId))
            .build();

        responseObserver.onNext(response);
        responseObserver.onCompleted();
    } catch (Exception e) {
        responseObserver.onError(e);
    }
}
```

### React Hooks & State Management

#### Query: "react hooks useState useEffect example"

**Expected Results:**
- Components using React hooks
- Data fetching on mount
- State management patterns

**Code Example Found:**
```typescript
const [users, setUsers] = useState<User[]>([]);
const [loading, setLoading] = useState<boolean>(true);

useEffect(() => {
    loadUsers();
}, []);

const loadUsers = async () => {
    try {
        setLoading(true);
        const data = await userService.getAllUsers();
        setUsers(data);
    } catch (error) {
        console.error('Failed to load users:', error);
    } finally {
        setLoading(false);
    }
};
```

### Complex Business Logic

#### Query: "process payment with try catch error handling"

**Expected Results:**
- Payment processing methods
- Comprehensive error handling
- Status updates
- Audit logging

#### Query: "java stream filter and collect example"

**Expected Results:**
- Stream API usage patterns
- Filtering and mapping operations
- Collectors usage

**Code Example Found:**
```java
public List<User> getActiveUsersByStatus(String status) {
    return userRepository.findAll().stream()
        .filter(user -> status.equals(user.getStatus()))
        .filter(User::isActive)
        .collect(Collectors.toList());
}
```

## Search System Capabilities

### 1. AST-Based Structural Search (50% weight)

- ✅ Exact identifier matching
- ✅ Fuzzy matching with Levenshtein distance
- ✅ Type-aware search (CLASS, METHOD, FUNCTION)
- ✅ Language filtering (Java, TypeScript, JavaScript)

### 2. BM25 Text Search (30% weight)

- ✅ Statistical relevance ranking
- ✅ Multi-field search (name, code, description)
- ✅ Field boosting (name: 3x, code: 1x, comment: 1.5x)
- ✅ Term frequency and inverse document frequency

### 3. Hybrid Ranking (20% weight)

- ✅ Score fusion from AST and BM25
- ✅ Normalized scoring (0-1 range)
- ✅ Configurable weights
- ✅ Deduplication

## Test Coverage

The test suite covers:

1. **Ingestion Phase**
   - Java AST parsing
   - TypeScript/React parsing
   - Index building

2. **Search Scenarios**
   - AG Grid styling patterns
   - Spring Boot patterns
   - gRPC integration
   - React hooks
   - Business logic patterns

3. **Search Quality**
   - Ranking accuracy
   - Semantic relevance
   - Performance benchmarks

4. **Statistics**
   - Pattern counts
   - AST node counts
   - Term index size

## Performance Benchmarks

Expected performance on the test project:

- **Ingestion Time**: < 5 seconds for all files
- **Search Time**: < 1000ms per query
- **Index Size**:
  - Patterns: 30-50
  - AST Nodes: 100-200
  - Unique Terms: 500-1000

## Interpreting Test Results

### Successful Test Output

```
✅ Knowledge Base initialized
✅ Extracted 15 AST nodes from UserService.java
✅ Extracted 8 AST nodes from UserGrid.tsx
✅ Found 3 results for AG Grid coloring
   Top match: UserGrid
✅ Found getUserById method
   Signature: METHOD from UserService.java: public Optional getUserById(Long userId)
✅ Found Spring Service pattern
✅ Search completed in 250ms

📊 Final Statistics:
   Patterns: 42
   AST Nodes: 156
   Indexed Terms: 847
```

### Understanding Search Scores

Search results include multiple scoring components:

- **AST Score**: 0.0 - 1.0 (structural match quality)
- **BM25 Score**: 0.0 - 1.0 (statistical relevance)
- **Total Score**: Weighted combination of above

Higher scores indicate better matches.

## Extending the Tests

### Adding New Test Scenarios

```typescript
it('should find your custom pattern', async () => {
    const query = "your search query";

    const results = await kbManager.searchPatterns(query, 5);

    expect(results.length).toBeGreaterThan(0);

    const yourPattern = results.find(r =>
        r.code.includes('yourKeyword')
    );

    expect(yourPattern).toBeDefined();
    expect(yourPattern?.code).toContain('expectedCode');
});
```

### Adding More Test Files

1. Create new files in `test-fixtures/enterprise-app/`
2. Follow existing patterns (Spring, gRPC, React)
3. Add test cases in `hybrid-search.test.ts`

## Troubleshooting

### Tests Failing

**Issue**: "No patterns found"
- **Solution**: Ensure test fixtures exist in `test-fixtures/enterprise-app/`
- **Solution**: Check ingestion completed successfully

**Issue**: "Search too slow"
- **Solution**: Check database indices are created
- **Solution**: Reduce number of patterns for testing

**Issue**: "Wrong results returned"
- **Solution**: Verify query intent parser is extracting correct keywords
- **Solution**: Adjust BM25 weights or field boosts

## Real-World Usage

After running tests, you can use the same patterns in your actual VSCode extension:

1. **Index your workspace**: `Command Palette → OpenCat: Index Workspace`
2. **Search in chat**: Ask questions like:
   - "how do I create an AG Grid with blue and white rows?"
   - "show me getUserById implementation"
   - "find payment processing with error handling"

The extension will search your indexed codebase and return relevant examples!

## Next Steps

1. Run the test suite to verify everything works
2. Index your real project
3. Try the search queries in the VSCode extension
4. Customize field boosts and weights based on your needs
5. Add more test fixtures for your specific frameworks

---

**Happy Testing!** 🚀

For questions or issues, check the main README.md or open an issue on GitHub.
