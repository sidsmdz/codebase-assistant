# 🚀 Quick Test Guide - Pattern Discovery

## TL;DR - Test in 3 Steps

### 1. Run Tests
```bash
npm test -- core-functionality.test.ts
```
Expected: **21/21 tests passing** ✅

### 2. Index Enterprise Fixture
In VSCode:
- Open `test-fixtures/enterprise-erp/` folder
- Right-click → "OpenCat: Index Workspace for OpenCat"
- Wait ~10 seconds

### 3. Try These Queries in Chat Panel

Open chat (`Cmd/Ctrl+Shift+P` → "OpenCat: Open Chat") and try:

#### ⭐ Critical Test #1: AG Grid Row Coloring
```
"Show me AG Grid with blue rows for premium users and white for regular users"
```
**Should Find**: UserManagement.tsx with `getRowClass` callback

#### ⭐ Critical Test #2: Transaction Compensation
```
"Spring @Transactional with compensating transaction for inventory release"
```
**Should Find**: OrderService.java with `processPayment` method

#### ⭐ Critical Test #3: Inventory Reservation
```
"inventory reservation pattern with reserve confirm release"
```
**Should Find**: InventoryService.java with reservation workflow

## 🎯 10-Second Validation

Run this single command to verify everything works:
```bash
npm test -- core-functionality.test.ts && echo "✅ All systems operational!"
```

## 📊 What Was Built

```
Enterprise ERP Test Fixture
├── 14 files, ~4,800 lines
├── 8 Java services (Spring Boot, gRPC)
├── 2 React components (AG Grid)
├── 50+ architectural patterns
└── Real-world microservices architecture
```

## 🔍 Example Queries & Expected Results

| Query | Expected File | Key Pattern |
|-------|--------------|-------------|
| "AG Grid blue premium rows" | UserManagement.tsx | `getRowClass` callback |
| "@Transactional compensation" | OrderService.java | `processPayment` with rollback |
| "gRPC streaming events" | OrderEventStreamService.java | `StreamObserver` |
| "Luhn algorithm credit card" | ValidationUtils.java | `luhnCheck` method |
| "REST API security annotations" | OrderApiController.java | `@PreAuthorize` |
| "inventory pessimistic locking" | InventoryService.java | `synchronized` |
| "payment refund processing" | PaymentService.java | `processRefund` |
| "order state machine" | Order.java | `markAs*` methods |
| "React master-detail grid" | OrderManagement.tsx | `detailCellRenderer` |
| "event driven architecture" | Multiple files | `eventPublisher.publish` |

## 🏃 Performance Benchmarks

From test results:
- **Tokenization**: 22,250 chars/ms
- **BM25 Scoring**: 0.03ms per document
- **1000 Documents**: 30ms total
- **Indexing**: <10 seconds for entire fixture

## ✅ Success Criteria

Your system is working correctly if:

1. ✅ All 21 core tests pass
2. ✅ Fixture indexes without errors
3. ✅ Chat panel finds UserManagement.tsx for AG Grid query
4. ✅ Results are relevant and ranked properly
5. ✅ Code snippets are shown in results

## 🐛 Troubleshooting

### Tests Failing?
```bash
# Recompile TypeScript
npm run compile

# Clear cache and retry
npm test -- --clearCache core-functionality.test.ts
```

### Indexing Slow?
- Check console for errors
- Verify test-fixtures/enterprise-erp/ exists
- Try indexing one file at a time

### Chat Not Finding Patterns?
- Ensure indexing completed successfully
- Check "View KB Statistics" to see pattern count
- Try simpler queries first ("OrderService", "UserManagement")

## 📁 Key Files to Check

If something's not working, verify these exist:

```bash
ls -la test-fixtures/enterprise-erp/backend/order-service/OrderService.java
ls -la test-fixtures/enterprise-erp/frontend/admin-portal/components/UserManagement.tsx
ls -la test-fixtures/enterprise-erp/shared-libs/utils/ValidationUtils.java
```

## 🎓 Understanding the Results

When you search for "AG Grid blue rows premium":

1. **Query Parser** extracts: `["grid", "blue", "rows", "premium"]`
2. **Tokenizer** normalizes: `["grid", "blue", "row", "premium"]`
3. **BM25** scores all patterns against these terms
4. **Results** ranked by relevance:
   - UserManagement.tsx (mentions all terms)
   - getRowClass method (implements the pattern)
   - Related CSS/styling code

## 📝 Quick Command Reference

```bash
# Run all tests
npm test

# Run specific test
npm test -- core-functionality.test.ts

# Run with coverage
npm test -- --coverage

# Compile TypeScript
npm run compile

# Lint code
npm run lint
```

## 🎉 Success!

If you see all tests passing and can find patterns in the chat panel, congratulations! The pattern discovery system is working correctly.

**Next**: Try your own queries or index your actual codebase!
