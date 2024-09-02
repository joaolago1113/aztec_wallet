import { AccountWallet, Fr, AztecAddress, PrivateFeePaymentMethod, computeSecretHash, Note, ExtendedNote, TxHash } from "@aztec/aztec.js";
import { TokenContract } from '@aztec/noir-contracts.js';
import { PXE } from '@aztec/circuit-types';
import { GasSettings } from '@aztec/circuits.js';
import { UIManager } from '../ui/UIManager.js';
import { AccountService } from '../services/AccountService.js';

export class TokenService {
  private tokensSetup: boolean = false;
  private currentWallet: AccountWallet | null = null;
  private tokens: { name: string; symbol: string }[] = [];
  private registeredContracts: Map<string, AztecAddress> = new Map();

  constructor(
    private pxe: PXE,
    private uiManager: UIManager,
    private accountService: AccountService
  ) {}

  async setupToken(wallet: AccountWallet, token: {name: string, symbol: string}): Promise<{ contract: TokenContract, address: AztecAddress }> {
    try {
      const deploy = TokenContract.deploy(wallet, wallet.getAddress(), token.name, token.symbol, 18);
      const deployOpts = { contractAddressSalt: new Fr(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))), universalDeploy: true };
      const address = deploy.getInstance(deployOpts).address;

      console.log(`Attempting to deploy token contract for ${token.name} (${token.symbol})`);
      console.log('Deployment options:', deployOpts);
      console.log('Deployer address:', wallet.getAddress().toString());

      let contract: TokenContract;

      if (await this.pxe.isContractPubliclyDeployed(address)) {
        console.log(`Token contract at ${address.toString()} already deployed`);
        await this.registerContract(wallet, address);
        contract = await TokenContract.at(address, wallet);
      } else {
        console.log(`Deploying token contract at ${address.toString()}`);
        contract = await deploy.send(deployOpts).deployed({ timeout: 120 });
        console.log(`Token contract successfully deployed at ${address.toString()}`);
        
        // Register the contract after deployment
        await this.registerContract(wallet, address);
      }

      // Check if the contract is initialized correctly
      try {
        const name = await contract.methods.public_get_name();
        const symbol = await contract.methods.public_get_symbol();
        console.log(`Deployed token name: ${name}, symbol: ${symbol}`);
      } catch (error) {
        console.error('Error checking deployed contract:', error);
      }
      
