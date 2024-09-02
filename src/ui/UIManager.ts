import { AccountService } from '../services/AccountService.js';
import { TokenService } from '../services/TokenService.js';
import { WalletConnectService } from '../services/WalletConnectService.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';
import { Fr } from "@aztec/aztec.js";
import { AztecAddress } from '@aztec/circuits.js';

export class UIManager {

  private accountService!: AccountService;
  private tokenService!: TokenService;
  private walletConnectService!: WalletConnectService;

  setTokenService(tokenService: TokenService) {
    this.tokenService = tokenService;
  }
  setAccountService(accountService: AccountService) {
    this.accountService = accountService;
  }
  setWalletConnectService(walletConnectService: WalletConnectService) {
    this.walletConnectService = walletConnectService;
  }

  constructor() {}

  setupUI() {
    this.setupEventListeners();
    this.updateAccountUI();
    this.displayPairings();
    this.addCopyClipboard();
  }

  private setupEventListeners() {
    document.getElementById('accountForm')?.addEventListener('submit', this.createAccountSubmit.bind(this));
    document.getElementById('exportKeys')?.addEventListener('click', this.exportKeys.bind(this));
    document.getElementById('importKeys')?.addEventListener('click', this.importKeys.bind(this));
    document.getElementById('connectAppButton')?.addEventListener('click', this.connectApp.bind(this));
    document.getElementById('createTokensButton')?.addEventListener('click', this.setupTokens.bind(this));
    
    this.setupTabNavigation();
    this.setAccountSelectionListener();
  }

  private async createAccountSubmit(event: Event) {
    event.preventDefault();
    const submitButton = document.querySelector('#accountForm button[type="submit"]') as HTMLButtonElement;
    submitButton.disabled = true;

    try {
      const secretKeyFr = await CryptoUtils.generateSecretKey();
      await this.accountService.createAccount(secretKeyFr);
      this.updateAccountUI();
    } catch (error) {
      console.error('Error during account creation:', error);
    } finally {
      submitButton.disabled = false;
    }
  }

