import { AccountService } from './AccountService.js';
import { UIManager } from '../ui/UIManager.js';
import { PXE, EventType, UniqueNote, L2Block } from '@aztec/circuit-types';
import { TokenContract } from '@aztec/noir-contracts.js';
import { AccountWallet, Fr, AztecAddress, EventSelector, CheatCodes, TxHash } from '@aztec/aztec.js';
import { TokenService } from './TokenService.js';
import { CONFIG } from '../config.js';

export interface Transaction {
  type: 'send' | 'receive';
  amount: string;
  token: string;
  status: 'completed';
  timestamp: number;
  from: string;
  to: string;
  txHash: string;
  action: 'mint' | 'shield' | 'unshield' | 'transfer' | 'redeem';
}

export class TransactionService {
  constructor(
    private pxe: PXE,
    private uiManager: UIManager,
    private accountService: AccountService,
    private tokenService: TokenService
  ) {}

  async fetchTransactions(): Promise<Transaction[]> {
    console.log('Fetching transactions...');
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      console.warn("No wallet available. Please create an account first.");
      return [];
    }

    let transactions: Transaction[] = [];

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

        const processedTransactions = await this.processNotes(outgoingNotes, incomingNotes, symbol, currentWallet);
        transactions.push(...processedTransactions);
      } catch (error) {
        console.error(`Error fetching transactions for token at ${tokenAddress.toString()}:`, error);
      }
    }

    // Sort transactions by timestamp in descending order
    transactions.sort((a, b) => b.timestamp - a.timestamp);

    console.log('All transactions fetched:', transactions);
    return transactions;
  }

  private async processNotes(outgoingNotes: UniqueNote[], incomingNotes: UniqueNote[], symbol: string, currentWallet: AccountWallet): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    const walletAddress = currentWallet.getAddress().toString();

    // Process outgoing notes
    for (const note of outgoingNotes) {
      const tx = await this.createTransaction(note, symbol, 'send', walletAddress);
      transactions.push(tx);
    }

    // Process incoming notes
    for (const note of incomingNotes) {
      const tx = await this.createTransaction(note, symbol, 'receive', walletAddress);
      transactions.push(tx);
    }

    // Determine actions based on note patterns
    this.determineActions(transactions);

    return transactions;
  }

  private async createTransaction(note: UniqueNote, symbol: string, type: 'send' | 'receive', walletAddress: string): Promise<Transaction> {
    const amount = note.note.items[0].value;
    const txHash = note.txHash;
    const receipt = await this.pxe.getTxReceipt(txHash);
    
    let timestamp = Date.now();
    if (receipt && receipt.blockNumber !== undefined) {
      const block = await this.pxe.getBlock(receipt.blockNumber);
      if (block) {
        timestamp = Number(block.getStats().blockTimestamp) * 1000;
      }
    }

    return {
      type,
      amount: amount.toString(),
      token: symbol,
      status: 'completed',
      timestamp,
      from: type === 'send' ? walletAddress : note.owner.toString(),
      to: type === 'receive' ? walletAddress : note.owner.toString(),
      txHash: txHash.toString(),
      action: 'transfer' // Default action, will be updated in determineActions
    };
  }

  private determineActions(transactions: Transaction[]) {
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const nextTx = transactions[i + 1];

      if (tx.type === 'send' && nextTx && nextTx.type === 'receive' && tx.amount === nextTx.amount) {
        // This is likely a transfer or an unshield operation
        if (tx.from === tx.to) {
          tx.action = 'unshield';
          nextTx.action = 'unshield';
        } else {
          tx.action = 'transfer';
          nextTx.action = 'transfer';
        }
      } else if (tx.type === 'receive' && !nextTx) {
        // This might be a mint or shield operation
        tx.action = tx.from === tx.to ? 'mint' : 'shield';
      } else if (tx.type === 'send' && (!nextTx || nextTx.type === 'send')) {
        // This might be an unshield operation without change
        tx.action = 'unshield';
      }

      // Handle redeem actions
      if (tx.action === 'shield' && nextTx && nextTx.action === 'unshield') {
        tx.action = 'redeem';
        nextTx.action = 'redeem';
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
}