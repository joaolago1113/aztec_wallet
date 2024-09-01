import { AccountWallet, Fr, AztecAddress } from "@aztec/aztec.js";
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { PXE } from '@aztec/circuit-types';
import { UIManager } from '../ui/UIManager.js';

export class TokenService {
  private tokensSetup: boolean = false;
  private currentWallet: AccountWallet | null = null;
  private tokens: { name: string; symbol: string }[] = [
    { name: 'Bitcoin', symbol: 'BTC' },
    { name: 'Ethereum', symbol: 'ETH' },
    { name: 'USD Coin', symbol: 'USDC' }
  ];

  constructor(private pxe: PXE, private uiManager: UIManager) {}

  async setupToken(wallet: AccountWallet, token: {name: string, symbol: string}): Promise<TokenContract> {
    const deploy = TokenContract.deploy(wallet, wallet.getAddress(), token.name, token.symbol, 18);
    const deployOpts = { contractAddressSalt: Fr.ONE, universalDeploy: true };
    const address = deploy.getInstance(deployOpts).address;

    if (await this.pxe.isContractPubliclyDeployed(address)) {
      console.log(`Token at ${address.toString()} already deployed`);
      return deploy.register();
    } else {
      console.log(`Deploying token contract at ${address.toString()}`);
      return deploy.send(deployOpts).deployed();
    }
  }

  async setupTokens(wallet: AccountWallet) {
    if (this.tokensSetup) {
      console.log("Tokens have already been set up. Skipping setup.");
      return;
    }

    for (const token of this.tokens) {
      await this.setupToken(wallet, token);
    }
    this.tokensSetup = true;
    this.currentWallet = wallet;
    this.updateTokensTable();
  }

  async updateTokensTable() {
    if (!this.currentWallet) {
      console.error("No wallet set. Please call setupTokens first.");
      return;
    }

    const tokenRows = await Promise.all(this.tokens.map(async (token) => {

      if (!this.currentWallet) {
        throw new Error("No wallet set. Please call setupTokens first.");
      }

      const tokenAddress = await this.getTokenAddress(this.currentWallet, token);
      const tokenContract = await TokenContract.at(tokenAddress, this.currentWallet);
      const balance = await tokenContract.methods.balance_of_private(this.currentWallet!.getAddress()).simulate();
      
      return {
        name: token.name,
        balance: balance.toString(),
        symbol: token.symbol
      };
    }));

    this.uiManager.updateTokensTable(tokenRows);
  }

  private async getTokenAddress(wallet: AccountWallet, token: {name: string, symbol: string}): Promise<AztecAddress> {
    const deploy = TokenContract.deploy(wallet, wallet.getAddress(), token.name, token.symbol, 18);
    const deployOpts = { contractAddressSalt: Fr.ONE, universalDeploy: true };
    return deploy.getInstance(deployOpts).address;
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
}