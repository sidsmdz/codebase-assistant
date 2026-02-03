// Shared transaction model
export interface Transaction {
  id: string;
  amount: number;
  status: 'pending' | 'complete' | 'failed';
}
