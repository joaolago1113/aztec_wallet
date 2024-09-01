import { SignClient } from '@walletconnect/sign-client';
import { PairingTypes } from '@walletconnect/types';
import { AccountService } from './AccountService.js';
import { UIManager } from '../ui/UIManager.js';

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
    await this.ensureInitialized();
    this.signClient.core.pairing.disconnect({ topic });
  }

  // Implement the event handlers here
  private onSessionAuthenticate = async (payload: any) => {
    console.log('Session authenticated:', payload);
  }

  private onSessionProposal = async (event: any) => {


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
    console.log('Session proposal received:', params);

    // Example: Display proposal details in a modal
    console.log(params);
    console.log(event);


    // You can approve or reject the proposal based on user interaction
    const namespaces = {
      eip1193: {
        accounts: [`aztec:1:${accountContract}`],
        methods: ['aztec_accounts'],
        events: ['accountsChanged'],
      },
    };

    try {
      const { topic, acknowledged } = await this.signClient.approve({ id, namespaces });
      const session = await acknowledged()

      console.log('Session Acknowledged:', session.acknowledged);
    } catch (error) {
      console.error('Failed to approve session:', error);
    }
  }

  private onSessionEvent = (event: any) => {
    const { id, topic, params } = event;
    console.log('Session event:', params);
  }

  private onSessionRequest = async (event: any) => {
    const { id, topic, params } = event;

    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex === null) {
      return;
    }

    const accountContract = await this.accountService.retrieveContractAddress();

    if (accountContract) {

      console.log('Contract Address:', accountContract);

      try {
        console.log('Preparing to send response...');
        console.log('Response Data:', {
          id: id,
          jsonrpc: "2.0",
          result: accountContract.toString(),
        });

        await this.signClient.respond({
          topic: topic,
          response: {
            id: id,
            jsonrpc: "2.0",
            result: [accountContract.toString()],  
          },
        });
  
        this.uiManager.displayPairings();

        console.log('Session response sent successfully');
      } catch (error) {
        console.error('Error responding to session request:', error);
      }
    } else {
      alert("No contract address found. Please generate a contract address.");
    }
  }

  private onSessionPing = (event: any) => {
    const { id, topic } = event;
    console.log('Session ping received:', topic);
  }

  private onSessionDelete = () => {
    console.log('Session deleted');
    const accountInfoDiv = document.getElementById('accountInfo');
    if (accountInfoDiv) {
      accountInfoDiv.innerHTML = 'Wallet disconnected';
    }
  }
}