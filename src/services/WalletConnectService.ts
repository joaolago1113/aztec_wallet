import { SignClient } from '@walletconnect/sign-client';
import { PairingTypes } from '@walletconnect/types';
import { AccountService } from './AccountService.js';
import { UIManager } from '../ui/UIManager.js';
import { type AccountWallet, Fr, computeAuthWitMessageHash, computeInnerAuthWitHash, computeSecretHash, AztecAddress, SentTx  } from '@aztec/aztec.js';
import { PXEFactory } from '../factories/PXEFactory.js';
import { AuthWitness, PXE } from '@aztec/aztec.js';
import { FunctionType } from '@aztec/foundation/abi';
import { TxHash, BatchCall, FunctionCall, FunctionSelector,  } from '@aztec/aztec.js';
import { TxExecutionRequest, type TxReceipt } from '@aztec/circuit-types';
import { type FieldsOf } from '@aztec/foundation/types';

interface CallData {
  name: string;
  to: string;
  selector: string;
  type: 'private' | 'public';
  isStatic: boolean;
  args: string[];
}

export class WalletConnectService {
  private signClient: InstanceType<typeof SignClient>;
  private initializationPromise: Promise<void>;
  
  constructor(
    private projectId: string, 
    private metadata: any, 
    private accountService: AccountService,
    private uiManager: UIManager
  ) {
    this.signClient = {} as InstanceType<typeof SignClient>; // Temporary initialization
    this.initializationPromise = this.initializeSignClient(this.projectId, this.metadata);
    
    this.setupEventListeners();
  }

  private async initializeSignClient(projectId: string, metadata: any) {
    this.signClient = await SignClient.init({
      projectId,
      metadata
    });
  }

  private async ensureInitialized() {
    await this.initializationPromise;
  }
  
  private async setupEventListeners() {
    await this.ensureInitialized();
    this.signClient.on('session_authenticate', this.onSessionAuthenticate);
    this.signClient.on('session_proposal', this.onSessionProposal);
    this.signClient.on('session_event', this.onSessionEvent);
    this.signClient.on('session_request', this.onSessionRequest);
    this.signClient.on('session_ping', this.onSessionPing);
    this.signClient.on('session_delete', this.onSessionDelete);
  }

  async pair(uri: string) {
    await this.ensureInitialized();
    const { topic } = await this.signClient.core.pairing.pair({ uri });
    await this.signClient.core.pairing.activate({ topic });
  }

  async getPairings(): Promise<PairingTypes.Struct[]> {
    await this.ensureInitialized();

    return this.signClient.core.pairing.getPairings();
  }

  async disconnectPairing(topic: string) {
    console.log('Disconnecting pairing:', topic);
    await this.ensureInitialized();
    this.signClient.core.pairing.disconnect({ topic });
    console.log('Disconnected pairing:', topic);
  }

  // Implement the event handlers here
  private onSessionAuthenticate = async (payload: any) => {
    console.log('Session authenticated:', payload);
  }
  private onSessionProposal = async (event: any) => {

    console.log('Session onSessionProposal:', event);

    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex === null) {
      return;
    }
    const accountContract = await this.accountService.retrieveContractAddress(currentAccountIndex);

    if(!accountContract){
      alert('Please generate the contract address first.');
      return;
    }

    const { id, params } = event;

    // You can approve or reject the proposal based on user interaction
    const namespaces = {
      eip1193: {
        accounts: [`aztec:1:${accountContract}`],
        methods: ['aztec_accounts', 'aztec_experimental_createSecretHash', 'aztec_createAuthWitness', 'aztec_sendTransaction'],
        events: ['accountsChanged'],
      },
    };

