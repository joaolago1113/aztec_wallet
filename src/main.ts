import './style.css';
import { DefaultAccountContract } from "@aztec/accounts/defaults";
import { ShieldswapWalletSdk } from "@shieldswap/wallet-sdk";
import {SignClient} from '@walletconnect/sign-client';
import { getEcdsaKWallet, EcdsaKAccountContract, EcdsaKAccountContractArtifact } from '@aztec/accounts/ecdsa';

import { randomBytes, subtle } from 'crypto';

import { Account } from './Account.js';


import {  
  AccountManager, 
  AccountWalletWithSecretKey,
  Fr, 
  waitForPXE, 
  createPXEClient, 
  computeSecretHash, 
  Note, 
  ExtendedNote,
  GrumpkinScalar,
  AuthWitness,
  AuthWitnessProvider,
  Schnorr,
  loadContractArtifact,
  Fq,
  AztecAddress,
  sleep
} from "@aztec/aztec.js";
import { CompleteAddress, derivePublicKeyFromSecretKey, Point, deriveSigningKey, deriveKeys } from '@aztec/circuits.js';

import { Contract } from '@aztec/aztec.js';

import { computePartialAddress, computeContractAddressFromInstance } from '@aztec/circuits.js';

import { type NoirCompiledContract, } from '@aztec/types/noir';
//import SchnorrHardcodedAccountContractJson from './contracts/target/schnorr_hardcoded_account_contract-SchnorrHardcodedAccount.json' assert { type: "json" };

const WALLETCONNECT_PROJECT_ID = "9c949a62a5bde2de36fcd8485d568064";

import { KeyStore} from './Keystore.js';


const PXE_URL = 'http://localhost:8080';

class PXEFactory {
  private static pxeInstance: ReturnType<typeof createPXEClient> | null = null;

  public static async getPXEInstance(): Promise<ReturnType<typeof createPXEClient> > {
    if (!PXEFactory.pxeInstance) {
      PXEFactory.pxeInstance = createPXEClient(PXE_URL);
      await waitForPXE(PXEFactory.pxeInstance);
    }
    return PXEFactory.pxeInstance;
  }
}

class WalletSdkFactory {
  private static walletSdkInstance: ShieldswapWalletSdk | null = null;

  public static async getWalletSdkInstance(): Promise<ShieldswapWalletSdk> {
    if (!WalletSdkFactory.walletSdkInstance) {
      
      const pxe = await PXEFactory.getPXEInstance();
      WalletSdkFactory.walletSdkInstance = new ShieldswapWalletSdk(
        {
          projectId: WALLETCONNECT_PROJECT_ID,
        },
        pxe
      );
    }
    return WalletSdkFactory.walletSdkInstance;
  }
}

class KeystoreFactory {
  private static keystore: KeyStore | null = null;

  public static getKeystore(): KeyStore {
    if (!KeystoreFactory.keystore) {
      KeystoreFactory.keystore = new KeyStore();
    }
    return KeystoreFactory.keystore;
  }
}

// Holds the index of the currently selected account
let currentAccountIndex: number = 0;  

/*
const setupSandbox = async () => {
  if (pxeInstance && walletSdkInstance) {
    return { pxe: pxeInstance, walletSdk: walletSdkInstance, keystore: KeystoreFactory.getKeystore() };
  }

  const PXE_URL = 'http://localhost:8080';
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  // Initialize ShieldSwap Wallet SDK
  const walletSdk = new ShieldswapWalletSdk(
    {
      projectId: WALLETCONNECT_PROJECT_ID,
    },
    pxe
  );

  // Store the instances to avoid re-initialization
  pxeInstance = pxe;
  walletSdkInstance = walletSdk;

  return { pxe, walletSdk, keystore: KeystoreFactory.getKeystore() };
};
*/


/*
const SchnorrHardcodedAccountContractArtifact = loadContractArtifact(SchnorrHardcodedAccountContractJson as NoirCompiledContract);

class SchnorrHardcodedKeyAccountContract extends DefaultAccountContract {
  constructor(private privateKey: GrumpkinScalar) {
    super(SchnorrHardcodedAccountContractArtifact);
  }

  getDeploymentArgs(): undefined {
    return undefined;
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    const privateKey = this.privateKey;
    return {
      createAuthWit(messageHash: Fr): Promise<AuthWitness> {
        const signer = new Schnorr();
        const signature = signer.constructSignature(messageHash.toBuffer(), privateKey);
        return Promise.resolve(new AuthWitness(messageHash, [...signature.toBuffer()]));
      },
    };
  }
}
  
*/
import { createHash } from 'crypto';

