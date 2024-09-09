import { SignClient } from '@walletconnect/sign-client';
import { PairingTypes } from '@walletconnect/types';
import { AccountService } from './AccountService.js';
import { UIManager } from '../ui/UIManager.js';
import { type AccountWallet, SentTx, Fr, computeAuthWitMessageHash, computeInnerAuthWitHash, computeSecretHash, AztecAddress, Note, ExtendedNote  } from '@aztec/aztec.js';
import { PXEFactory } from '../factories/PXEFactory.js';
import { AuthWitness, PXE } from '@aztec/aztec.js';
import { FunctionType } from '@aztec/foundation/abi';
import { TxHash, BatchCall, FunctionCall, FunctionSelector } from '@aztec/aztec.js';
import { ExecutionRequestInit } from '@aztec/aztec.js/entrypoint';
import { EngineTypes } from '@walletconnect/types';
import { SessionTypes } from '@walletconnect/types';
import { TxExecutionRequest, type TxReceipt } from '@aztec/circuit-types';
import { TokenContract } from '@aztec/noir-contracts.js';


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
  private approvedSessions: Map<string, { topic: string, expiryTimestamp: number }> = new Map();
  
  constructor(
    private projectId: string, 
    private metadata: any, 
    private accountService: AccountService,
    private uiManager: UIManager
  ) {
    this.signClient = {} as InstanceType<typeof SignClient>; // Temporary initialization
    this.initializationPromise = this.initializeSignClient(this.projectId, this.metadata);
    
    this.loadApprovedSessions();
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

  private saveApprovedSessions() {
    localStorage.setItem('approvedSessions', JSON.stringify(Array.from(this.approvedSessions.entries())));
  }

  private loadApprovedSessions() {
    const savedSessions = localStorage.getItem('approvedSessions');
    if (savedSessions) {
      this.approvedSessions = new Map(JSON.parse(savedSessions));
    }
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
    await this.signClient.core.pairing.disconnect({ topic });
    
    // Remove the disconnected session from approvedSessions
    for (const [address, session] of this.approvedSessions.entries()) {
      if (session.topic === topic) {
        this.approvedSessions.delete(address);
        break;
      }
    }
    this.saveApprovedSessions(); // Save the updated sessions to localStorage
    
    console.log('Disconnected pairing:', topic);
  }

  // Implement the event handlers here
  private onSessionAuthenticate = async (payload: any) => {
    console.log('Session authenticated:', payload);
  }
  private onSessionProposal = async (event: any) => {
    console.log('Session onSessionProposal:', event);

    const { id, params } = event;
    const { requiredNamespaces, optionalNamespaces, relays, proposer, expiryTimestamp } = params;

    const wallet = await this.accountService.getCurrentWallet();
      
    if (!wallet) {
      throw new Error(`No wallet found.`);
    }



    const accountCompleteAddress = wallet.getCompleteAddress();

    // Define the namespaces we support
    const namespaces: SessionTypes.Namespaces = {
      eip1193: {
        chains: [`aztec:1`],
        accounts: [`aztec:1:${accountCompleteAddress}`],
        methods: ['aztec_accounts', 'aztec_experimental_createSecretHash', 'aztec_createAuthWitness', 'aztec_sendTransaction', 'aztec_experimental_tokenRedeemShield'],
        events: ['accountsChanged'],
      },
    };

    try {

      const approveParams: EngineTypes.ApproveParams = {
        id: id,
        namespaces: namespaces,
        relayProtocol: relays[0].protocol,
      };

      const { topic, acknowledged } = await this.signClient.approve(approveParams);
      await acknowledged();
      // Save the approved session
      this.approvedSessions.set(accountCompleteAddress.address.toString(), { topic, expiryTimestamp });
      this.saveApprovedSessions(); // Save to localStorage

      console.log('Session proposal approved');
    } catch (error) {
      console.error('Failed to approve session:', error);
      // You might want to reject the session here
      await this.signClient.reject({ id, reason: { code: 0, message: 'User rejected the session' } });
    }
  }

  private onSessionEvent = (event: any) => {
    const { id, topic, params } = event;
    console.log('Session onSessionEvent event:', params);
  }
  private onSessionRequest = async (event: any) => {
    const { id, topic, params } = event;
    console.log('Session onSessionRequest:', event);
    try {
      console.log('Preparing to send response...');

      let result: any;
      let from: string;
      let wallet: AccountWallet | null;

      switch (params.request.method) {
        case 'aztec_accounts':
          wallet = await this.accountService.getCurrentWallet()
      
          if (!wallet) {
            throw new Error(`No wallet found.`);
          }
      
          result = [wallet.getCompleteAddress().toString()];
          break;

        case 'aztec_experimental_createSecretHash':
          console.log('aztec_experimental_createSecretHash');
          from = params.request.params[0].from;

          const contract2 = params.request.params[0].contract;

          if (!(await this.checkPairing(topic, from))) {
            throw new Error('No valid pairing found for this topic.');
          }

          const privateKey = await this.accountService.getPrivateKey(from);
          const derivedSecret = this.deriveShieldSecret(privateKey, 0);
          const shieldSecretHashIn = computeSecretHash(derivedSecret);

          console.log('shieldSecretHash:', shieldSecretHashIn);
          result = shieldSecretHashIn.toString();
          break;
        case 'aztec_createAuthWitness':
          console.log('aztec_createAuthWitness');

          from = params.request.params[0].from;

          if (!(await this.checkPairing(topic, from))) {
            throw new Error('No valid pairing found for this topic.');
          }
          const message = params.request.params[0].message;

          wallet = await this.accountService.getWalletByAddress(from);
          if (!wallet) {
            throw new Error(`No wallet found for address ${from}`);
          }

          const witness = await wallet!.createAuthWit(Fr.fromString(message));

          wallet!.addAuthWitness(witness);

          result = witness.toString();
          break;
        case 'aztec_sendTransaction':
          console.log('aztec_sendTransaction');

          from = params.request.params[0].from;

          if (!(await this.checkPairing(topic, from))) {
            throw new Error('No valid pairing found for this topic.');
          }

          wallet = await this.accountService.getWalletByAddress(from);

          if (!wallet) {
            throw new Error(`No wallet found for address ${from}`);
          }

          const calls = params.request.params[0].calls;
          const simulatePublic: boolean = params.request.params[0].simulatePublic === "true" ? true : false;

          console.log('simulatePublic:', simulatePublic);

          console.log('calls:', calls);

          const functionCalls: FunctionCall[] = calls.map((call: any) => 
            new FunctionCall(
              call.name,
              AztecAddress.fromString(call.to),
              FunctionSelector.fromString(call.selector),
              call.type === 'private' ? FunctionType.PRIVATE : FunctionType.PUBLIC,
              call.isStatic,
              call.args.map((arg: string) => Fr.fromString(arg)),
              call.returnTypes.map((arg: string) => Fr.fromString(arg))
            )
          );
          console.log('functionCalls:', functionCalls);

          const txRequest = await wallet.createTxExecutionRequest({ calls: functionCalls });

          console.log('Simulating transaction');
          let simulatedTx;
          try {
            wallet.simulateTx(txRequest, simulatePublic);
            console.log('Transaction simulated:', simulatedTx);
          } catch (error) {
            console.log('Proving transaction');
            console.error('Simulation failed:', error);
            simulatedTx = error;
          }

          const userConfirmed = await this.showConfirmationModal(simulatedTx);

          if (userConfirmed) {
            console.log('Sending transaction');

            let txHash: TxHash;
            try {
              const txProof = await wallet.proveTx(txRequest, simulatePublic);
              txHash = await new SentTx(
                wallet,
                wallet.sendTx(txProof),
              ).getTxHash();
            } catch (error: any) {
              throw new Error(`Failed to send transaction: ${error.message}`);
            }

            result = txHash.toString();
          } else {
            throw new Error('Transaction rejected by user');
          }
          break;
        case 'aztec_experimental_tokenRedeemShield':
          console.log('aztec_experimental_tokenRedeemShield');

          from = params.request.params[0].from;

          if (!(await this.checkPairing(topic, from))) {
            throw new Error('No valid pairing found for this topic.');
          }

          const amount = Fr.fromString(params.request.params[0].amount);
          const secretHash = Fr.fromString(params.request.params[0].secretHash);
          const tokenAddress = Fr.fromString(params.request.params[0].token);
          const txHash = TxHash.fromString(params.request.params[0].txHash);

          wallet = await this.accountService.getWalletByAddress(from);

          if (!wallet) {
            throw new Error(`No wallet found for address ${from}`);
          }

          const privateKeyForRedeem = await this.accountService.getPrivateKey(from);
          const derivedSecretForRedeem = this.deriveShieldSecret(privateKeyForRedeem, 0);
          const shieldSecretHash = computeSecretHash(derivedSecretForRedeem);

          if (shieldSecretHash.toString() !== secretHash.toString()) {
            throw new Error('Derived secret does not match the provided secret');
          }

          const tokenContract = await TokenContract.at(tokenAddress, wallet);

          const note = new Note([amount, secretHash]);
          const extendedNote = new ExtendedNote(
            note,
            wallet!.getAddress(),
            tokenAddress,
            TokenContract.storage.pending_shields.slot,
            TokenContract.notes.TransparentNote.id,
            txHash
          );
      
          await wallet!.addNote(extendedNote);

          try {
            const tx = await tokenContract.methods.redeem_shield( Fr.fromString(from), amount, derivedSecretForRedeem ).send();
            await tx.wait();
            result = (await tx.getTxHash()).toString();
          } catch (error) {
            throw new Error(`Failed to redeem shield: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  private async checkPairing(topic: string, from: string): Promise<boolean> {
    console.log('topic:', topic);
    console.log('from:', from);

    const approvedSession = this.approvedSessions.get(from);
    if (!approvedSession || approvedSession.topic !== topic) {
      throw new Error('Invalid session for this account');
    }

    console.log('now: ' + Date.now());
    console.log('expiryTimestamp: ' + approvedSession.expiryTimestamp);

    if (Date.now() >= approvedSession.expiryTimestamp * 10000) {
      this.approvedSessions.delete(from);
      this.saveApprovedSessions();
      throw new Error('Session has expired');
    }

    return true;
  }

  private deriveShieldSecret(privateKey: Fr, nonce: number): Fr {
    return computeSecretHash(new Fr(privateKey.toBigInt() + BigInt(nonce)));
  }
}