    try {
      const { topic, acknowledged } = await this.signClient.approve({ id, namespaces });
      const session = await acknowledged()

      //console.log('Session Acknowledged:', session.acknowledged);
    } catch (error) {
      console.error('Failed to approve session:', error);
    }
  }

  private onSessionEvent = (event: any) => {
    const { id, topic, params } = event;
    console.log('Session onSessionEvent event:', params);
  }
  private onSessionRequest = async (event: any) => {
    const { id, topic, params } = event;
    console.log('Session onSessionRequest:', event);

    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex === null) {
      return;
    }

    const accountContract = await this.accountService.retrieveContractAddress();

    if (accountContract) {
      console.log('Contract Address:', accountContract);

      try {
        console.log('Preparing to send response...');

        let result: any;
        let currentWallet: AccountWallet | null;
        let currentWalletAddress: string;
        let innerHash: Fr;
        let intent: { consumer: AztecAddress, innerHash: Fr };
        let message_: string;
        let contract: string;
        let from_: string;
        let chainId: Fr;
        let version: Fr;
        let messageHash: Fr;
        let witness: AuthWitness;
        let pxe: PXE = await PXEFactory.getPXEInstance();  


        switch (params.request.method) {
          case 'aztec_accounts':
            result = [accountContract.toString()];
            break;
          case 'aztec_experimental_createSecretHash':
            console.log('aztec_experimental_createSecretHash');

            if (!(await this.checkPairing(topic))) {
              throw new Error('No valid pairing found for this topic.');
            }

            contract = params.request.params[0].contract;

            from_ = params.request.params[0].from;

            currentWallet = await this.accountService.getCurrentWallet();
            if (!currentWallet) {
              throw new Error('No wallet available');
            }
            
            currentWalletAddress = currentWallet.getAddress().toString();

            

            if (from_ !== currentWalletAddress) {
              throw new Error(`Address mismatch: Request 'from' (${from_}) does not match current wallet address (${currentWalletAddress})`);
            }

            innerHash = computeInnerAuthWitHash([Fr.fromString(contract)]);
            intent = { 
              consumer: AztecAddress.fromString(contract), 
              innerHash : innerHash
            };

            chainId = await currentWallet.getChainId();
            version = await currentWallet.getVersion();
            messageHash = computeAuthWitMessageHash(intent, { chainId, version });
/*
            witness = await currentWallet.createAuthWit(messageHash);

            pxe = await PXEFactory.getPXEInstance();
            pxe.addAuthWitness(witness);
//            result = innerHash.toString();

            result = witness.toString();
*/
//            result = messageHash.toString();


            const secret = Fr.random();
            result = computeSecretHash(secret).toString();
            break;
          case 'aztec_createAuthWitness':
            console.log('aztec_createAuthWitness');

            if (!(await this.checkPairing(topic))) {
              throw new Error('No valid pairing found for this topic.');
            }

            from_ = params.request.params[0].from;
            message_ = params.request.params[0].message;


            currentWallet = await this.accountService.getCurrentWallet();
            if (!currentWallet) {
              throw new Error('No wallet available');
            }
            currentWalletAddress = currentWallet!.getAddress().toString();

            if (from_ !== currentWalletAddress) {
              throw new Error(`Address mismatch: Request 'from' (${from_}) does not match current wallet address (${currentWalletAddress})`);
            }

            witness = await currentWallet!.createAuthWit(Fr.fromString(message_));

            pxe.addAuthWitness(witness);

            result = witness.toString();
            break;
          case 'aztec_sendTransaction':
            console.log('aztec_sendTransaction');

            if (!(await this.checkPairing(topic))) {
              throw new Error('No valid pairing found for this topic.');
            }

            from_ = params.request.params[0].from;
            const calls = params.request.params[0].calls;
            const simulatePublic: boolean = params.request.params[0].simulatePublic === "true" ? true : false;

            currentWallet = await this.accountService.getCurrentWallet();
            if (!currentWallet) {
              throw new Error('No wallet available');
            }
            currentWalletAddress = currentWallet.getAddress().toString();

            if (from_ !== currentWalletAddress) {
              throw new Error(`Address mismatch: Request 'from' (${from_}) does not match current wallet address (${currentWalletAddress})`);
            }

            // Convert calls to FunctionCall objects
            const functionCalls: FunctionCall[] = calls.map((call: CallData) => new FunctionCall(
              call.name,
              AztecAddress.fromString(call.to),
              FunctionSelector.fromString(call.selector),
              call.type === 'private' ? FunctionType.PRIVATE : FunctionType.PUBLIC,
              call.isStatic,
              call.args.map(arg => Fr.fromString(arg)),
              [] // Assuming returnTypes is not provided in the input, use an empty array
            ));

            console.log('functionCalls:', functionCalls);

            const batchCallTx: BatchCall = new BatchCall(currentWallet, functionCalls);

            const txExecutionRequest: TxExecutionRequest = await  batchCallTx.create({skipPublicSimulation: !simulatePublic});



            console.log('Simulating transaction');
            let simulatedTx;
            try {
              simulatedTx = await pxe.simulateTx(txExecutionRequest, simulatePublic);

              //simulatedTx = await batchCallTx.simulate();
              console.log('Transaction simulated:', simulatedTx);
              
            } catch (error) {


              console.log('Proving transaction');
              console.error('Simulation failed:', error);
              simulatedTx = error;
            }

            // Create a modal to ask for permission, regardless of simulation success
            const userConfirmed = await this.showConfirmationModal(simulatedTx);
            

            if (userConfirmed) {
              console.log('Sending transaction');

              //let txBatch: TxHash;
              let txHash: TxHash;
              try {

                const proofTx = await pxe.proveTx(txExecutionRequest, simulatePublic);

                txHash = await pxe.sendTx(proofTx)

                console.log('Transaction sent, txHash:', txHash);

                //const sentTx: SentTx = (await batchCallTx.send({skipPublicSimulation: !simulatePublic}))
                //txBatch = await sentTx.getTxHash();
                //const receipt = await sentTx.wait();
                //console.log('Transaction sent, txBatch:', txBatch);
                //console.log('Transaction receipt:', receipt);


              } catch (error: any) {
                throw new Error(`Failed to send transaction: ${error.message}`);
              }

              //console.log('Transaction sent, txBatch:', txBatch);
              result = txHash.toString();
            } else {
              throw new Error('Transaction rejected by user');
            }
            break;
          default:
            throw new Error(`Unsupported method: ${params.request.method}`);
        }

        console.log('result:', result);

        await this.signClient.respond({
          topic: topic,
          response: {
            id: id,
            jsonrpc: "2.0",
            result: result,
          },
        });

        console.log('Session response sent successfully');
      } catch (error) {
        console.error('Error responding to session request:', error);
        // Respond with an error

        
        await this.signClient.respond({
          topic: topic,
          response: {
            id: id,
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
          },
        });
        
      }
    } else {
      alert("No contract address found. Please generate a contract address.");
    }
    this.uiManager.displayPairings();
  }

  private onSessionPing = (event: any) => {
    const { id, topic } = event;
    console.log('Session onSessionPing:', topic);
  }

  private onSessionDelete = () => {
    console.log('Session onSessionDelete');
    const accountInfoDiv = document.getElementById('accountInfo');
    if (accountInfoDiv) {
      accountInfoDiv.innerHTML = 'Wallet disconnected';
    }
  }

  private showConfirmationModal(simulatedTx: any): Promise<boolean> {
    console.log('simulatedTx:', simulatedTx);
    
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content simulation-modal">
          <h2>Comfirm Transaction?</h2>
          <div class="modal-actions">
            <button id="confirmTransfer" class="button primary-button">Confirm</button>
            <button id="cancelTransfer" class="button secondary-button">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.querySelector('#confirmTransfer')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(true);
      });

      modal.querySelector('#cancelTransfer')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
    });
  }

  private async checkPairing(topic: string): Promise<boolean> {
    const pairings = await this.getPairings();

    return true
    return pairings.some(pairing => pairing.topic === topic);
  }
}