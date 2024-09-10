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

        const incomingNotes = await this.pxe.getIncomingNotes({
          contractAddress: tokenAddress,
          owner: currentWallet.getAddress()
        });

        const outgoingNotes = await this.pxe.getOutgoingNotes({
          contractAddress: tokenAddress,
          owner: currentWallet.getAddress()
        });

        console.log("Incoming notes:", incomingNotes);
        console.log("Outgoing notes:", outgoingNotes);

        const processedTransactions = this.processNotes(incomingNotes, outgoingNotes, symbol, currentWallet);
        transactions.push(...processedTransactions);
      } catch (error) {
        console.error(`Error fetching transactions for token at ${tokenAddress.toString()}:`, error);
      }
    }

    transactions.sort((a, b) => b.timestamp - a.timestamp);
    console.log('All transactions fetched:', transactions);
    return transactions;
  }

  private processNotes(incomingNotes: UniqueNote[], outgoingNotes: UniqueNote[], symbol: string, currentWallet: AccountWallet): Transaction[] {
    const transactions: Transaction[] = [];
    const walletAddress = currentWallet.getAddress().toString();

    // Process incoming notes (received transactions)
    for (const note of incomingNotes) {
      transactions.push({
        action: 'transfer',
        amount: (note.note.items[0].toBigInt()/BigInt(1e9)).toString(),
        token: symbol,
        status: 'completed',
        timestamp: Number(note.nonce.toBigInt()) * 1000,
        from: note.owner.toString(),
        to: walletAddress,
        txHash: note.txHash.toString()
      });
    }

    // Process outgoing notes (sent transactions)
    for (const note of outgoingNotes) {
      transactions.push({
        action: 'transfer',
        amount: (note.note.items[0].toBigInt()/BigInt(1e9)).toString(),
        token: symbol,
        status: 'completed',
        timestamp: Number(note.nonce.toBigInt()) * 1000,
        from: walletAddress,
        to: note.owner.toString(),
        txHash: note.txHash.toString()
      });
    }

    return transactions;
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