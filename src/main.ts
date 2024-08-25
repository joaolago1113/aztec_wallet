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
import SchnorrHardcodedAccountContractJson from './contracts/target/schnorr_hardcoded_account_contract-SchnorrHardcodedAccount.json' assert { type: "json" };

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

function storeKeys(privateKey: string, publicKey: string) {
  localStorage.setItem('privateKey', privateKey);
  localStorage.setItem('publicKey', publicKey);
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

const setupSandbox = async () => {
  const PXE_URL = 'http://localhost:8080'; 
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe); 
  return pxe;
};

const handleFormSubmit = async (event: Event) => {
  event.preventDefault();

  try {
    localStorage.clear();

    const { privateKey, publicKey } = await generateKeyPair();
    storeKeys(privateKey, publicKey);

    const grumpkinPrivateKey = GrumpkinScalar.fromString(privateKey.slice(0, 64));
    const pxe = await setupSandbox();

    const accountContract = new SchnorrHardcodedKeyAccountContract(grumpkinPrivateKey);
    const derivedAddress = publicKey; // Correct method to derive address

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
};

document.getElementById('accountForm')!.addEventListener('submit', handleFormSubmit);
document.getElementById('exportKeys')!.addEventListener('click', exportKeys);
document.getElementById('importKeys')!.addEventListener('change', importKeys);
