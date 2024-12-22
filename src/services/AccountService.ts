import { AuthWitnessProvider, AccountContract, Fr, AccountManager, AccountWallet, NodeInfo, Contract } from "@aztec/aztec.js";
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
import { getEcdsaKWallet } from '@aztec/accounts/ecdsa';
import { EcdsaKAccountContractArtifact } from '@aztec/accounts/ecdsa';
import { EcdsaKHOTPAccountContract } from '../contracts/EcdsaKHOTPAccountContract.js';
import { getCustomEcdsaKWallet } from '../utils/CustomWalletUtils.js';


export class AccountService {
  private currentAccountIndex: number | null = null;
  private tokenService: TokenService | null = null;

  constructor(private pxe: PXE, private keystore: KeyStore, private uiManager: UIManager) {
    this.loadCurrentAccountIndex();
  }

  setTokenService(tokenService: TokenService) {
    this.tokenService = tokenService;
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

  async importAccount(secretKey: string, use2FA: boolean = false, hotpsecret: string = ''): Promise<void> {
    const secretKeyFr = Fr.fromString(secretKey);

    const privateKey = deriveSigningKey(secretKeyFr);

    let accountContract: AccountContract;

    if(!use2FA){
      accountContract = new EcdsaKAccountContract(privateKey.toBuffer());
    }else{
      accountContract = new EcdsaKHOTPAccountContract(privateKey.toBuffer(), Buffer.from(hotpsecret));
    }

    const account = new AccountManager(this.pxe, secretKeyFr, accountContract, Fr.ONE);

    const wallet = await this.getWallet(account);

    const partialAddress = computePartialAddress(account.getInstance());

    const accountInKeystore = await this.isAccountInKeystore(wallet);

    if (!accountInKeystore) {
      await this.keystore.addAccount(secretKeyFr, partialAddress, use2FA, hotpsecret);
      const accounts = await this.keystore.getAccounts();
      this.currentAccountIndex = accounts.length - 1;
      this.saveCurrentAccountIndex();
    } else {
      throw new Error('Account already exists in keystore');
    }
  }

  async createAccount(seed: string | undefined, use2FA: boolean = false) {
    let nonce = 0;
    let secretKey: Fr;
    let account: AccountManager;
    let wallet: AccountWallet;
    let hotpSecret: string | undefined;

    while (true) {
      try {
        secretKey = CryptoUtils.generateSecretKey(seed, nonce);
        if (use2FA) {
          hotpSecret = CryptoUtils.generateHOTPSecret(seed, nonce);
        }else{
          hotpSecret = '';
        }
        account = await this.setupAccount(secretKey, use2FA ? Buffer.from(hotpSecret) : Buffer.from([]));
        wallet = await this.getWallet(account);
        const partialAddress = computePartialAddress(account.getInstance());

        const accountInKeystore = await this.isAccountInKeystore(wallet);

        if (!accountInKeystore) {
          await this.keystore.addAccount(secretKey, partialAddress, use2FA, hotpSecret);
          const accounts = await this.keystore.getAccounts();
          this.currentAccountIndex = accounts.length - 1;
          this.saveCurrentAccountIndex();
          return { secretKey, hotpSecret };
        }

        nonce++;
      } catch (error) {
        console.error('Error creating account:', error);
        throw error;
      }
    }
  }

  private async setupAccount(secretKey: Fr, totpSecretHash: Buffer): Promise<AccountManager> {
    const privateKey = deriveSigningKey(secretKey);

    let accountContract: AccountContract;

    if(!totpSecretHash.byteLength){
      accountContract = new EcdsaKAccountContract(privateKey.toBuffer());
    }else{
      accountContract = new EcdsaKHOTPAccountContract(privateKey.toBuffer(), totpSecretHash);
    }

    const account = new AccountManager(this.pxe, secretKey, accountContract, Fr.ONE);
    return account;
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
    const privateKey = await this.keystore.getEcdsaSecretKey(accountAddress);

    const address = accountAddress.toString()

    return { incomingViewingSecretKey, outgoingViewingSecretKey, taggingSecretKey, address, privateKey};
  }
  
  async getCurrentWallet(): Promise<AccountWallet | null> {
    if (this.currentAccountIndex === null) {
      return null;
    }

    const accounts = await this.keystore.getAccounts();
    const accountAddress = accounts[this.currentAccountIndex];

    const ecdsaSkBuffer = await this.keystore.getEcdsaSecretKey(accountAddress);
    const ecdsaSk = Fr.fromBuffer(ecdsaSkBuffer);

    const ecdsaKWallet = await getCustomEcdsaKWallet(this.pxe, accountAddress, ecdsaSk.toBuffer());

    return ecdsaKWallet;
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

    const newSecretKey = await CryptoUtils.generateSecretKey();

    const { masterNullifierSecretKey } = deriveKeys(newSecretKey);

    await wallet.rotateNullifierKeys(masterNullifierSecretKey);

    await this.keystore.rotateMasterNullifierKey(wallet.getAddress(), masterNullifierSecretKey);

    //const newPublicKey = derivePublicKeyFromSecretKey(masterNullifierSecretKey);
    //const keyRegistry = await KeyRegistryContract.at(getCanonicalKeyRegistryAddress(), wallet);
    //await keyRegistry
    //  .withWallet(wallet)
    //  .methods.rotate_npk_m(wallet.getAddress(), { inner: newPublicKey.toNoirStruct() }, Fr.ZERO)
    //  .send()
    //  .wait();

    console.log('Nullifier key rotated successfully in both Keystore and KeyRegistry');
  }

  async getWalletByAddress(address: string): Promise<AccountWallet | null> {
    const accounts = await this.keystore.getAccounts();
    const index = accounts.findIndex(acc => acc.toString() === address);
  
    if (index === -1) {
      return null;
    }

    const accountAddress = accounts[index];
    const ecdsaSkBuffer = await this.keystore.getEcdsaSecretKey(accountAddress);
    const ecdsaSk = Fr.fromBuffer(ecdsaSkBuffer);

    return getCustomEcdsaKWallet(this.pxe, accountAddress, ecdsaSk.toBuffer());
  }

  async getPrivateKey(address: string): Promise<Fr> {
    const accounts = await this.keystore.getAccounts();
    const index = accounts.findIndex(acc => acc.toString() === address);
  
    if (index === -1) {
      throw new Error(`No account found for address ${address}`);
    }

    const accountAddress = accounts[index];
    const privateKeyBuffer = await this.keystore.getEcdsaSecretKey(accountAddress);
    return Fr.fromBuffer(privateKeyBuffer);
  }

}