import { Fr, AccountManager, AccountWalletWithSecretKey } from "@aztec/aztec.js";
import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
import { computePartialAddress, deriveSigningKey, deriveKeys, CompleteAddress } from '@aztec/circuits.js';
import { PXE } from '@aztec/circuit-types';
import { KeyStore } from '../utils/Keystore.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';
import { UIManager } from '../ui/UIManager.js';

export class AccountService {
  private currentAccountIndex: number | null = null;

  constructor(private pxe: PXE, private keystore: KeyStore, private uiManager: UIManager) {}

  async createAccount(secretKey: Fr) {
    const account: AccountManager = await this.getAccount(secretKey);
    const wallet: AccountWalletWithSecretKey = await this.getWallet(account);

    const accountInKeystore = await this.isAccountInKeystore(wallet);

    if (accountInKeystore) {
      throw new Error('Account already exists in the keystore.');
    } else {
      await this.addAccountToKeystore(account, secretKey);
      const accounts = await this.keystore.getAccounts();
      this.currentAccountIndex = accounts.length - 1;  // Set the current index to the newly created account
    }
  }

  async getSkKeysAtIndex() {
    const accounts = await this.keystore.getAccounts();

    if (this.currentAccountIndex === null) {
      this.currentAccountIndex = 0;
    }

    const accountAddress = accounts[this.currentAccountIndex];

    // Get the public keys
    const incomingViewingPublicKey = await this.keystore.getMasterIncomingViewingPublicKey(accountAddress);
    const outgoingViewingPublicKey = await this.keystore.getMasterOutgoingViewingPublicKey(accountAddress);
    const taggingPublicKey = await this.keystore.getMasterTaggingPublicKey(accountAddress);

    // Get the corresponding secret keys
    const incomingViewingSecretKey = await this.keystore.getMasterSecretKey(incomingViewingPublicKey);
    const outgoingViewingSecretKey = await this.keystore.getMasterSecretKey(outgoingViewingPublicKey);
    const taggingSecretKey = await this.keystore.getMasterSecretKey(taggingPublicKey);

    const secretKey = await this.keystore.getSecretKey(accountAddress);

    const address = accountAddress.toString()

    return { incomingViewingSecretKey, outgoingViewingSecretKey, taggingSecretKey, secretKey, address};
  }

  async getCurrentWallet(): Promise<AccountWalletWithSecretKey | null> {
    if (this.currentAccountIndex === null) {
      return null;
    }

    const accounts = await this.keystore.getAccounts();
    const accountAddress = accounts[this.currentAccountIndex];
    const secretKey = await this.keystore.getSecretKey(accountAddress);

    const account = await this.getAccount(secretKey);
    return this.getWallet(account);
  }


  async retrieveContractAddress(index?: number): Promise<CompleteAddress | null> {
    const accounts = await this.keystore.getAccounts();

    if (this.currentAccountIndex === null) {
      return Promise.resolve(null);
    }

    index = index || this.currentAccountIndex;

    const contractAddress = accounts[this.currentAccountIndex];

    const secretKey = await this.keystore.getSecretKey(contractAddress);

    const { publicKeys } = deriveKeys(secretKey);
    
    const privateKey = deriveSigningKey(secretKey);

    const accountContract = new EcdsaKAccountContract(privateKey.toBuffer());

    const account = new AccountManager(this.pxe, secretKey, accountContract, Fr.ONE);

    account.getAccount()

    const partialAddress = computePartialAddress(account.getInstance());

    return Promise.resolve(new CompleteAddress(contractAddress, publicKeys, partialAddress));
  }

  private async getAccount(secretKey: Fr): Promise<AccountManager> {
    const privateKey = CryptoUtils.deriveSigningKey(secretKey);
    const accountContract = new EcdsaKAccountContract(privateKey.toBuffer());
    return new AccountManager(this.pxe, secretKey, accountContract, Fr.ONE);
  }

  private async getWallet(account: AccountManager): Promise<AccountWalletWithSecretKey> {
    const isInit = await this.checkContractInitialization(account);
    return isInit ? await account.register() : await account.waitSetup();
  }

  private async checkContractInitialization(account: AccountManager): Promise<boolean> {
    return this.pxe.isContractInitialized(account.getAddress());
  }

  private async isAccountInKeystore(wallet: AccountWalletWithSecretKey): Promise<boolean> {
    const accountAddress = wallet.getCompleteAddress().address;
    const accounts = await this.keystore.getAccounts();
    return accounts.some(account => account.toString() === accountAddress.toString());
  }

  private async addAccountToKeystore(account: AccountManager, secretKey: Fr) {
    const partialAddress = computePartialAddress(account.getInstance());
    await this.keystore.addAccount(secretKey, partialAddress);
  }

  async getSecretKeyKeystore(index: number = this.currentAccountIndex ?? 0): Promise<Fr> {
    const accounts = await this.keystore.getAccounts();
    const accountAddress = accounts[index];
  
    return await this.keystore.getSecretKey(accountAddress);
  }

  async getAccounts(): Promise<Fr[]> {
    return await this.keystore.getAccounts();
  }

  getCurrentAccountIndex(): number | null {
    return this.currentAccountIndex;
  }

  async setCurrentAccountIndex(index: number) {
    this.currentAccountIndex = index;
    // If you need to perform any asynchronous operations when changing the account, do them here
  }

}