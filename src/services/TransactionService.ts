import { AccountService } from './AccountService.js';
import { UIManager } from '../ui/UIManager.js';
import { PXE, EventType, UniqueNote, L2Block } from '@aztec/circuit-types';
import { TokenContract } from '@aztec/noir-contracts.js';
import { AccountWallet, Fr, AztecAddress, EventSelector, CheatCodes, TxHash } from '@aztec/aztec.js';
import { TokenService } from './TokenService.js';
import { CONFIG } from '../config.js';

interface Transaction {
  type: 'send' | 'receive';
  amount: string;
  token: string;
  status: 'completed';
  timestamp: number;
  from: string;
  to: string;
  txHash: string;
}

export class TransactionService {
  private transactions: Transaction[] = [];

  constructor(
    private pxe: PXE,
    private uiManager: UIManager,
    private accountService: AccountService,
    private tokenService: TokenService
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

    const tokenAddresses = await this.getTokenAddresses();

    for (const tokenAddress of tokenAddresses) {
      try {
        const token = await this.tokenService.getNameSymbolByAddress(tokenAddress);
        const symbol = token ? token.symbol : 'Unknown';

        const outgoingNotes = await this.pxe.getOutgoingNotes({
          contractAddress: tokenAddress,
          owner: currentWallet.getAddress()
        });

        const incomingNotes = await this.pxe.getIncomingNotes({
          contractAddress: tokenAddress,
          owner: currentWallet.getAddress()
        });

        console.log("Outgoing notes:", outgoingNotes);
        console.log("Incoming notes:", incomingNotes);

        const outgoingTransactions = await this.processNotes(outgoingNotes, symbol, 'send', currentWallet);
        const incomingTransactions = await this.processNotes(incomingNotes, symbol, 'receive', currentWallet);

        this.transactions.push(...outgoingTransactions, ...incomingTransactions);
      } catch (error) {
        console.error(`Error fetching transactions for token at ${tokenAddress.toString()}:`, error);
      }
    }

    // Sort transactions by timestamp in descending order
    this.transactions.sort((a, b) => b.timestamp - a.timestamp);

    console.log('All transactions fetched:', this.transactions);
    this.saveTransactionsToLocalStorage();
  }

  private async processNotes(notes: UniqueNote[], symbol: string, type: 'send' | 'receive', currentWallet: AccountWallet): Promise<Transaction[]> {
    return Promise.all(notes.map(async (note) => {
      const amount = note.note.items[0].value;
      const txHash = note.txHash;
      const receipt = await this.pxe.getTxReceipt(txHash);
      
      let timestamp = Date.now(); // Default to current time if we can't get the block timestamp
      if (receipt && receipt.blockNumber !== undefined) {
        const block = await this.pxe.getBlock(receipt.blockNumber);

        if (block) {
          timestamp = Number(block.getStats().blockTimestamp) * 1000; // Convert to milliseconds
        }
      }

      return {
        type,
        amount: amount.toString(),
        token: symbol,
        status: 'completed',
        timestamp,
        from: type === 'send' ? currentWallet.getAddress().toString() : note.owner.toString(),
        to: type === 'receive' ? currentWallet.getAddress().toString() : note.owner.toString(),
        txHash: txHash.toString()
      };
    }));
  }

  private getTimestampFromBlock(block: L2Block): number {
    if ('timestamp' in block) {
      return Number(block.getStats().blockTimestamp) * 1000; // Convert to milliseconds
    }
    return Date.now(); // Fallback to current time if timestamp is not available
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