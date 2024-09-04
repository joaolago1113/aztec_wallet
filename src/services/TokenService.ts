import {  AccountWallet, Fr, AztecAddress, ContractFunctionInteraction, computeSecretHash, Note, ExtendedNote, TxHash } from "@aztec/aztec.js";
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js';
import { PXE } from '@aztec/circuit-types';
import { GasSettings } from '@aztec/circuits.js';
import { UIManager } from '../ui/UIManager.js';
import { AccountService } from '../services/AccountService.js';

export class TokenService {
  private tokensSetup: boolean = false;
  private currentWallet: AccountWallet | null = null;
  private tokens: { name: string; symbol: string }[] = [];
  private registeredContracts: Map<string, string> = new Map();
  private isUpdating: boolean = false;
  private updateTableDebounceTimer: NodeJS.Timeout | null = null;

  constructor(
    private pxe: PXE,
    private uiManager: UIManager,
    private accountService: AccountService
  ) {
    this.loadTokensFromLocalStorage();
    this.ensureUniqueTokens();
    
    this.verifyPXEConnection();
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
            
            let privateBalance, publicBalance;
            
            console.log("address", this.currentWallet!.getAddress().toString());

            let callPublicBalance: ContractFunctionInteraction = await tokenContract.methods.balance_of_public(this.currentWallet!.getAddress());;
            let callPrivateBalance: ContractFunctionInteraction = await tokenContract.methods.balance_of_private(this.currentWallet!.getAddress());;

            try {
              publicBalance = await callPublicBalance.simulate();
            } catch (error) {

              try {
                if(callPublicBalance) {
                  publicBalance = await callPublicBalance.send({ skipPublicSimulation: true }).wait({ dontThrowOnRevert: true });
                }
              } catch (error) {
                console.error(`Error fetching public balance for ${token.symbol}:`, error);
              }
              publicBalance = BigInt(0);
            }
            
            try {
              privateBalance = await callPrivateBalance.simulate();
            } catch (error) {

              try {
                if(callPrivateBalance) {
                  privateBalance = await callPrivateBalance.send({ skipPublicSimulation: true }).wait({ dontThrowOnRevert: true });
                }
              } catch (error) {
                console.error(`Error fetching public balance for ${token.symbol}:`, error);
              }
              privateBalance = BigInt(0);
            }

            console.log(`Balances for ${token.symbol}: Private=${privateBalance}, Public=${publicBalance}`);
            return {
              name: token.name,
              symbol: token.symbol,
              balance: {
                private: privateBalance.toString(),
                public: publicBalance.toString()
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
      const publicBalance = await tokenContract.methods.balance_of_public(address).simulate();
      balances[token.symbol] = { privateBalance, publicBalance };
    }

    return balances;
  }

  // New method to handle token creation/minting
  async createOrMintToken(tokenData: { name: string; symbol: string; amount: string }) {
    if (!tokenData.name) {
      throw new Error("Token name is required");
    }
    try {
      console.log('Creating or minting token:', tokenData);
      const wallet = await this.accountService.getCurrentWallet();
      if (!wallet) {
        throw new Error("No wallet available. Please create an account first.");
      }
      this.currentWallet = wallet;

      console.log('Current wallet address:', this.currentWallet.getAddress().toString());

      const existingToken = this.tokens.find(t => t.symbol === tokenData.symbol);
      console.log('Existing token:', existingToken);

      // Convert the amount to a BigInt to ensure precise integer representation
      const mintAmountBigInt = BigInt(tokenData.amount);
      console.log(`Attempting to mint ${mintAmountBigInt.toString()} ${tokenData.symbol} tokens`);

      // Create Fr value correctly from BigInt input
      const mintAmount = new Fr(mintAmountBigInt);
      console.log('Mint amount as Fr:', mintAmount.toString());

      if (existingToken) {
        // Mint existing token
        console.log(`Minting existing token: ${existingToken.name} (${existingToken.symbol})`);
        const tokenAddress = await this.getTokenAddress(existingToken);
        const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);
        console.log(`Minting ${mintAmountBigInt.toString()} ${existingToken.symbol} tokens`);
        await tokenContract.methods.privately_mint_private_note(mintAmount).send().wait();
        console.log(`Minted ${mintAmountBigInt.toString()} ${existingToken.symbol} tokens`);
      } else {
        // Create new token
        console.log(`Creating new token: ${tokenData.name} (${tokenData.symbol})`);
        const { contract: newToken, address: tokenAddress } = await this.setupToken(this.currentWallet, tokenData);
        this.addToken({ name: tokenData.name, symbol: tokenData.symbol });
        console.log(`Attempting to mint ${mintAmountBigInt.toString()} ${tokenData.symbol} tokens`);
        try {
          const tx = await newToken.methods.privately_mint_private_note(mintAmount).send();
          console.log('Mint transaction sent:', await tx.getTxHash());
          console.log('Waiting for transaction receipt...');
          const receipt = await tx.wait();
          console.log('Transaction receipt:', receipt);
          console.log(`Created and minted ${mintAmountBigInt.toString()} ${tokenData.symbol} tokens`);
          
          // Register the contract in the wallet's PXE
          await TokenContract.at(tokenAddress, this.currentWallet);
        } catch (mintError: unknown) {
          console.error('Detailed error minting tokens:', mintError);
          if (mintError instanceof Error) {
            console.error('Error name:', mintError.name);
            console.error('Error message:', mintError.message);
            console.error('Error stack:', mintError.stack);
          }
          if (typeof mintError === 'object' && mintError !== null) {
            console.error('Error details:', JSON.stringify(mintError, null, 2));
          }
          // Attempt to get more information about the contract state
          try {
            const balance = await newToken.methods.balance_of_private(this.currentWallet.getAddress()).simulate();
            console.log('Current balance after failed mint:', balance.toString());
          } catch (balanceError) {
            console.error('Error getting balance:', balanceError);
          }
          throw new Error(`Token created but minting failed: ${mintError instanceof Error ? mintError.message : 'Unknown error'}`);
        }
      }

      // Update the tokens table after creating/minting
      await this.updateTable();
    } catch (error) {
      console.error('Detailed error in createOrMintToken:', error);
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      if (typeof error === 'object' && error !== null) {
        console.error('Error details:', JSON.stringify(error, null, 2));
      }
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
    const shieldAmount = new Fr(BigInt(amount));
    const shieldSecret = new Fr(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));
    const shieldSecretHash = computeSecretHash(shieldSecret);

    try {
      // Step 1: Shield the tokens
      const tx = await tokenContract.methods
        .shield(this.currentWallet.getAddress(), shieldAmount, shieldSecretHash, 0)
        .send({})
        .wait();

      console.log(`Shielded ${amount} ${token.symbol} tokens. Transaction hash: ${tx.txHash}`);

      // Add the pending shield note to the PXE
      await this.addPendingShieldNoteToPXE(shieldAmount, shieldSecretHash, tx.txHash, tokenAddress);

      // Step 2: Redeem the shielded tokens
      const redeemTx = await tokenContract.methods
        .redeem_shield(this.currentWallet.getAddress(), shieldAmount, shieldSecret)
        .send()
        .wait();

      console.log(`Redeemed ${amount} ${token.symbol} tokens. Transaction hash: ${redeemTx.txHash}`);

      await this.updateTable();
    } catch (error) {
      console.error('Error shielding tokens:', error);
      throw error;
    }
  }

  private async addPendingShieldNoteToPXE(amount: Fr, secretHash: Fr, txHash: TxHash, tokenAddress: AztecAddress) {
    const note = new Note([amount, secretHash]);
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

  async unshieldToken(token: { name: string; symbol: string }, amount: string) {
    if (!this.currentWallet) {
      throw new Error("No wallet set. Please call setupTokens first.");
    }

    const tokenAddress = await this.getTokenAddress(token);
    const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);
    const unshieldAmount = new Fr(BigInt(amount));

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

    let tx;
    if (isPrivate) {
      tx = await tokenContract.methods.transfer(AztecAddress.fromString(recipient), BigInt(amount)).send();
    } else {
      tx = await tokenContract.methods.transfer_public(this.currentWallet.getAddress(), AztecAddress.fromString(recipient), BigInt(amount), 0).send();
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


}