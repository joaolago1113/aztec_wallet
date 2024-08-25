import './style.css';

import { DefaultAccountContract } from "@aztec/accounts/defaults";

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

import { type NoirCompiledContract } from '@aztec/types/noir';

// Import the Schnorr Hardcoded Account Contract artifact
import SchnorrHardcodedAccountContractJson from './contracts/target/schnorr_hardcoded_account_contract-SchnorrHardcodedAccount.json' assert { type: "json" };
//import { TokenContract } from '@aztec/noir-contracts.js/Token';

const SchnorrHardcodedAccountContractArtifact = loadContractArtifact(SchnorrHardcodedAccountContractJson as NoirCompiledContract);


// Define your custom SchnorrHardcodedKeyAccountContract class
class SchnorrHardcodedKeyAccountContract extends DefaultAccountContract {
  constructor(private privateKey: GrumpkinScalar) {
    super(SchnorrHardcodedAccountContractArtifact);
  }

  getDeploymentArgs(): undefined {
    // This contract has no constructor
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
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"]
  );

  const privateKey = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const publicKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);

  return {
    privateKey: arrayBufferToHex(privateKey),
    publicKey: arrayBufferToHex(publicKey),
  };
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

// Store keys securely in localStorage (for simplicity in this example)
function storeKeys(privateKey: string, publicKey: string) {
  localStorage.setItem('privateKey', privateKey);
  localStorage.setItem('publicKey', publicKey);
}

// Retrieve keys from localStorage
function retrieveKeys() {
  const privateKey = localStorage.getItem('privateKey');
  const publicKey = localStorage.getItem('publicKey');
  return { privateKey, publicKey };
}

// Setup PXE client
const setupSandbox = async () => {
  const PXE_URL = 'http://localhost:8080'; 
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe); 
  return pxe;
};

// Form submission handler
const handleFormSubmit = async (event: Event) => {
  event.preventDefault();

  try {


    /*
    // Generate and store keys securely
    const { privateKey, publicKey } = await generateKeyPair();
    storeKeys(privateKey, publicKey);

    // Convert the private key from string to GrumpkinScalar
    const grumpkinPrivateKey = GrumpkinScalar.fromString(privateKey.slice(0, 64));

    // Setup PXE and create an account using your custom SchnorrHardcodedKeyAccountContract class
    const pxe = await setupSandbox();


    // Derive and show address TODO: Implement a check to confirm the account has been funded


    const account = new AccountManager(pxe, Fr.random(), new SchnorrHardcodedKeyAccountContract(grumpkinPrivateKey));
    const wallet = await account.waitSetup();
    const address = wallet.getCompleteAddress().address;

    // Display the deployed account address
    const accountInfoDiv = document.getElementById('accountInfo')!;
    accountInfoDiv.innerHTML = `Account deployed at address: ${address}`;
*/



    const { privateKey, publicKey } = await generateKeyPair();
    storeKeys(privateKey, publicKey);

    const grumpkinPrivateKey = GrumpkinScalar.fromString(privateKey.slice(0, 64));
    const pxe = await setupSandbox();

    const accountContract = new SchnorrHardcodedKeyAccountContract(grumpkinPrivateKey);
    const derivedAddress = publicKey; // Correct method to derive address

    // Display the derived address to the user
    const accountInfoDiv = document.getElementById('accountInfo')!;
    accountInfoDiv.innerHTML = `\nDerived account address: ${derivedAddress.toString()}. (TODO) Please fund this address to proceed.`;

    sleep(5000)
    // Wait for user to fund the account
    // TODO: Implement a check to confirm the account has been funded

    const account = new AccountManager(pxe, Fr.random(), accountContract);
    const wallet = await account.waitSetup();
    const address = wallet.getCompleteAddress().address;

    accountInfoDiv.innerHTML = `Account deployed at address: ${address}`;


    
  } catch (e) {
    console.error('Error occurred:', e);
    alert('Failed to create account.');
  }
};

// Attach event listener to form submission
document.getElementById('accountForm')!.addEventListener('submit', handleFormSubmit);