      const key = `${token.name}-${token.symbol}`;
      this.registeredContracts.set(key, address);
      return { contract, address };
    } catch (error) {
      console.error('Detailed error in setupToken:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      throw error;
    }
  }

  async updateTable() {
    if (!this.currentWallet) {
      console.error("No wallet set. Please call setupTokens first.");
      return;
    }

    // Show loading spinner
    this.uiManager.showLoadingSpinner();

    try {
      const tokenRows = await Promise.all(this.tokens.map(async (token) => {
        try {
          const tokenAddress = await this.getTokenAddress(this.currentWallet!, token);
          const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet!);
          const privateBalance = await tokenContract.methods.balance_of_private(this.currentWallet!.getAddress()).simulate();
          const publicBalance = await tokenContract.methods.balance_of_public(this.currentWallet!.getAddress()).simulate();

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
      this.uiManager.updateTokensTable(validTokenRows);
    } catch (error) {
      console.error('Error updating token table:', error);
      // Optionally, show an error message to the user
    }
  }

  // Add this new method
  async updateBalancesForNewAccount(wallet: AccountWallet) {
    this.currentWallet = wallet;
    await this.updateTable();
  }

  private async getTokenAddress(wallet: AccountWallet, token: {name: string, symbol: string}): Promise<AztecAddress> {
    const key = `${token.name}-${token.symbol}`;
    if (this.registeredContracts.has(key)) {
      return this.registeredContracts.get(key)!;
    }

    const deploy = TokenContract.deploy(wallet, wallet.getAddress(), token.name, token.symbol, 18);
    const deployOpts = { contractAddressSalt: new Fr(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))), universalDeploy: true };
    const address = deploy.getInstance(deployOpts).address;

    // Register the contract
    await this.registerContract(wallet, address);

    this.registeredContracts.set(key, address);
    return address;
  }

  async getBalances(address: AztecAddress): Promise<{ [symbol: string]: { privateBalance: bigint; publicBalance: bigint } }> {
    if (!this.currentWallet) {
      throw new Error("No wallet set. Please call setupTokens first.");
    }

    const balances: { [symbol: string]: { privateBalance: bigint; publicBalance: bigint } } = {};
    for (const token of this.tokens) {
      const tokenAddress = await this.getTokenAddress(this.currentWallet, token);
      const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);
      const privateBalance = await tokenContract.methods.balance_of_private(address).simulate();
      const publicBalance = await tokenContract.methods.balance_of_public(address).simulate();
      balances[token.symbol] = { privateBalance, publicBalance };
    }

    return balances;
  }

  // New method to handle token creation/minting
  async createOrMintToken(tokenData: { name: string; symbol: string; amount: string }) {
    try {
      const wallet = await this.accountService.getCurrentWallet();
      if (!wallet) {
        throw new Error("No wallet available. Please create an account first.");
      }
      this.currentWallet = wallet;

      console.log('Current wallet address:', this.currentWallet.getAddress().toString());

      const existingToken = this.tokens.find(t => t.symbol === tokenData.symbol);

      // Convert the amount to a BigInt to ensure precise integer representation
      const mintAmountBigInt = BigInt(tokenData.amount);
      console.log(`Attempting to mint ${mintAmountBigInt.toString()} ${tokenData.symbol} tokens`);

      // Create Fr value correctly from BigInt input
      const mintAmount = new Fr(mintAmountBigInt);
      console.log('Mint amount as Fr:', mintAmount.toString());

      if (existingToken) {
        // Mint existing token
        const tokenAddress = await this.getTokenAddress(this.currentWallet, existingToken);
        const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);
        console.log(`Minting ${mintAmountBigInt.toString()} ${existingToken.symbol} tokens`);
        await tokenContract.methods.privately_mint_private_note(mintAmount).send().wait();
        console.log(`Minted ${mintAmountBigInt.toString()} ${existingToken.symbol} tokens`);
      } else {
        // Create new token
        console.log(`Creating new token: ${tokenData.name} (${tokenData.symbol})`);
        const { contract: newToken, address: tokenAddress } = await this.setupToken(this.currentWallet, tokenData);
        this.tokens.push({ name: tokenData.name, symbol: tokenData.symbol });
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
            console.error('Error stack:', mintError.stack);
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
        console.error('Error stack:', error.stack);
      }
      throw error;
    }
  }

  showCreateMintTokenUI() {
    this.uiManager.showCreateMintTokenPopup();
  }

  private async registerContract(wallet: AccountWallet, address: AztecAddress): Promise<void> {
    try {
      await TokenContract.at(address, wallet);
      console.log(`Contract at ${address.toString()} registered successfully`);
    } catch (error) {
      console.error(`Failed to register contract at ${address.toString()}:`, error);
      throw error;
    }
  }

  async shieldToken(token: { name: string; symbol: string }, amount: string) {
    if (!this.currentWallet) {
      throw new Error("No wallet set. Please call setupTokens first.");
    }

    const tokenAddress = await this.getTokenAddress(this.currentWallet, token);
    const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);
    const shieldAmount = new Fr(BigInt(amount));
    const shieldSecret = new Fr(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));
    const shieldSecretHash = computeSecretHash(shieldSecret);
    const nonce = new Fr(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));

    const refundSecret = new Fr(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));

    try {
      // Step 1: Shield the tokens
      const tx = await tokenContract.methods
        .shield(this.currentWallet.getAddress(), shieldAmount, shieldSecretHash, 0)
        .send({
//          fee: {
//            gasSettings: GasSettings.default(),
//            paymentMethod: new PrivateFeePaymentMethod(tokenAddress, tokenAddress, this.currentWallet, refundSecret),
//          },
        })
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

    const tokenAddress = await this.getTokenAddress(this.currentWallet, token);
    const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);
    const unshieldAmount = new Fr(BigInt(amount));
    //const nonce = new Fr(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));
    //const refundSecret = new Fr(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));

    try {
      // Create an auth witness for the unshield action
     
      /*
       await this.currentWallet.createAuthWit({
        caller: tokenContract.address,
        action: tokenContract.methods.unshield(
          this.currentWallet.getAddress(),
          this.currentWallet.getAddress(),
          unshieldAmount,
          nonce
        ),
      });
      */

      // Perform the unshield transaction
      const tx = await tokenContract.methods
        .unshield(this.currentWallet.getAddress(), this.currentWallet.getAddress(), unshieldAmount, 0)
        .send({
        //  fee: {
        //     gasSettings: GasSettings.default(),
        //     paymentMethod: new PrivateFeePaymentMethod(tokenAddress, tokenAddress, this.currentWallet, refundSecret),
        //  },
        });

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
}