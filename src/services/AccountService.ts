import { AuthWitnessProvider, AuthWitness, Fr, AccountManager, AccountWallet, NodeInfo, Schnorr } from "@aztec/aztec.js";
import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
import { computePartialAddress, deriveSigningKey, deriveKeys, CompleteAddress, AztecAddress } from '@aztec/circuits.js';
import { PXE } from '@aztec/circuit-types';
import { KeyStore } from '../utils/Keystore.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';
import { UIManager } from '../ui/UIManager.js';
import { TokenService } from './TokenService.js';
import { KeyRegistryContract } from '@aztec/noir-contracts.js';
import { getCanonicalKeyRegistryAddress } from '@aztec/protocol-contracts/key-registry';
import { DefaultAccountInterface } from '@aztec/accounts/defaults';
import { derivePublicKeyFromSecretKey } from '@aztec/circuits.js';
import { Fq, type GrumpkinScalar } from '@aztec/foundation/fields';

class MyAuthWitnessProvider implements AuthWitnessProvider {
  private privateKey: GrumpkinScalar;

  constructor(privateKey: GrumpkinScalar = Fq.random()) {
    this.privateKey = privateKey;
  }

  async createAuthWit(messageHash: Fr | Buffer): Promise<AuthWitness> {
    const signer = new Schnorr();
    const signature = signer.constructSignature(messageHash instanceof Buffer ? messageHash : messageHash.toBuffer(), this.privateKey);
    if(messageHash instanceof Buffer){
      messageHash = new Fr(messageHash);
    }
    return new AuthWitness(messageHash, [...signature.toBuffer()]);
  }
}

export class AccountService {
  private currentAccountIndex: number | null = null;
  private tokenService: TokenService | null = null;

  constructor(private pxe: PXE, private keystore: KeyStore, private uiManager: UIManager) {
    this.loadCurrentAccountIndex();
  }

  setTokenService(tokenService: TokenService) {
    this.tokenService = tokenService;
  }

  private async initializeDefaultAccountInterface(address: CompleteAddress): Promise<DefaultAccountInterface> {
    const authWitnessProvider = new MyAuthWitnessProvider();
    const nodeInfo: NodeInfo = await this.pxe.getNodeInfo();
  
    const defaultAccountInterface = new DefaultAccountInterface(authWitnessProvider, address, nodeInfo);
  
    console.log('Initialized DefaultAccountInterface:', defaultAccountInterface);
    return defaultAccountInterface;
  }
  

  private loadCurrentAccountIndex() {
    const storedIndex = localStorage.getItem('currentAccountIndex');
    this.currentAccountIndex = storedIndex ? parseInt(storedIndex, 10) : null;
  }

  private saveCurrentAccountIndex() {
    if (this.currentAccountIndex !== null) {
      localStorage.setItem('currentAccountIndex', this.currentAccountIndex.toString());
    } else {
      localStorage.removeItem('currentAccountIndex');
    }
  }

