import { AccountService } from './AccountService.js';
import { UIManager } from '../ui/UIManager.js';
import { PXE } from '@aztec/circuit-types';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js';
import { Contract, AccountWallet } from '@aztec/aztec.js';
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
    console.log('Fetching transactions...');
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      console.warn("No wallet available. Please create an account first.");
      return;
    }

    this.transactions = []; // Clear existing transactions

    await this.fetchPrivateTransactions(currentWallet);
    await this.fetchPublicTransactions(currentWallet);

    console.log('All transactions fetched:', this.transactions);
    this.saveTransactionsToLocalStorage();
  }

  private async fetchPrivateTransactions(currentWallet: AccountWallet) {
    console.log('Fetching private transactions...');
    const tokenAddresses = await this.getTokenAddresses();

    for (const tokenAddress of tokenAddresses) {
      try {
        console.log('Fetching private notes with params:', {
          owner: currentWallet.getAddress().toString(),
          contractAddress: tokenAddress.toString(),
          storageSlot: TokenContract.storage.balances.slot.toString(),
          scopes: [currentWallet.getAddress().toString()],
        });

        const notes = await this.pxe.getIncomingNotes({
          owner: currentWallet.getAddress(),
          contractAddress: tokenAddress,
          storageSlot: TokenContract.storage.balances.slot,
          scopes: [currentWallet.getAddress()],
        });

        console.log(`Found ${notes.length} private notes for token at ${tokenAddress.toString()}`);

        const privateTransactions = notes.map(note => ({
          type: 'receive',
          amount: note.note.items[0].toString(),
          token: 'ETH', // Replace with actual token symbol
          status: 'completed',
          timestamp: Date.now(), // You might want to use a more accurate timestamp if available
        }));

        this.transactions.push(...privateTransactions);
      } catch (error) {
        console.error(`Error fetching private transactions for token at ${tokenAddress.toString()}:`, error);
      }
    }
  }

  private async fetchPublicTransactions(currentWallet: AccountWallet) {
    console.log('Fetching public transactions...');
    const tokenAddresses = await this.getTokenAddresses();

    for (const tokenAddress of tokenAddresses) {
      try {
        const contract = await TokenContract.at(tokenAddress, currentWallet);
        
        const fromBlock = 0;
        const toBlock = await this.pxe.getBlockNumber();
        const logFilter = {
          fromBlock,
          toBlock,
          contractAddress: tokenAddress,
          eventSelector: TokenContract.events.Transfer.eventSelector.toString(), // Convert to string
        };

        console.log('Fetching public logs with filter:', logFilter);

        const logs = await this.pxe.getUnencryptedLogs(logFilter);

        console.log(`Found ${logs.logs.length} public logs for token at ${tokenAddress.toString()}`);

        const publicTransactions = logs.logs
          .map((log: any) => {
            const decodedLog = TokenContract.events.Transfer.decode(log);
            if (!decodedLog) return null;

            // Assuming the Transfer event structure is { from, to, amount }
            // Adjust these field names if they're different in the actual event
            return {
              type: decodedLog.from.equals(currentWallet.getAddress()) ? 'send' : 'receive',
              amount: decodedLog.amount?.toString() || '0', // Use optional chaining and provide a default
              token: 'ETH', // Replace with actual token symbol if available
              status: 'completed',
              timestamp: log.timestamp,
              from: decodedLog.from.toString(),
              to: decodedLog.to.toString(),
            };
          })
          .filter((tx): tx is NonNullable<typeof tx> => tx !== null);

        this.transactions.push(...publicTransactions);
      } catch (error) {
        console.error(`Error fetching public transactions for token at ${tokenAddress.toString()}:`, error);
      }
    }
  }

  private async getTokenAddresses(): Promise<AztecAddress[]> {
    const tokenAddresses: AztecAddress[] = [];
    const tokens = await this.accountService.getTokens();

    for (const token of tokens) {
      try {
        const tokenAddress = await this.accountService.getTokenAddress(token);
        tokenAddresses.push(tokenAddress);
        console.log(`Token address for ${token.name} (${token.symbol}): ${tokenAddress.toString()}`);
      } catch (error) {
        console.error(`Error getting token address for ${token.name} (${token.symbol}):`, error);
      }
    }

    console.log('Token addresses:', tokenAddresses.map(addr => addr.toString()));
    return tokenAddresses;
  }

  getTransactions() {
    console.log('Returning transactions:', this.transactions);
    return this.transactions;
  }
}