async function generateSecretKey(seed?: string): Promise<Fr> {
  if (!seed) {
      // Generate a random 32-byte seed if none provided
      seed = randomBytes(32).toString('hex');
  }

  // Append '1' to the seed and hash
  const hash1 = createHash('sha256').update(`${seed}1`).digest('hex');

  // Append '2' to the same seed and hash
  const hash2 = createHash('sha256').update(`${seed}2`).digest('hex');

  // Concatenate both hashes to form a 512-bit number
  const combinedHash = `${hash1}${hash2}`;

  // Convert the combined hash to a bigint
  const combinedBigInt = BigInt('0x' + combinedHash);

  const masterSecretKey = new Fr(combinedBigInt % Fr.MODULUS); 

  return masterSecretKey;
}

/*
function displayPublicKey() {

  const { publicKey } = retrieveKeys();
  const contractAddress = retrieveContractAddress();

  const publicKeyDisplay = document.getElementById('publicKeyDisplay')!;

  publicKeyDisplay.textContent = `Public Key: ${publicKey}\n`;

  if(contractAddress)
    publicKeyDisplay.textContent += `Contract Address: ${contractAddress.address}\n`;
  else
    publicKeyDisplay.textContent += `Contract Address: none\n`;
}
*/

async function getSkKeysAtIndex() {
  const keystore = KeystoreFactory.getKeystore();
  const accounts = await keystore.getAccounts();

  const accountAddress = accounts[currentAccountIndex];

  // Get the public keys
  const incomingViewingPublicKey = await keystore.getMasterIncomingViewingPublicKey(accountAddress);
  const outgoingViewingPublicKey = await keystore.getMasterOutgoingViewingPublicKey(accountAddress);
  const taggingPublicKey = await keystore.getMasterTaggingPublicKey(accountAddress);

  // Get the corresponding secret keys
  const incomingViewingSecretKey = await keystore.getMasterSecretKey(incomingViewingPublicKey);
  const outgoingViewingSecretKey = await keystore.getMasterSecretKey(outgoingViewingPublicKey);
  const taggingSecretKey = await keystore.getMasterSecretKey(taggingPublicKey);

  const secretKey = await keystore.getSecretKey(accountAddress);

  const address = accountAddress.toString()

  return { incomingViewingSecretKey, outgoingViewingSecretKey, taggingSecretKey, secretKey, address};
}

