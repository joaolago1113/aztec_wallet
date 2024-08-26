import './style.css';
import { DefaultAccountContract } from "@aztec/accounts/defaults";
import { ShieldswapWalletSdk } from "@shieldswap/wallet-sdk";
import {SignClient} from '@walletconnect/sign-client';


import {  
  AccountManager, 
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
  CompleteAddress,
  loadContractArtifact,
  Fq,
  AztecAddress,
  sleep
} from "@aztec/aztec.js";
import { derivePublicKeyFromSecretKey } from '@aztec/circuits.js';

import { type NoirCompiledContract } from '@aztec/types/noir';
import SchnorrHardcodedAccountContractJson from './contracts/target/schnorr_hardcoded_account_contract-SchnorrHardcodedAccount.json' assert { type: "json" };

const WALLETCONNECT_PROJECT_ID = "9c949a62a5bde2de36fcd8485d568064";

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

async function generateKeyPair() {
  const privateKey = GrumpkinScalar.random();
  const publicKey = derivePublicKeyFromSecretKey(privateKey);

  return {
    privateKey: privateKey,
    publicKey: publicKey,
  };
}

function displayPublicKey(publicKey: string) {
  const publicKeyDisplay = document.getElementById('publicKeyDisplay')!;
  publicKeyDisplay.textContent = `Public Key: ${publicKey}`;
}

function storeKeys(privateKey: string, publicKey: string) {
  localStorage.setItem('privateKey', privateKey);
  localStorage.setItem('publicKey', publicKey);
  displayPublicKey(publicKey);
}

function retrieveKeys() {
  const privateKey = localStorage.getItem('privateKey');
  const publicKey = localStorage.getItem('publicKey');
  return { privateKey, publicKey };
}

function exportKeys() {
  const { privateKey, publicKey } = retrieveKeys();
  const keys = { privateKey, publicKey };
  const keysJson = JSON.stringify(keys);
  const blob = new Blob([keysJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'keys.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importKeys(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const keysJson = e.target?.result as string;
      const keys = JSON.parse(keysJson);
      storeKeys(keys.privateKey, keys.publicKey);
      alert('Keys imported successfully.');
    };
    reader.readAsText(input.files[0]);
  }
}
let pxeInstance: ReturnType<typeof createPXEClient> | null = null;
let walletSdkInstance: ShieldswapWalletSdk | null = null;

const SHIELDSWAP_METADATA = {
  name: "Aztec Wallet",
  description: "",
  url: "http://localhost:5173",
  icons: [],
};


const setupSandbox = async () => {
  if (pxeInstance && walletSdkInstance) {
    return { pxe: pxeInstance, walletSdk: walletSdkInstance };
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

  return { pxe, walletSdk };
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
    const { publicKey } = retrieveKeys();

    signClient.on('session_proposal', async (event) => {
      console.log('Session proposal received:', event);

      // Approve the session proposal with specific namespaces
      const { id } = event;
      const namespaces = {
        eip1193: {
          accounts: [`eip1193:1:${publicKey}`], // Chain ID 1 (Ethereum Mainnet)
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

      // Handle the connected account using ShieldSwap SDK
      // const account = await walletSdk.connect();
      // console.log("Connected wallet", account.getAddress().toString());

      // const accountInfoDiv = document.getElementById('accountInfo')!;
      // accountInfoDiv.innerHTML = `Connected wallet address: ${account.getAddress().toString()}`;

      // const address = account.getCompleteAddress().address;
      // accountInfoDiv.innerHTML += `<br/>Account connected with address: ${address}`;
    });

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

async function createAccountSubmit(event: Event) {
  event.preventDefault();

  try {
    localStorage.clear();

    // Always generate new keys
    const { privateKey, publicKey } = await generateKeyPair();
    storeKeys(privateKey.toString(), publicKey.toString());

    const { pxe, walletSdk } = await setupSandbox();

    const accountContract = new SchnorrHardcodedKeyAccountContract(privateKey);
    const derivedAddress = publicKey;

    const accountInfoDiv = document.getElementById('accountInfo')!;
    accountInfoDiv.innerHTML = `\nDerived account address: ${derivedAddress.toString()}. (TODO) Please fund this address to proceed.`;

    await sleep(1000); // Wait for user to fund the account

    // TODO: Implement a check to confirm the account has been funded

    const account = new AccountManager(pxe, Fr.random(), accountContract);
    const wallet = await account.waitSetup();
    const address = wallet.getCompleteAddress().address;

    accountInfoDiv.innerHTML = `Account deployed at address: ${address}`;
  } catch (e) {
    console.error('Error occurred:', e);
    alert('Failed to create account.');
  }
}

document.getElementById('accountForm')!.addEventListener('submit', createAccountSubmit);
document.getElementById('exportKeys')!.addEventListener('click', exportKeys);
document.getElementById('importKeys')!.addEventListener('change', importKeys);
document.getElementById('connectAppButton')!.addEventListener('click', connectApp);

const { publicKey } = retrieveKeys();
if (publicKey) {
   displayPublicKey(publicKey);
}