  private async exportKeys() {
    const keys = await this.accountService.getSkKeysAtIndex();
    const keysJson = JSON.stringify(keys);
    const blob = new Blob([keysJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keys.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private async importKeys(event: Event) {
    event.preventDefault();
    const secretKey = prompt('Enter the secret key:', '0x-your-secret-key-here');
    if (!secretKey || secretKey.length !== 66) {
      alert('Invalid secret key. Please enter a 32-byte string in hex format.');
      return;
    }
    try {
      await this.accountService.createAccount(Fr.fromString(secretKey));
      this.updateAccountUI();
    } catch (error) {
      console.error('Error during account import:', error);
    }
  }

  private async connectApp(event: Event) {
    event.preventDefault();
    const walletConnectInput = document.getElementById('walletConnectLink') as HTMLInputElement;
    const uri = walletConnectInput.value;
    if (!uri) {
      alert('Please enter a WalletConnect URL.');
      return;
    }
    try {
      await this.walletConnectService.pair(uri);
      this.displayPairings();
    } catch (e) {
      console.error('Error occurred:', e);
      alert('Failed to connect wallet.');
    }
  }

  private async setupTokens(event: Event) {
    event.preventDefault();
    try {
      const createTokensButton = document.getElementById('createTokensButton');

      const wallet = await this.accountService.getCurrentWallet();
      if (wallet) {
        if (createTokensButton instanceof HTMLButtonElement) {
          createTokensButton.disabled = true;
          await this.tokenService.setupTokens(wallet);
          alert('Tokens have been set up successfully!');
        } else {
          console.error('createMintTokensButton is not a button element');
        }
      } else {
        alert('No wallet found. Please create or connect a wallet.');
      }
    } catch (error) {
      console.error('Error setting up tokens:', error);
      alert('Failed to set up tokens. Please try again.');
    }
  }

  public updateTokensTable(tokenRows: { name: string; balance: string; symbol: string }[]) {
    const tokensTableBody = document.getElementById('tokensTableBody');
    if (!tokensTableBody) {
      console.error('Tokens table body not found');
      return;
    }

    // Clear existing rows
    tokensTableBody.innerHTML = '';

    // Add new rows
    tokenRows.forEach(token => {
      const row = document.createElement('tr');
      
      const nameCell = document.createElement('td');
      nameCell.textContent = `${token.name} (${token.symbol})`;
      row.appendChild(nameCell);

      const sendCell = document.createElement('td');
      const sendButton = document.createElement('button');
      sendButton.textContent = 'Send';
      sendButton.addEventListener('click', () => this.handleSendToken(token));
      sendCell.appendChild(sendButton);
      row.appendChild(sendCell);

      const receiveCell = document.createElement('td');
      const receiveButton = document.createElement('button');
      receiveButton.textContent = 'Receive';
      receiveButton.addEventListener('click', () => this.handleReceiveToken(token));
      receiveCell.appendChild(receiveButton);
      row.appendChild(receiveCell);

      tokensTableBody.appendChild(row);
    });
  }

  private handleSendToken(token: { name: string; balance: string; symbol: string }) {
    // Implement send token functionality
    console.log(`Sending ${token.name}`);
    // You might want to open a modal or navigate to a send page here
  }

  private handleReceiveToken(token: { name: string; balance: string; symbol: string }) {
    // Implement receive token functionality
    console.log(`Receiving ${token.name}`);
    // You might want to display the user's address or a QR code here
  }

  private setupTabNavigation() {
    const tab1Button = document.getElementById('tab1Button');
    const tab2Button = document.getElementById('tab2Button');
    const tab1 = document.getElementById('tab1');
    const tab2 = document.getElementById('tab2');

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

  private async updateAccountUI() {
    const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement;
    accountSelect.innerHTML = '<option value="" disabled selected>Select an account</option>';

    const accounts = await this.accountService.getAccounts();
    
    accounts.forEach((account: AztecAddress, index: number) => {
      const option = document.createElement('option');
      option.value = index.toString();
      option.textContent = account.toString();
      accountSelect.appendChild(option);
    });

    // Select the current account in the dropdown
    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex !== null) {
      accountSelect.value = currentAccountIndex.toString();
    }
  }

  private setAccountSelectionListener() {
    const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement;
    accountSelect.addEventListener('change', (event) => {
      const selectedIndex = (event.target as HTMLSelectElement).selectedIndex - 1;
      if (selectedIndex >= 0) {
        this.accountService.setCurrentAccountIndex(selectedIndex);
      }
    });
  }

  private addCopyClipboard() {
    const copyButton = document.getElementById('copyAddressButton');
    if (!copyButton) {
      console.error('Copy address button not found');
      return;
    }
    copyButton.addEventListener('click', async () => {
      const contractAddress = await this.accountService.retrieveContractAddress();

      console.log(contractAddress);

      if (contractAddress) {
        navigator.clipboard.writeText(contractAddress.address.toString())
          .then(() => alert('Contract address copied to clipboard!'))
          .catch(err => console.error('Failed to copy: ', err));
      } else {
        alert('No contract address available to copy.');
      }
    });
  }

  async displayPairings() {
    const pairingList = document.getElementById('pairingList')!;
    pairingList.innerHTML = '';

    try {
      const pairings = await this.walletConnectService.getPairings();

      pairings.forEach((pairing) => {
        const pairingItem = document.createElement('li');
        pairingItem.id = `pairing-${pairing.topic}`;

        const pairingInfo = document.createElement('div');
        pairingInfo.innerHTML = `
          <p><strong>Active:</strong> ${pairing.active}</p>
          <p><strong>Peer Name:</strong> ${pairing.peerMetadata?.name}</p>
          <p><strong>Peer Description:</strong> ${pairing.peerMetadata?.description}</p>
          <p><strong>Peer URL:</strong> ${pairing.peerMetadata?.url}</p>
        `;

        const disconnectButton = document.createElement('button');
        disconnectButton.textContent = 'Disconnect';
        disconnectButton.addEventListener('click', () => {
          this.walletConnectService.disconnectPairing(pairing.topic);
          this.displayPairings();
        });

        pairingItem.appendChild(pairingInfo);
        pairingItem.appendChild(disconnectButton);
        pairingList.appendChild(pairingItem);
      });
    } catch (error) {
      console.error('Error displaying pairings:', error);
      pairingList.innerHTML = '<li>Error loading pairings. Please try again later.</li>';
    }
  }
}