function exportKeys() {
  getSkKeysAtIndex().then(({ incomingViewingSecretKey, outgoingViewingSecretKey, taggingSecretKey, secretKey, address }) => {
    const keys = { secretKey, address, incomingViewingSecretKey, outgoingViewingSecretKey, taggingSecretKey };
    const keysJson = JSON.stringify(keys);
    const blob = new Blob([keysJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keys.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}


/*
function storeContractAddress(contractAddress: CompleteAddress) : void  {
  localStorage.setItem('contractAddress', contractAddress.toString());
}
*/


async function retrieveContractAddress(index?: number): Promise<CompleteAddress> {
  const keystore = KeystoreFactory.getKeystore();
  const accounts = await keystore.getAccounts();

  index = index || currentAccountIndex;

  const contractAddress = accounts[currentAccountIndex];

  const secretKey = await keystore.getSecretKey(contractAddress);

  const { publicKeys } = deriveKeys(secretKey);

  const pxe = await PXEFactory.getPXEInstance();
  
  const privateKey = deriveSigningKey(secretKey);

  const accountContract = new EcdsaKAccountContract(privateKey.toBuffer());

  const account = new AccountManager(pxe, secretKey, accountContract, Fr.ONE);

  const partialAddress = computePartialAddress(account.getInstance());

  return Promise.resolve(new CompleteAddress(contractAddress, publicKeys, partialAddress));
}


async function importKeys(event: Event) {
  event.preventDefault();

  // Prompt the user for a secret key
  const secretKey = prompt('Enter the secret key:', '0x-your-secret-key-here');

  if (!secretKey || secretKey.length !== 66 ) {
    alert('Invalid secret key. Please enter a 32-byte string in hex format.');
    return;
  }

  const submitButton = document.querySelector('#accountForm button[type="submit"]') as HTMLButtonElement;
  try {
    // Disable the button
    requestAnimationFrame(() => {
      submitButton.disabled = true;
    });

    // Create the account
    await createAccount(Fr.fromString(secretKey));

  } catch (error) {
    console.error('Error during account creation:', error);
  } finally {
    submitButton.disabled = false;
  }
}


const SHIELDSWAP_METADATA = {
  name: "Aztec Wallet",
  description: "",
  url: "http://localhost:5173",
  icons: [],
};

const connectApp = async (event: Event) => {
  event.preventDefault();

  try {
    //const { pxe, walletSdk } = await setupSandbox();

    // Retrieve the WalletConnect URI from the input field
    const walletConnectInput = document.getElementById('walletConnectLink') as HTMLInputElement;
    const uri = walletConnectInput.value;

    if (!uri) {
      alert('Please enter a WalletConnect URL.');
      return;
    }

    // Initialize the signClient if not already done
    const signClient = await SignClient.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: SHIELDSWAP_METADATA,
    });

    // Pair with the provided URI
    await signClient.core.pairing.pair({ uri });

    // Retrieve the keys from local storage

    signClient.on('session_authenticate', async payload => {
      console.log('Session authenticated:', payload);
      // Implement your logic here
    });

    signClient.on('session_proposal', async (event) => {

      if (currentAccountIndex === null) {
        return;
      }
      const accountContract = await retrieveContractAddress();

      if(!accountContract){
        alert('Please generate the contract address first.');
        return;
      }

      const contractAddress = accountContract.address;

      const { id, params } = event;
      console.log('Session proposal received:', params);
    
      // Example: Display proposal details in a modal
      console.log(params);
      console.log(event);
    
      // You can approve or reject the proposal based on user interaction
      const namespaces = {
        eip1193: {
          accounts: [`aztec:1:${contractAddress}`],
          methods: ['aztec_accounts'],
          events: ['accountsChanged'],
        },
      };
    
      try {

        const { topic, acknowledged } = await signClient.approve({ id, namespaces });
        const session = await acknowledged()

        //await signClient.core.pairing.activate({ topic })

        console.log('Session Acknowledged:', session.acknowledged);

        //await signClient.core.pairing.updateExpiry({ topic, expiry: params.expiryTimestamp })

      } catch (error) {
        console.error('Failed to approve session:', error);
      }
    });


    signClient.on('session_event', (event) => {
      const { id, topic, params } = event;
      console.log('Session event:', params);

      /*
      // Handle different types of session events, such as chain changes
      switch (params.event.name) {
        case 'accountsChanged':
          handleAccountsChanged(params.event.data);
          break;
        case 'chainChanged':
          handleChainChanged(params.chainId);
          break;
        default:
          console.log('Unhandled event:', params.event.name);
      }
      */
     
    });

signClient.on('session_request', async (event) => {
  const { id, topic, params } = event;

  if (currentAccountIndex === null) {
    return;
  }

  const accountContract = await retrieveContractAddress();

  if (accountContract) {
    const contractAddressBuffer = accountContract;

    console.log('Contract Address:', contractAddressBuffer);

    try {
      console.log('Preparing to send response...');
      console.log('Response Data:', {
        id: id,
        jsonrpc: "2.0",
        result: contractAddressBuffer.toString(), // Fixed: Removed array brackets
      });

      await signClient.respond({
        topic: topic,
        response: {
          id: id,
          jsonrpc: "2.0",
          result: [contractAddressBuffer.toString()],  
        },
      });

      console.log('Session response sent successfully');
    } catch (error) {
      console.error('Error responding to session request:', error);
    }
  } else {
    alert("No contract address found. Please generate a contract address.");
  }
});
    
    
    
    

      

    signClient.on('session_ping', (event) => {
      const { id, topic } = event;
      console.log('Session ping received:', topic);
    
      // You can send a response or just log the ping
      // signClient.respond({ id, topic, result: 'pong' });
    });
    
    
/*
    signClient.on('session_proposal', async (event) => {
      console.log('Session proposal received:', event);

      // Approve the session proposal with specific namespaces
      const { id } = event;
      const namespaces = {
        eip1193: {
          accounts: [`aztec:1:${publicKey}`], // Chain ID 1 (Ethereum Mainnet)
          methods: [
            'aztec_accounts',
            'aztec_sendTransaction',
            'aztec_createAuthWitness',
            'aztec_experimental_createSecretHash',
            'aztec_experimental_tokenRedeemShield',
          ],
          events: ['accountsChanged'],
        },
      };

      const { topic, acknowledged } = await signClient.approve({
        id,
        namespaces,
      });

      const session = await acknowledged;
      console.log('Session approved:', session);

      console.log('Pairing topic:', topic);

      // Activate the pairing after the session is acknowledged
      setTimeout(async () => {
        await signClient.core.pairing.activate({ topic });
      }, 1000);  // 1-second delay
      
      // Handle the connected account using ShieldSwap SDK
      // const account = await walletSdk.connect();
      // console.log("Connected wallet", account.getAddress().toString());

      // const accountInfoDiv = document.getElementById('accountInfo')!;
      // accountInfoDiv.innerHTML = `Connected wallet address: ${account.getAddress().toString()}`;

      // const address = account.getCompleteAddress().address;
      // accountInfoDiv.innerHTML += `<br/>Account connected with address: ${address}`;
    });
*/
    signClient.on('session_delete', () => {
      console.log('Session deleted');
      const accountInfoDiv = document.getElementById('accountInfo')!;
      accountInfoDiv.innerHTML = 'Wallet disconnected';
    });

  } catch (e) {
    console.error('Error occurred:', e);
    alert('Failed to connect wallet.');
  }
};


/*
async function createAccountSubmit(event: Event) {
  event.preventDefault();

  try {
    localStorage.clear();

    // Always generate new keys
    const { privateKey, publicKey } = await generateKeyPair();
    storeKeys(privateKey, publicKey);

    const { pxe, walletSdk } = await setupSandbox();



    const accountContract = new EcdsaKAccountContract(publicKey.toBuffer());

    //const accountContract = new SchnorrHardcodedKeyAccountContract(privateKey);

    const derivedAddress = publicKey.toString();

    const accountInfoDiv = document.getElementById('accountInfo')!;
    accountInfoDiv.innerHTML = `\nDerived account address: ${derivedAddress}.`;

    const account = new AccountManager(pxe, Fr.random(), accountContract);
    const wallet = await account.waitSetup();
    const walletaddress = wallet.getCompleteAddress();
    const address = walletaddress.address;

    storeContractAddress(walletaddress);

    accountInfoDiv.innerHTML = `Account deployed at address: ${address}`;
  } catch (e) {
    console.error('Error occurred:', e);
    alert('Failed to create account.');
  }

  displayPublicKey();
} 

*/

/*

//todo:
async function sendTransaction(recipientAddress: string, amount: BigInt) {
  try {
    // Initialize the PXE and Wallet SDK
    const pxe = PXEFactory.getPXEInstance();


    // Assuming you have the address and private key of the account
    const address = retrieveContractAddress();

    const keys = retrieveKeys();

    if(!address || !keys.privateKey){
      alert('Please generate the contract address first.');
      return;
    }

    const signingPrivateKey = Buffer.from(keys.privateKey, 'hex'); 

    // Get the wallet for the account
    const wallet = await getEcdsaKWallet(pxe, address.address, signingPrivateKey);
    
    // Assuming you have the contract address and ABI
    const contractAddress = address.address;
    const contractArtifact = EcdsaKAccountContractArtifact; // Replace with your actual contract artifact

    // Initialize the contract instance
    const contract = await Contract.at(contractAddress, contractArtifact, wallet);

    // Send the transaction
    const tx = await contract.methods.transfer(recipientAddress, amount).send();
    console.log(`Transaction sent with hash: ${await tx.getTxHash()}`);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log(`Transaction mined in block: ${receipt.blockNumber}`);
  } catch (e) {
    console.error('Error occurred:', e);
    alert('Failed to send transaction.');
  }
}
*/

/*
async function listAccountTokens() {
  try {
    // Initialize the PXE and Wallet SDK
    const pxe = await PXEFactory.getPXEInstance();

    // Assuming you have the address and private key of the account
    const address = retrieveContractAddress();
    const keys = retrieveKeys();

    if (!address || !keys.privateKey) {
      alert('Please generate the contract address first.');
      return;
    }

    const signingPrivateKey = Buffer.from(keys.privateKey, 'hex');

    // Get the wallet for the account
    const wallet = await getEcdsaKWallet(pxe, address.address, signingPrivateKey);

    // Retrieve the account keys and sync the account
    let accountKeys = await wallet.getAccountKeysAndSyncAccount();
    
    wallet.getBal
    // Get the balances of all assets associated with the account
    let assetValues = await wallet.sdk.getBalances(accountKeys.publicKey);

    // Print the details of each asset
    assetValues.map(async (assetValue) => {
      let blockchainAsset = await wallet.sdk.getAssetInfo(assetValue.assetId);
      let bigintamount = assetValue.value / BigInt(10 ** (blockchainAsset.decimals / 2));
      let amount = Number(bigintamount) / 10 ** (blockchainAsset.decimals / 2);

      console.log("Asset:", blockchainAsset.name);
      console.log("Asset Id:", assetValue.assetId);
      console.log("Amount:", amount);
      console.log("=".repeat(50));
    });
  } catch (e) {
    console.error('Error occurred:', e);
    alert('Failed to list account tokens.');
  }
}*/


async function createAccountSubmit(event: Event) {
  event.preventDefault();

  // Get the button element
  const submitButton = document.querySelector('#accountForm button[type="submit"]') as HTMLButtonElement;

  // Disable the button
  requestAnimationFrame(() => {
    submitButton.disabled = true;
  });

  try {
    // Generate a new key pair
    const secretKeyFr = await generateSecretKey();

    // Create the account
    await createAccount(secretKeyFr);
    
  } catch (error) {
    console.error('Error during account creation:', error);
  } finally {
    // Enable the button after all async operations are done
    submitButton.disabled = false;
  }
}

async function checkContractInitialization(account: AccountManager): Promise<boolean> {

  let isInit: boolean = false;

  try {
    const pxe = await PXEFactory.getPXEInstance();

    isInit = await pxe.isContractInitialized(account.getAddress());

    if (isInit) {
      console.log(`Account at ${account.getAddress().toString()} is already initialized`);
    } else {
      console.log(`Account at ${account.getAddress().toString()} is not initialized`);
    }
  } catch (error) {
    console.error('Error occurred:', error);
    alert('Failed to check contract initialization.');
  }

  return isInit;
}

async function isAccountInKeystore(wallet: AccountWalletWithSecretKey): Promise<boolean> {
  const keystore = KeystoreFactory.getKeystore();
  const accountAddress = wallet.getCompleteAddress().address;
  const accounts = await keystore.getAccounts();
  console.log('Accounts in keystore:', accounts);
  console.log('Checking if account is in keystore:', accountAddress);

  

  return accounts.some(account => account.toString() === accountAddress.toString());
}


async function createAccount(secretKey: Fr) {

  try {
    // Initialize the PXE and Wallet SDK
    const pxe = await PXEFactory.getPXEInstance();

    const privateKey = deriveSigningKey(secretKey);

    // Create and deploy the account contract
    const accountContract = new EcdsaKAccountContract(privateKey.toBuffer());
    const account = new AccountManager(pxe, secretKey, accountContract, Fr.ONE);

    const isInit = await checkContractInitialization(account);

    let wallet: AccountWalletWithSecretKey;
    // Check if account is already initialized
    if (isInit) {
      alert(`Account at ${account.getAddress().toString()} already initialized`);
      wallet = await account.register();
    } else {
      wallet = await account.waitSetup();
    }

    const accountInKeystore = await isAccountInKeystore(wallet);
    let completeAddress;

    if (accountInKeystore) {
      alert('Account already exists in the keystore.');
      completeAddress = wallet.getCompleteAddress();
    } else {
      const partialAddress = computePartialAddress(account.getInstance());
      const keystore = KeystoreFactory.getKeystore();

      completeAddress = await keystore.addAccount(secretKey, partialAddress);

      const accounts = await keystore.getAccounts();
      currentAccountIndex = accounts.length-1;
    }

    // Update the UI
    updateAccountUI();

    // Show the derived account address in the UI
    const accountInfoDiv = document.getElementById('accountInfo')!;
    accountInfoDiv.innerHTML = `Account deployed at address: ${completeAddress.address}`;
  } catch (e) {
    console.error('Error occurred:', e);
    alert('Failed to create account.');
  }
}


function setupTabNavigation(){
  const tab1Button = document.getElementById('tab1Button');
  const tab2Button = document.getElementById('tab2Button');
  const tab1 = document.getElementById('tab1');
  const tab2 = document.getElementById('tab2');

  // Tab navigation
  if (tab1Button && tab2Button && tab1 && tab2) {
    tab1Button.addEventListener('click', () => {

      tab1.classList.add('active');
      tab2.classList.remove('active');
    });

    tab2Button.addEventListener('click', () => {
      tab1.classList.remove('active');
      tab2.classList.add('active');
    });
  }  
}

setupTabNavigation();

  /*
  function updateAccountDropdown() {
    const storedAccounts = localStorage.getItem('accounts');
    const storedCurrentAccountIndex = localStorage.getItem('currentAccountIndex');
  
    if (storedAccounts) {
      accounts = JSON.parse(storedAccounts);
    }
  
    if (storedCurrentAccountIndex && !currentAccountIndex) {


      currentAccountIndex = parseInt(storedCurrentAccountIndex, 10);

    }
  


    const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement;
    accountSelect.innerHTML = '<option value="" disabled selected>Select an account</option>';
  
    accounts.forEach(account => {
      const option = document.createElement('option');
      option.value = account.publicKey;
      option.textContent = account.name;
      accountSelect.appendChild(option);
    });




    // Select the current account in the dropdown
    if (currentAccountIndex !== null && accounts[currentAccountIndex]) {
      const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement;
      accountSelect.value = accounts[currentAccountIndex].address;


       alert(currentAccountIndex);
      //displayPublicKey();
    }
  }
*/




async function updateAccountUI() {
  const keystore = KeystoreFactory.getKeystore();
  const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement;

  // Clear existing options
  accountSelect.innerHTML = '<option value="" disabled selected>Select an account</option>';

  const accounts = await keystore.getAccounts();
  
  accounts.forEach((account: any) => {
    const option = document.createElement('option');
    option.value = account.toString(); // Use address as the value
    option.textContent = account.toString();
    accountSelect.appendChild(option);
  })

  // Select the current account in the dropdown
  if (currentAccountIndex !== null && accounts[currentAccountIndex]) {
    accountSelect.value = accounts[currentAccountIndex].toString();

    // Uncomment the following line to display the public key
    // displayPublicKey();
  }
}

updateAccountUI();


function setAccountSelectionListener(){
  const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement;

  accountSelect.addEventListener('change', (event) => {
    const selectedOption = (event.target as HTMLSelectElement).selectedOptions[0];
    if(selectedOption.index){

      const selectedIndex = selectedOption.index-1;
      localStorage.setItem('currentAccountIndex', selectedIndex.toString());
      currentAccountIndex = selectedIndex; // Update the currentAccountIndex variable
    }
  });  
}

setAccountSelectionListener();

  // Populate the account dropdown

/*
  const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement;
  if (accountSelect && publicKeyDisplay) {
    accountSelect.addEventListener('change', () => {
      const selectedAccount = accounts.find(account => account.publicKey === accountSelect.value);
      if (selectedAccount) {
        publicKeyDisplay.textContent = `Public Key: ${selectedAccount.publicKey}\nContract Address: ${selectedAccount.address}`;
        currentAccountIndex = selectedAccount.index;
        localStorage.setItem('currentAccountIndex', currentAccountIndex.toString());
      } else {
        publicKeyDisplay.textContent = 'Public Key: Not available';
      }
    });
  }
  */

function addCopyClipboard() {
  const copyButton = document.getElementById('copyAddressButton');
  
  if(!copyButton){
    alert('Please generate the contract address first.');
    return;
  }
  
  copyButton.addEventListener('click', async () => {

    const contractAddress = await retrieveContractAddress();

    if(!contractAddress || !copyButton){
      alert('Please generate the contract address first.');
      return;
    }
    
    if (contractAddress) {
      navigator.clipboard.writeText(contractAddress.address.toString()).then(() => {
        alert('Contract address copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy: ', err);
      });
    } else {
      alert('No contract address available to copy.');
    }
  });
};


addCopyClipboard();



function setupUi() {

  const storedCurrentAccountIndex = localStorage.getItem('currentAccountIndex');

  if (storedCurrentAccountIndex) {
    currentAccountIndex = parseInt(storedCurrentAccountIndex, 10);
  }

  document.getElementById('accountForm')!.addEventListener('submit', createAccountSubmit);
  document.getElementById('exportKeys')!.addEventListener('click', exportKeys);
  document.getElementById('importKeys')!.addEventListener('click', importKeys);
  document.getElementById('connectAppButton')!.addEventListener('click', connectApp);

}
setupUi();