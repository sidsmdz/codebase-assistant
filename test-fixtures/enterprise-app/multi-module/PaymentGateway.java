package multi_module;

public class PaymentGateway {
    public String createTransaction(String userId, double amount) {
        // ... logic
        return "txn-123";
    }
    public boolean processPayment(String txnId) {
        // ... logic
        return true;
    }
}
