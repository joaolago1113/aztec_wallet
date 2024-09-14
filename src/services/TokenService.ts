import {  AccountWallet, Fr, AztecAddress, ContractFunctionInteraction, computeSecretHash, Note, ExtendedNote, TxHash, SignerlessWallet } from "@aztec/aztec.js";
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js';
import { PXE } from '@aztec/circuit-types';
import { KeystoreFactory } from '../factories/KeystoreFactory.js';
import { UIManager } from '../ui/UIManager.js';
import { AccountService } from '../services/AccountService.js';
import { CheatCodes } from '@aztec/aztec.js';
import { CONFIG } from '../config.js';


export class TokenService {
  private tokensSetup: boolean = false;
  private currentWallet: AccountWallet | null = null;
  private tokens: { name: string; symbol: string }[] = [];
  private registeredContracts: Map<string, string> = new Map();
  private isUpdating: boolean = false;
  private updateTableDebounceTimer: NodeJS.Timeout | null = null;
  private pendingShields: { [key: string]: Fr[] } = {};
  private cc: CheatCodes | null = null;
  private ccInitialized: Promise<void> | null = null;

  constructor(
    private pxe: PXE,
    private uiManager: UIManager,
    private accountService: AccountService
  ) {
    this.loadTokensFromLocalStorage();
    this.ensureUniqueTokens();
    
    this.verifyPXEConnection();
    this.loadPendingShieldsFromLocalStorage();

    this.ccInitialized = this.initializeCheatCodes();
  }

  private async initializeCheatCodes(): Promise<void> {
    try {
      this.cc = await CheatCodes.create(CONFIG.l1RpcUrl, this.pxe);
      console.log('CheatCodes initialized successfully');
    } catch (error) {
      console.error('Error initializing CheatCodes:', error);
      throw error;
    }
  }

  private async ensureCheatCodesInitialized(): Promise<void> {
    if (this.ccInitialized) {
      await this.ccInitialized;
    } else {
      throw new Error('CheatCodes not initialized');
    }
  }

  private async verifyPXEConnection() {
    try {
      const nodeInfo = await this.pxe.getNodeInfo();
      console.log('Connected to Aztec node:', nodeInfo);
    } catch (error) {
      console.error('Error connecting to Aztec node:', error);
    }
  }

  private saveTokensToLocalStorage() {

     console.log("Saving tokens to localStorage:", this.tokens);


    localStorage.setItem('tokens', JSON.stringify(this.tokens));
    localStorage.setItem('registeredContracts', JSON.stringify(Array.from(this.registeredContracts.entries())));
  }

  private loadTokensFromLocalStorage() {
    try {
      const storedTokens = localStorage.getItem('tokens');
      if (storedTokens) {
        this.tokens = JSON.parse(storedTokens).filter((token: { name?: string; symbol: string }) => !!token.name);
      }
      
      const storedContracts = localStorage.getItem('registeredContracts');
      if (storedContracts) {
        const parsedContracts = JSON.parse(storedContracts);
        this.registeredContracts = new Map(parsedContracts);
      }
    } catch (error) {
      console.error('Error loading tokens from localStorage:', error);
      // Reset tokens and registeredContracts if there's an error
      this.tokens = [];
      this.registeredContracts = new Map();
    }
  }

  private addToken(token: { name: string; symbol: string }) {
    if (!token.name) {
      throw new Error("Token name is required");
    }
    const existingTokenIndex = this.tokens.findIndex(t => t.symbol === token.symbol);
    if (existingTokenIndex === -1) {
      this.tokens.push(token);
    } else {
      // Update the existing token if needed
      this.tokens[existingTokenIndex] = token;
    }
    this.saveTokensToLocalStorage();
  }

  private ensureUniqueTokens() {
    const uniqueTokens = Array.from(
      new Map(this.tokens.map(token => [`${token.name}-${token.symbol}`, token])).values()
    );
    if (uniqueTokens.length !== this.tokens.length) {
      this.tokens = uniqueTokens;
      this.saveTokensToLocalStorage();
    }
  }

