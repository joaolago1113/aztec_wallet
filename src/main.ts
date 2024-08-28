import './style.css';
import { DefaultAccountContract } from "@aztec/accounts/defaults";
import { ShieldswapWalletSdk } from "@shieldswap/wallet-sdk";
import {SignClient} from '@walletconnect/sign-client';
import { EcdsaRSSHAccountContract } from '@aztec/accounts/ecdsa';


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
import { derivePublicKeyFromSecretKey, Point } from '@aztec/circuits.js';

import { type NoirCompiledContract } from '@aztec/types/noir';
import SchnorrHardcodedAccountContractJson from './contracts/target/schnorr_hardcoded_account_contract-SchnorrHardcodedAccount.json' assert { type: "json" };

const WALLETCONNECT_PROJECT_ID = "9c949a62a5bde2de36fcd8485d568064";

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

async function generateKeyPair() {
  const privateKey = GrumpkinScalar.random();
  const publicKey = derivePublicKeyFromSecretKey(privateKey); 

  return {
    privateKey: privateKey,
    publicKey: publicKey,
  };
}

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

function storeKeys(privateKey: Fq, publicKey: Point) : void  {
  
  localStorage.setItem('privateKey', privateKey.toString());
  localStorage.setItem('publicKey', publicKey.toString());
}

function retrieveKeys() {
  const privateKey = localStorage.getItem('privateKey');
  const publicKey = localStorage.getItem('publicKey');
  return { privateKey, publicKey };
}

function storeContractAddress(contractAddress: CompleteAddress) : void  {
  localStorage.setItem('contractAddress', contractAddress.toString());
}

function retrieveContractAddress(): CompleteAddress | null{
  const contractAccount = localStorage.getItem('contractAddress');

  if (contractAccount){

    return CompleteAddress.fromString( contractAccount )
  }else{
    return null;
  }
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

  //TODO: It should check if a contract address was already generated for it or not, and if not generate it.
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
    const { topic } = await signClient.core.pairing.pair({ uri });

    // Retrieve the keys from local storage

    signClient.on('session_authenticate', async payload => {
      console.log('Session authenticated:', payload);
      // Implement your logic here
    });

    signClient.on('session_proposal', async (event) => {


      const accountContract = retrieveContractAddress();

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

  const accountContract = retrieveContractAddress();

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

async function createAccountSubmit(event: Event) {
  event.preventDefault();

  try {
    localStorage.clear();

    // Always generate new keys
    const { privateKey, publicKey } = await generateKeyPair();
    storeKeys(privateKey, publicKey);

    const { pxe, walletSdk } = await setupSandbox();



    const accountContract = new EcdsaRSSHAccountContract(publicKey.toBuffer());

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

document.getElementById('accountForm')!.addEventListener('submit', createAccountSubmit);
document.getElementById('exportKeys')!.addEventListener('click', exportKeys);
document.getElementById('importKeys')!.addEventListener('change', importKeys);
document.getElementById('connectAppButton')!.addEventListener('click', connectApp);

displayPublicKey();









