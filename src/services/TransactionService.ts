import { AccountService } from './AccountService.js';
import { UIManager } from '../ui/UIManager.js';
import { PXE, EventType, UniqueNote, L2Block } from '@aztec/circuit-types';
import { TokenContract } from '@aztec/noir-contracts.js';
import { AccountWallet, Fr, AztecAddress, EventSelector, CheatCodes, TxHash } from '@aztec/aztec.js';
import { TokenService } from './TokenService.js';
import { CONFIG } from '../config.js';

export interface Transaction {
  action: 'mint' | 'shield' | 'unshield' | 'transfer' | 'redeem';
  amount: string;
  token: string;
  status: 'completed';
  timestamp: number;
  from: string;
  to: string;
  txHash: string;
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

        const processedTransactions = this.processNotes(outgoingNotes, incomingNotes, symbol, currentWallet);
        transactions.push(...processedTransactions);
      } catch (error) {
        console.error(`Error fetching transactions for token at ${tokenAddress.toString()}:`, error);
      }
    }

    transactions.sort((a, b) => b.timestamp - a.timestamp);

    console.log('All transactions fetched:', transactions);
    return transactions;
  }

  private processNotes(outgoingNotes: UniqueNote[], incomingNotes: UniqueNote[], symbol: string, currentWallet: AccountWallet): Transaction[] {
    const transactions: Transaction[] = [];
    const walletAddress = currentWallet.getAddress().toString();

    // Combine and sort all notes by timestamp
    const allNotes = [...outgoingNotes, ...incomingNotes].sort((a, b) => {
      const timestampA = Number(a.nonce.toBigInt());
      const timestampB = Number(b.nonce.toBigInt());
      return timestampB - timestampA;
    });

    let previousBalance = BigInt(0);

    for (let i = 0; i < allNotes.length; i++) {
      const note = allNotes[i];
      const amount = BigInt(note.note.items[0].value.toString());
      const isOutgoing = outgoingNotes.includes(note);

      let action: Transaction['action'];
      let changeAmount: bigint;

      if (i === allNotes.length - 1) {
        // First transaction (chronologically last)
        action = 'mint';
        changeAmount = amount;
      } else {
        const nextNote = allNotes[i + 1];
        const nextAmount = BigInt(nextNote.note.items[0].value.toString());

        if (isOutgoing) {
          if (amount < previousBalance) {
            action = 'unshield';
            changeAmount = previousBalance - amount;
          } else {
            action = 'transfer';
            changeAmount = nextAmount - amount;
          }
        } else {
          if (amount > previousBalance) {
            action = 'shield';
            changeAmount = amount - previousBalance;
          } else {
            continue; // Skip this note as it's likely a change from a previous transaction
          }
        }
      }

      previousBalance = amount;

      transactions.push({
        action,
        amount: changeAmount.toString(),
        token: symbol,
        status: 'completed',
        timestamp: Number(note.nonce.toBigInt()) * 1000, // Convert to milliseconds
        from: action === 'transfer' && isOutgoing ? walletAddress : note.owner.toString(),
        to: action === 'transfer' && !isOutgoing ? walletAddress : note.owner.toString(),
        txHash: note.txHash.toString()
      });
    }

    return transactions.reverse(); // Reverse to get chronological order
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