  async setupToken(wallet: AccountWallet, token: {name: string, symbol: string}): Promise<{ contract: TokenContract, address: AztecAddress }> {
    console.log('Checking account state...');
    const accountAddress = wallet.getAddress();
    console.log('Account address:', accountAddress.toString());
    
    if (!token.name) {
      throw new Error("Token name is required");
    }
    const key = `${token.name}-${token.symbol}`;
    if (this.registeredContracts.has(key)) {
      const address = AztecAddress.fromString(this.registeredContracts.get(key)!);
      const contract = await TokenContract.at(address, wallet);
      return { contract, address };
    }

    // If the contract doesn't exist, deploy a new one
    console.log(`Deploying new token contract for ${token.name} (${token.symbol})`);
    console.log('Wallet address:', wallet.getAddress().toString());

    try {
      console.log('Creating deploy object...');
      const deploy = TokenContract.deploy(wallet, wallet.getAddress(), token.name, token.symbol, 18);
      console.log('Deploy object created successfully');

    
      console.log('Creating deploy options...');
      const deployOpts = { contractAddressSalt: new Fr(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))), universalDeploy: true };
      console.log('Deploy options created:', deployOpts);

      console.log('Getting instance address...');
      const address = deploy.getInstance(deployOpts).address;
      console.log(`Instance address: ${address.toString()}`);

      let contract: TokenContract;

      if (await this.pxe.isContractPubliclyDeployed(address)) {
        console.log(`Token contract at ${address.toString()} already deployed`);
        await this.registerContract(wallet, address);
        contract = await TokenContract.at(address, wallet);
      } else {
        console.log(`Deploying token contract at ${address.toString()}`);
        const tx = await deploy.send(deployOpts);
        console.log('Deploy transaction sent. Transaction hash:', await tx.getTxHash());
        console.log('Waiting for transaction to be mined...');
        contract = await tx.deployed({ timeout: 120 });
        console.log(`Token contract successfully deployed at ${address.toString()}`);
        
        // Register the contract after deployment
        await this.registerContract(wallet, address);
      }

      this.registeredContracts.set(key, address.toString());
      this.addToken(token);
      this.saveTokensToLocalStorage();