  async createAccount(secretKey: Fr) {
    const account: AccountManager = await this.getAccount(secretKey);
    const wallet: AccountWallet = await this.getWallet(account);

    const accountInKeystore = await this.isAccountInKeystore(wallet);

    if (accountInKeystore) {
      throw new Error('Account already exists in the keystore.');
    } else {
      await this.addAccountToKeystore(account, secretKey);
      const accounts = await this.keystore.getAccounts();
      this.currentAccountIndex = accounts.length - 1;
      this.saveCurrentAccountIndex();
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

    //const secretKey = await this.keystore.getSecretKey(accountAddress);

    const address = accountAddress.toString()

    return { incomingViewingSecretKey, outgoingViewingSecretKey, taggingSecretKey, address};
  }

  
  async getCurrentWallet(): Promise<AccountWallet | null> {
    if (this.currentAccountIndex === null) {
      return null;
    }

    const accounts = await this.keystore.getAccounts();
    const accountAddress = accounts[this.currentAccountIndex];

    const registeredAccount: CompleteAddress | undefined = await this.pxe.getRegisteredAccount(accountAddress);

    if (!registeredAccount) {
      alert("Account not registered");
      return null;
    }

    const accountInterface: DefaultAccountInterface = await this.initializeDefaultAccountInterface(registeredAccount);

    const accountWallet = new AccountWallet(this.pxe, accountInterface);

    return accountWallet;
  }

  async retrieveContractAddress(index?: number): Promise<CompleteAddress | null> {
    const accounts = await this.keystore.getAccounts();

    if (this.currentAccountIndex === null) {
      return Promise.resolve(null);
    }

    index = index || this.currentAccountIndex;

    const contractAddress = accounts[this.currentAccountIndex];

    const registeredAccount: CompleteAddress | undefined = await this.pxe.getRegisteredAccount(contractAddress);

    if (!registeredAccount) {
      return Promise.resolve(null);
    }

    return Promise.resolve(registeredAccount);
  }

  private async getAccount(secretKey: Fr): Promise<AccountManager> {
    const privateKey = CryptoUtils.deriveSigningKey(secretKey);
    const accountContract = new EcdsaKAccountContract(privateKey.toBuffer());
    this.pxe.getRegisteredAccounts

    return new AccountManager(this.pxe, secretKey, accountContract, Fr.ONE);
  }

  private async getWallet(account: AccountManager): Promise<AccountWallet> {
    const isInit = await this.checkContractInitialization(account);
    return isInit ? await account.register() : await account.waitSetup();
  }

  private async checkContractInitialization(account: AccountManager): Promise<boolean> {
    return this.pxe.isContractInitialized(account.getAddress());
  }

  private async isAccountInKeystore(wallet: AccountWallet): Promise<boolean> {
    const accountAddress = wallet.getCompleteAddress().address;
    const accounts = await this.keystore.getAccounts();
    return accounts.some(account => account.toString() === accountAddress.toString());
  }

  private async addAccountToKeystore(account: AccountManager, secretKey: Fr) {
    const partialAddress = computePartialAddress(account.getInstance());
    await this.keystore.addAccount(secretKey, partialAddress);
  }

  /*
  async getSecretKeyKeystore(index: number = this.currentAccountIndex ?? 0): Promise<Fr> {
    const accounts = await this.keystore.getAccounts();
    const accountAddress = accounts[index];
  
    return await this.keystore.getSecretKey(accountAddress);
  }
  */

  async getAccounts(): Promise<Fr[]> {
    await this.validateCurrentAccountIndex();
    return this.keystore.getAccounts();
  }

  getCurrentAccountIndex(): number | null {
    return this.currentAccountIndex;
  }

  async setCurrentAccountIndex(index: number | null) {
    if (index === null) {
      this.currentAccountIndex = null;
      this.saveCurrentAccountIndex();
    } else {
      const accounts = await this.keystore.getAccounts();
      if (index >= 0 && index < accounts.length) {
        this.currentAccountIndex = index;
        this.saveCurrentAccountIndex();
      } else {
        console.error('Invalid account index');
      }
    }
  }

  async removeAccount(index: number) {
    const accounts = await this.keystore.getAccounts();
    const accountAddress = accounts[index];
    await this.keystore.removeAccount(accountAddress);
    
    if (this.currentAccountIndex === index) {
      this.currentAccountIndex = accounts.length > 1 ? 0 : null;
      this.saveCurrentAccountIndex();
    } else if (this.currentAccountIndex !== null && this.currentAccountIndex > index) {
      this.currentAccountIndex--;
      this.saveCurrentAccountIndex();
    }
  }

  private async validateCurrentAccountIndex() {
    const accounts = await this.keystore.getAccounts();
    if (this.currentAccountIndex === null || this.currentAccountIndex >= accounts.length) {
      this.currentAccountIndex = accounts.length > 0 ? 0 : null;
      this.saveCurrentAccountIndex();
    }
  }

  async getTokens(): Promise<{ name: string; symbol: string }[]> {
    if (!this.tokenService) {
      throw new Error("TokenService not set");
    }
    return this.tokenService.getTokens();
  }

  async getTokenAddress(token: { name: string; symbol: string }): Promise<AztecAddress> {

    if (!this.tokenService) {
      throw new Error("TokenService not set");
    }
    return this.tokenService.getTokenAddress(token);
  }

  async rotateNullifierKey(wallet: AccountWallet) {
    const currentAccountIndex = this.getCurrentAccountIndex();
    if (currentAccountIndex === null) {
      throw new Error('No account selected');
    }

    const accounts = await this.keystore.getAccounts();
    const accountAddress = accounts[currentAccountIndex];

    const newSecretKey = await CryptoUtils.generateSecretKey();

    const { masterNullifierSecretKey } = deriveKeys(newSecretKey);

    const newPublicKey = derivePublicKeyFromSecretKey(masterNullifierSecretKey);

    await wallet.rotateNullifierKeys(masterNullifierSecretKey);

    // Update the Keystore
    await this.keystore.rotateMasterNullifierKey(accountAddress, masterNullifierSecretKey);

    // Update the KeyRegistry
    const keyRegistry = await KeyRegistryContract.at(getCanonicalKeyRegistryAddress(), wallet);
    await keyRegistry
      .withWallet(wallet)
      .methods.rotate_npk_m(wallet.getAddress(), newPublicKey.toNoirStruct(), Fr.ZERO)
      .send()
      .wait();

    console.log('Nullifier key rotated successfully in both Keystore and KeyRegistry');
  }
}