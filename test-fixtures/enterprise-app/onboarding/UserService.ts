// Simulated enterprise onboarding service
export class UserService {
  createUser(user: { name: string; email: string }) {
    // ... logic
    return { id: 'u1', ...user };
  }
  onboardUser(user: { name: string; email: string }) {
    // ... logic
    return this.createUser(user);
  }
}
