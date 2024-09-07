import { AccountService } from './AccountService.js';
import { UIManager } from '../ui/UIManager.js';
import { PXE, EventType } from '@aztec/circuit-types';
import { TokenContract } from '@aztec/noir-contracts.js';
import { AccountWallet, Fr, AztecAddress, EventSelector, CheatCodes } from '@aztec/aztec.js';
import { TokenService } from './TokenService.js';
import { CONFIG } from '../config.js';



export class TransactionService {
  private transactions: any[] = [];

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

    await this.fetchUnencryptedTransactions(currentWallet);

    await this.fetchEncryptedTransactions(currentWallet);

    console.log('All transactions fetched:', this.transactions);
    this.saveTransactionsToLocalStorage();
  }

  private async fetchEncryptedTransactions(currentWallet: AccountWallet) {
    console.log('Fetching encrypted transactions...');
    const tokenAddresses = await this.getTokenAddresses();

    for (const tokenAddress of tokenAddresses) {
      try {
        //const contract = await TokenContract.at(tokenAddress, currentWallet);
        
        const fromBlock = 0;
        const toBlock = await this.pxe.getBlockNumber();

        const incomingEvents = await currentWallet.getEvents(
          EventType.Encrypted,
          TokenContract.events.Transfer,
          fromBlock,
          toBlock - fromBlock + 1,
          [currentWallet.getCompleteAddress().publicKeys.masterIncomingViewingPublicKey]
        );

        const outgoingEvents = await currentWallet.getEvents(
          EventType.Encrypted,
          TokenContract.events.Transfer,
          fromBlock,
          toBlock - fromBlock + 1,
          [currentWallet.getCompleteAddress().publicKeys.masterOutgoingViewingPublicKey]
        );



        const allEncryptedEvents = [...incomingEvents, ...outgoingEvents];

        console.log(`Found ${allEncryptedEvents.length} encrypted events for token at ${tokenAddress.toString()}`);

        const token = await this.tokenService.getTokenByAddress(tokenAddress);

        const encryptedTransactions = allEncryptedEvents.map(event => ({
          type: event.from.equals(currentWallet.getAddress()) ? 'send' : 'receive',
          amount: event.amount.toString(),
          token: token ? token.symbol : 'Unknown',
          status: 'completed',
          timestamp: Date.now(), // You might want to use a more accurate timestamp if available
          from: event.from.toString(),
          to: event.to.toString(),
          encrypted: true
        }));

        this.transactions.push(...encryptedTransactions);
      } catch (error) {
        console.error(`Error fetching encrypted transactions for token at ${tokenAddress.toString()}:`, error);
      }
    }
  }

  private async fetchUnencryptedTransactions(currentWallet: AccountWallet) {
    console.log('Fetching unencrypted transactions...');
    const tokenAddresses = await this.getTokenAddresses();

    const values = notes.map(note => note.items[0]);
    const balance = values.reduce((sum, current) => sum + current.toBigInt(), 0n);

    for (const tokenAddress of tokenAddresses) {
      try {
        const contract = await TokenContract.at(tokenAddress, currentWallet);
        
        const fromBlock = 0;
        const toBlock = await this.pxe.getBlockNumber();

        const unencryptedEvents = await currentWallet.getEvents(
          EventType.Unencrypted,
          TokenContract.events.Transfer,
          fromBlock,
          toBlock - fromBlock + 1,
        );
        const cc = await CheatCodes.create(CONFIG.l1RpcUrl, this.pxe);


        const notes = await cc.aztec.loadPrivate(
          currentWallet.getAddress(),
          tokenAddress,
          TokenContract.storage.pending_shields.slot,
        );

        console.log(`Found ${notes.length} notes for token at ${tokenAddress.toString()}`);

        console.log(`Found ${unencryptedEvents.length} unencrypted events for token at ${tokenAddress.toString()}`);

        const token = await this.tokenService.getTokenByAddress(tokenAddress);

        const unencryptedTransactions = unencryptedEvents.map(event => ({
          type: event.from.equals(currentWallet.getAddress()) ? 'send' : 'receive',
          amount: event.amount.toString(),
          token: token ? token.symbol : 'Unknown',
          status: 'completed',
          timestamp: Date.now(), // You might want to use a more accurate timestamp if available
          from: event.from.toString(),
          to: event.to.toString(),
          encrypted: false
        }));

        this.transactions.push(...unencryptedTransactions);
      } catch (error) {
        console.error(`Error fetching unencrypted transactions for token at ${tokenAddress.toString()}:`, error);
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