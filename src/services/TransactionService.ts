import { PXE } from '@aztec/aztec.js';
import { UIManager } from '../ui/UIManager.js';
import { AccountService } from './AccountService.js';
import { KeystoreFactory } from '../factories/KeystoreFactory.js';

export interface Transaction {
  action: 'mint' | 'shield' | 'unshield' | 'transfer' | 'redeem';
  token: string;
  amount: string;
  from?: string;
  to?: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  txHash?: string;
}

export class TransactionService {
  constructor(
    private pxe: PXE,
    private uiManager: UIManager,
    private accountService: AccountService
  ) {}

  async fetchTransactions(): Promise<Transaction[]> {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      throw new Error('No wallet available. Please create an account first.');
    }

    const keystore = KeystoreFactory.getKeystore();
    return keystore.getTransactions(currentWallet.getAddress());
  }

  async saveTransaction(transaction: Transaction) {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      throw new Error('No wallet available. Please create an account first.');
    }

    const keystore = KeystoreFactory.getKeystore();
    await keystore.saveTransaction(currentWallet.getAddress(), transaction);
  }
}