      return { contract, address };
    } catch (error) {
      console.error(`Error deploying contract for ${token.name} (${token.symbol}):`, error);
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      if (typeof error === 'object' && error !== null) {
        console.error('Error details:', JSON.stringify(error, null, 2));
      }
      if (error instanceof Error && 'response' in error) {
        console.error('Error response:', (error as any).response);
      }
      throw error;
    }
  }

  async updateTable() {
    if (this.updateTableDebounceTimer) {
      clearTimeout(this.updateTableDebounceTimer);
    }

    this.updateTableDebounceTimer = setTimeout(async () => {
      console.log("Entering updateTable method");
      if (this.isUpdating) {
        console.log("Update already in progress, skipping");
        return;
      }

      if (!this.currentWallet) {
        console.warn("No wallet set. Please call setupTokens first.");
        return;
      }

      // Check if we're on the Tokens page
      if (!document.getElementById('tokensTableBody')) {
        console.debug("Not on Tokens page, skipping table update.");
        return;
      }

      this.isUpdating = true;
      // Show loading spinner
      this.uiManager.showLoadingSpinner();

      try {
        this.ensureUniqueTokens(); // Add this line to ensure unique tokens before processing
        console.log("Processing tokens:", this.tokens);
        const tokenRows = await Promise.all(this.tokens.map(async (token) => {
          try {
            console.log(`Processing token: ${token.name} (${token.symbol})`);
            const tokenAddress = await this.getTokenAddress(token);
            console.log(`Token address: ${tokenAddress.toString()}`);
            const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet!);

            let privateBalance: bigint = BigInt(0);
            let publicBalance: bigint = BigInt(0);
            
            console.log("address", this.currentWallet!.getAddress().toString());

            const addressWallet = this.currentWallet!.getAddress();

            let callPrivateBalance: ContractFunctionInteraction = await tokenContract.methods.balance_of_private(addressWallet);

            let ownerPublicBalanceSlot: Fr;

            await this.ensureCheatCodesInitialized();

            ownerPublicBalanceSlot = this.cc!.aztec.computeSlotInMap(TokenContract.storage.public_balances.slot,	 addressWallet.toBigInt());

            publicBalance = (await this.pxe.getPublicStorageAt(tokenAddress, ownerPublicBalanceSlot)).toBigInt();

            try {
              console.log("simulating private balance");
              privateBalance = await callPrivateBalance.simulate();
            } catch (error) {
              console.error(`Error simulating public balance for ${token.symbol}:`, error);
              // Keep the default value of 0
            }
            
            // Convert to float and format
            const privateBalanceFloat = Number(privateBalance) / 1e9;
            const publicBalanceFloat = Number(publicBalance) / 1e9;

            console.log(`Balances for ${token.symbol}: Private=${privateBalanceFloat}, Public=${publicBalanceFloat}`);
            return {
              name: token.name,
              symbol: token.symbol,
              balance: {
                private: this.formatBalance(privateBalanceFloat),
                public: this.formatBalance(publicBalanceFloat)
              }
            };
          } catch (error) {
            console.error(`Error processing token ${token.symbol}:`, error);
            return null;
          }
        }));

        const validTokenRows = tokenRows.filter((row): row is NonNullable<typeof row> => row !== null);
        console.log("Valid token rows:", validTokenRows);
        this.uiManager.updateTokensTable(validTokenRows);
        this.saveTokensToLocalStorage();
      } catch (error) {
        console.error('Error updating token table:', error);
      } finally {
        // Hide loading spinner
        this.uiManager.hideLoadingSpinner();
        this.isUpdating = false;
      }
      console.log("Exiting updateTable method");
    }, 300); // Adjust the delay as needed
  }

  private formatBalance(balance: number): string {
    if (Number.isInteger(balance)) {
      return balance.toString();
    } else {
      // Display up to 9 decimal places, but remove trailing zeros
      return balance.toFixed(9).replace(/\.?0+$/, '');
    }
  }

  // Add this new method
  async updateBalancesForNewAccount(wallet: AccountWallet) {
    this.currentWallet = wallet;
    await this.updateTable();
  }

  public async getTokenAddress(token: {name: string, symbol: string}): Promise<AztecAddress> {
    if (!token.name) {
      throw new Error("Token name is required");
    }
    const key = `${token.name}-${token.symbol}`;
    if (this.registeredContracts.has(key)) {
      const addressString = this.registeredContracts.get(key)!;
      try {
        return AztecAddress.fromString(addressString);
      } catch (error) {
        console.error(`Failed to parse existing contract address. Key: ${key}, Address: ${addressString}`);
        throw error;
      }
    }

    throw new Error(`Token contract not found for ${token.name} (${token.symbol}). Please deploy the token first.`);
  }
  private async ensureContractRegistered(wallet: AccountWallet, address: AztecAddress) {
    try {
      await TokenContract.at(address, wallet);
    } catch (error) {
      console.log(`Contract at ${address.toString()} not registered, attempting to register...`);
      await this.registerContract(wallet, address);
    }
  }

  private async registerContract(wallet: AccountWallet, address: AztecAddress) {
    try {
      const contractInstance = await TokenContract.at(address, wallet);

      await this.pxe.registerContract({
        instance: contractInstance.instance, 
        artifact: contractInstance.artifact 
      });

      console.log(`Successfully registered contract at ${address.toString()}`);
    } catch (error) {
      console.error(`Failed to register contract at ${address.toString()}:`, error);
      throw error;
    }
  }

  async getBalances(address: AztecAddress): Promise<{ [symbol: string]: { privateBalance: bigint; publicBalance: bigint } }> {
    if (!this.currentWallet) {
      throw new Error("No wallet set. Please call setupTokens first.");
    }

    const balances: { [symbol: string]: { privateBalance: bigint; publicBalance: bigint } } = {};
    for (const token of this.tokens) {
      const tokenAddress = await this.getTokenAddress(token);
      const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);
      const privateBalance = await tokenContract.methods.balance_of_private(address).simulate();



      await this.ensureCheatCodesInitialized();

      const addressWallet = this.currentWallet!.getAddress();

      let ownerPublicBalanceSlot: Fr = this.cc!.aztec.computeSlotInMap(TokenContract.storage.public_balances.slot, addressWallet);

      const publicBalance = (await this.pxe.getPublicStorageAt(tokenAddress, ownerPublicBalanceSlot)).toBigInt();

      balances[token.symbol] = { privateBalance, publicBalance };
    }

    return balances;
  }

  async createToken(tokenData: { name: string; symbol: string; amount: string }) {
    if (!this.currentWallet) {
      throw new Error("No wallet available. Please create an account first.");
    }
    // Check if amount is a valid number
    const parsedAmount = Number(tokenData.amount);
    if (isNaN(parsedAmount)) {
      throw new Error("Invalid amount. Please provide a valid number.");
    }

    try {
      const { contract, address } = await this.setupToken(this.currentWallet, tokenData);
      const mintAmount = new Fr(BigInt(parsedAmount * 1e9));
      await contract.methods.privately_mint_private_note(mintAmount).send().wait();
      console.log(`Created and minted ${tokenData.amount} ${tokenData.symbol} tokens`);
      await this.updateTable();
    } catch (error) {
      console.error('Error creating token:', error);
      throw error;
    }
  }

  async mintToken(tokenAddress: string, amount: string) {
    if (!this.currentWallet) {
      throw new Error("No wallet available. Please create an account first.");
    }
    // Check if amount is a valid number
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount)) {
      throw new Error("Invalid amount. Please provide a valid number.");
    }

    try {
      const address = AztecAddress.fromString(tokenAddress);
      const contract = await TokenContract.at(address, this.currentWallet);
      const mintAmount = new Fr(BigInt(parsedAmount * 1e9));
      await contract.methods.privately_mint_private_note(mintAmount).send().wait();
      console.log(`Minted ${amount} tokens for contract at ${tokenAddress}`);
      await this.updateTable();
    } catch (error) {
      console.error('Error minting tokens:', error);
      throw error;
    }
  }

  showCreateMintTokenUI() {
    this.uiManager.showCreateMintTokenPopup();
  }

  async shieldToken(token: { name: string; symbol: string }, amount: string) {
    if (!this.currentWallet) {
      throw new Error("No wallet set. Please call setupTokens first.");
    }

    const tokenAddress = await this.getTokenAddress(token);
    const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);

    // Convert the amount to a number, multiply by 1e9, then convert to BigInt
    const shieldAmount = new Fr(BigInt(Math.round(parseFloat(amount) * 1e9)));

    try {
      const index = await this.getNextNonce(tokenAddress);
      const shieldSecret = await this.deriveShieldSecret(index);
      const shieldSecretHash = computeSecretHash(shieldSecret);

      const tx = await tokenContract.methods
        .shield(this.currentWallet.getAddress(), shieldAmount, shieldSecretHash, 0)
        .send({})
        .wait();

      console.log(`Shielded ${amount} ${token.symbol} tokens. Transaction hash: ${tx.txHash}`);

      await this.addPendingShieldNoteToPXE(shieldAmount, shieldSecretHash, tx.txHash, tokenAddress, index);

      await this.updatePendingShieldsList();
      await this.updateTable();
    } catch (error) {
      console.error('Error shielding tokens:', error);
      throw error;
    }
  }

  private async getNextNonce(tokenAddress: AztecAddress): Promise<number> {
    const pendingShields = await this.getPendingShields(tokenAddress);
    return pendingShields.length;
  }

  private async deriveShieldSecret(index: number): Promise<Fr> {

    const currentWallet = await this.accountService.getCurrentWallet();
    const privateKey = await this.accountService.getPrivateKey(currentWallet!.getAddress().toString());
    return computeSecretHash(new Fr(privateKey.toBigInt() + BigInt(index)));
  }

  private async addPendingShieldNoteToPXE(amount: Fr, secretHash: Fr, txHash: TxHash, tokenAddress: AztecAddress, nonce: number) {
    const note = new Note([amount, secretHash, new Fr(nonce)]);
    const extendedNote = new ExtendedNote(
      note,
      this.currentWallet!.getAddress(),
      tokenAddress,
      TokenContract.storage.pending_shields.slot,
      TokenContract.notes.TransparentNote.id,
      txHash
    );
    await this.currentWallet!.addNote(extendedNote);
  }

  async updatePendingShieldsList() {
    const tokens = this.getTokens();
    const pendingShieldsData = await Promise.all(tokens.map(async (token) => {
      const tokenAddress = await this.getTokenAddress(token);
      const pendingShieldNotes = await this.getPendingShields(tokenAddress);
      return { 
        token, 
        pendingShieldNotes: pendingShieldNotes.map(note => ({
          items: note.items,
          formattedAmount: this.formatAmount(note.items[0].toBigInt())
        }))
      };
    }));

    const filteredPendingShieldsData = pendingShieldsData.filter(data => data.pendingShieldNotes.length > 0);

    this.uiManager.updatePendingShieldsList(filteredPendingShieldsData);
  }

  formatAmount(amount: bigint): string {
    const amountFloat = Number(amount) / 1e9;
    return amountFloat.toFixed(9).replace(/\.?0+$/, '');
  }

  async redeemShield(token: { name: string; symbol: string }, noteIndex: number) {
    if (!this.currentWallet) {
      throw new Error("No wallet set. Please call setupTokens first.");
    }


    const tokenAddress = await this.getTokenAddress(token);
    const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);

    const pendingShieldNotes = await this.getPendingShields(tokenAddress);
    const note = pendingShieldNotes[noteIndex];

    if (!note) {
      throw new Error(`No pending shield note found at index ${noteIndex}`);
    }

    const index = noteIndex;
    const derivedSecret = await this.deriveShieldSecret(Number(index));
    const derivedSecretHash = computeSecretHash(derivedSecret);

    if (!derivedSecretHash.equals(note.items[1])) {
      throw new Error("Derived secret does not match the note's secret hash");
    }

    const shieldAmount = note.items[0];

    try {
      console.log(`Redeeming shield: ${shieldAmount.toString()} ${token.name} (${token.symbol})`);

      const redeemTx = await tokenContract.methods
        .redeem_shield(this.currentWallet.getAddress(), shieldAmount, derivedSecret)
        .send()
        .wait();

      console.log(`Redeemed ${shieldAmount.toBigInt()} ${token.name} (${token.symbol}) tokens. Transaction hash: ${redeemTx.txHash}`);

      await this.updatePendingShieldsList();

      await this.updateTable();
    } catch (error) {
      console.error('Error redeeming shield:', error);
      throw error;
    }
  }

  async getPendingShields(tokenAddress: AztecAddress): Promise<Note[]> {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      throw new Error("No wallet available. Please create an account first.");
    }

    await this.ensureCheatCodesInitialized();
    if (this.cc) {
      const notes = await this.cc.aztec.loadPrivate(
        currentWallet.getAddress(),
        tokenAddress,
        TokenContract.storage.pending_shields.slot,
      );

      return notes;
    } else {
      throw new Error('CheatCodes not initialized');
    }
  }

  async unshieldToken(token: { name: string; symbol: string }, amount: string) {
    if (!this.currentWallet) {
      throw new Error("No wallet set. Please call setupTokens first.");
    }

    const tokenAddress = await this.getTokenAddress(token);
    const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);
    const unshieldAmount = new Fr(BigInt(amount) * BigInt(1e9));

    try {

      // Perform the unshield transaction
      const tx = await tokenContract.methods
        .unshield(this.currentWallet.getAddress(), this.currentWallet.getAddress(), unshieldAmount, 0)
        .send({});

      console.log(`Unshielding ${amount} ${token.symbol} tokens. Transaction hash: ${await tx.getTxHash()}`);
      const receipt = await tx.wait();
      console.log(`Unshielded ${amount} ${token.symbol} tokens. Transaction receipt:`, receipt);

      // Update the tokens table after unshielding
      await this.updateTable();
    } catch (error) {
      console.error('Error unshielding tokens:', error);
      throw error;
    }
  }

  async sendToken(token: { name: string; symbol: string }, recipient: string, amount: string, isPrivate: boolean) {
    if (!this.currentWallet) {
      throw new Error("No wallet available. Please create an account first.");
    }

    const tokenAddress = await this.getTokenAddress(token);
    const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);

    const scaledAmount = BigInt(Math.round(parseFloat(amount) * 1e9));

    let tx;
    if (isPrivate) {
      tx = await tokenContract.methods.transfer(AztecAddress.fromString(recipient), scaledAmount).send();
    } else {
      tx = await tokenContract.methods.transfer_public(this.currentWallet.getAddress(), AztecAddress.fromString(recipient), scaledAmount, 0).send();
    }

    await tx.wait();
    console.log(`Successfully sent ${amount} ${token.symbol} to ${recipient}`);
    await this.updateTable();
  }

  async getReceiveAddress(): Promise<string> {
    if (!this.currentWallet) {
      throw new Error("No wallet available. Please create an account first.");
    }

    return this.currentWallet.getAddress().toString();
  }

  resetTokens() {
    this.tokens = [];
    this.currentWallet = null;
    this.registeredContracts.clear();
    localStorage.removeItem('tokens');
    localStorage.removeItem('registeredContracts');
  }

  public getTokens(): { name: string; symbol: string }[] {
    return this.tokens;
  }

  async depositTokens(token: { name: string; symbol: string }, amount: string, isPrivate: boolean) {
    // Implement the logic for depositing tokens from Ethereum to Aztec
    // Use the `isPrivate` parameter to determine the claiming mode (private or public)
    // Interact with the Ethereum and Aztec bridge contracts to perform the deposit
    // ...
  }

  async withdrawTokens(token: { name: string; symbol: string }, amount: string, isPrivate: boolean) {
    // Implement the logic for withdrawing tokens from Aztec to Ethereum
    // Use the `isPrivate` parameter to determine the claiming mode (private or public)
    // Interact with the Ethereum and Aztec bridge contracts to perform the withdrawal
    // ...
  }

  async getNameSymbolByAddress(address: AztecAddress) {
    const tokens = await this.getTokens();
    for (const token of tokens) {
      const tokenAddress = await this.getTokenAddress(token);
      if (tokenAddress.equals(address)) {
        return token;
      }
    }
    return undefined;
  }

  private loadPendingShieldsFromLocalStorage() {
    const storedPendingShields = localStorage.getItem('pendingShields');
    if (storedPendingShields) {
      this.pendingShields = JSON.parse(storedPendingShields);
    }
  }

  async getStoredPendingShields(tokenAddress: AztecAddress): Promise<Fr[]> {
    const tokenAddressString = tokenAddress.toString();
    return this.pendingShields[tokenAddressString] || [];
  }

  private tokenNameSymboltoString(value: bigint) {
    const vals: number[] = Array.from(new Fr(value).toBuffer());
  
    let str = '';
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] != 0) {
        str += String.fromCharCode(Number(vals[i]));
      }
    }
    return str;
  };

  async importExistingToken(address: string) {
    if (!this.currentWallet) {
      throw new Error("No wallet set. Please call setupTokens first.");
    }

    try {
      const addressWallet = this.currentWallet!.getAddress();
      const tokenAddress = AztecAddress.fromString(address);
      const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);

      const keystore = KeystoreFactory.getKeystore();

      const is2FAEnabled = await keystore.isAccount2FA(addressWallet);


      let simluatedName: Fr;
      let simluatedSymbol: Fr;

      if (is2FAEnabled) {
        const nameSlot = this.cc!.aztec.computeSlotInMap(TokenContract.storage.name.slot, addressWallet);
        simluatedName = (await this.cc!.aztec.loadPublic(tokenAddress, nameSlot));
        const symbolSlot = this.cc!.aztec.computeSlotInMap(TokenContract.storage.symbol.slot, addressWallet);
        simluatedSymbol = (await this.cc!.aztec.loadPublic(tokenAddress, symbolSlot));

      }else{

        simluatedName = (await tokenContract.methods.public_get_name().simulate()).value;
        simluatedSymbol = (await tokenContract.methods.public_get_symbol().simulate()).value;
      }


      //let name = this.tokenNameSymboltoString(simluatedName.toBigInt());
      //let symbol = this.tokenNameSymboltoString(simluatedSymbol.toBigInt());
      let name = 'NA';
      let symbol = 'NA';

      console.log("Importing token:", name, symbol, address);

      // Add the token to our list
      this.addToken({ name, symbol });
      this.registeredContracts.set(`${name}-${symbol}`, address);
      this.saveTokensToLocalStorage();

      console.log(`Imported existing token contract for ${name} (${symbol}) at address ${address}`);
      
      // Update the main token table
      await this.updateTable();
      
      // Update the Pending Shields UI
      await this.updatePendingShieldsList();

    } catch (error) {
      console.error('Error importing existing token contract:', error);
      throw error;
    }
  }

  async getTokenBySymbol(symbol: string) {
    const tokens = this.getTokens();
    return tokens.find(token => token.symbol === symbol);
  }

}


