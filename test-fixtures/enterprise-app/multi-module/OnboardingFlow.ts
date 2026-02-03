import { UserService } from '../onboarding/UserService';
import { Transaction } from '../shared/Transaction';

export function onboardingFlow(user: { name: string; email: string }): Transaction {
  const service = new UserService();
  const created = service.onboardUser(user);
  // ...simulate payment
  return { id: 'txn-1', amount: 100, status: 'pending' };
}
