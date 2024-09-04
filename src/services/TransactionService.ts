import { AccountService } from './AccountService.js';
import { UIManager } from '../ui/UIManager.js';
import { PXE } from '@aztec/circuit-types';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js';
import { Contract, AccountWalletWithSecretKey } from '@aztec/aztec.js';
import { AztecAddress } from '@aztec/circuits.js';

export class TransactionService {
  private transactions: any[] = [];

  constructor(
    private pxe: PXE,
    private uiManager: UIManager,
    private accountService: AccountService
  ) {
    this.loadTransactionsFromLocalStorage();
  }

  private saveTransactionsToLocalStorage() {
    localStorage.setItem('transactions', JSON.stringify(this.transactions));
  }

  private loadTransactionsFromLocalStorage() {
    const storedTransactions = localStorage.getItem('transactions');
    if (storedTransactions) {
      this.transactions = JSON.parse(storedTransactions);
    }
  }

  async fetchTransactions() {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      console.warn("No wallet available. Please create an account first.");
      return;
    }

    await this.fetchPrivateTransactions(currentWallet);
    await this.fetchPublicTransactions(currentWallet);

    this.saveTransactionsToLocalStorage();
  }

  private async fetchPrivateTransactions(currentWallet: AccountWalletWithSecretKey) {
    const tokenAddresses = await this.getTokenAddresses(currentWallet);

    for (const tokenAddress of tokenAddresses) {
      const notes = await this.pxe.getIncomingNotes({
        owner: currentWallet.getAddress(),
        contractAddress: tokenAddress,
        storageSlot: TokenContract.storage.balances.slot,
        scopes: [currentWallet.getAddress()],
      });

      const privateTransactions = notes.map(note => ({
        type: 'receive',
        amount: note.note.items[0].toString(),
        token: 'ETH', // Replace with actual token symbol
        status: 'completed',
        timestamp: Date.now(),
      }));

      this.transactions.push(...privateTransactions);
    }
  }

  private async fetchPublicTransactions(currentWallet: AccountWalletWithSecretKey) {
    const tokenAddresses = await this.getTokenAddresses(currentWallet);

    for (const tokenAddress of tokenAddresses) {
      const contract = await Contract.at(tokenAddress, TokenContractArtifact, currentWallet);
      const publicTransfers = await contract.methods.getPublicTransfers(currentWallet.getAddress()).simulate();

      const publicTransactions = publicTransfers.map((transfer: any) => ({
        type: 'send',
        amount: transfer.amount.toString(),
        token: 'ETH', // Replace with actual token symbol
        status: 'completed',
        timestamp: transfer.timestamp,
      }));

      this.transactions.push(...publicTransactions);

      const fromBlock = await this.pxe.getBlockNumber();
      const logFilter = {
        fromBlock,
        toBlock: fromBlock + 1,
        contractAddress: tokenAddress,
        eventSignature: 'Transfer(address,address,uint256)',
      };
      const logs = await this.pxe.getUnencryptedLogs(logFilter);

      const logTransactions = logs.logs.map((log: any) => ({
        type: 'send',
        amount: log.args[2].toString(),
        token: 'ETH', // Replace with actual token symbol
        status: 'completed',
        timestamp: Date.now(),
      }));

      this.transactions.push(...logTransactions);
    }
  }

  private async getTokenAddresses(): Promise<AztecAddress[]> {
    const tokenAddresses: AztecAddress[] = [];
    const tokens = await this.accountService.getTokens();

    for (const token of tokens) {
      try {
        const tokenAddress = await this.accountService.getTokenAddress(token);
        tokenAddresses.push(tokenAddress);
      } catch (error) {
        console.error(`Error getting token address for ${token.name} (${token.symbol}):`, error);
      }
    }

    return tokenAddresses;
  }

  getTransactions() {
    return this.transactions;
  }
}