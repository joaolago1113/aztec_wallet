import { AccountService } from '../services/AccountService.js';
import { TokenService } from '../services/TokenService.js';
import { WalletConnectService } from '../services/WalletConnectService.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';
import { Fr } from "@aztec/aztec.js";
import { AztecAddress } from '@aztec/circuits.js';
import { TokenContract } from '@aztec/noir-contracts.js';

export class UIManager {

  private accountService!: AccountService;
  private tokenService!: TokenService;
  private walletConnectService!: WalletConnectService;
  private modalElement: HTMLElement | null = null;

  setTokenService(tokenService: TokenService) {
    this.tokenService = tokenService;
  }
  setAccountService(accountService: AccountService) {
    this.accountService = accountService;
  }
  setWalletConnectService(walletConnectService: WalletConnectService) {
    this.walletConnectService = walletConnectService;
  }

  constructor() {
    this.createModal();
  }

  private createModal() {
    this.modalElement = document.createElement('div');
    this.modalElement.className = 'modal';
    this.modalElement.style.display = 'none';
    this.modalElement.innerHTML = `
      <div class="modal-content">
        <span class="close">&times;</span>
        <h2>Create/Mint Token</h2>
        <form id="createMintTokenForm">
          <div class="form-group">
            <label for="tokenName">Token Name</label>
            <input type="text" id="tokenName" required>
          </div>
          <div class="form-group">
            <label for="tokenSymbol">Token Symbol</label>
            <input type="text" id="tokenSymbol" required>
          </div>
          <div class="form-group">
            <label for="tokenAmount">Amount to Mint</label>
            <input type="number" id="tokenAmount" required>
          </div>
          <button type="submit" id="createMintTokenButton">Create/Mint</button>
        </form>
      </div>
    `;
    document.body.appendChild(this.modalElement);

    const form = this.modalElement.querySelector('#createMintTokenForm');
    form?.addEventListener('submit', this.handleCreateMintTokenSubmit.bind(this));

    const closeButton = this.modalElement.querySelector('.close');
    closeButton?.addEventListener('click', this.closeModal.bind(this));

    // Add CSS for the modal
    const style = document.createElement('style');
    style.textContent = `
      .modal {
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0,0,0,0.4);
      }
      .modal-content {
        background-color: #1a1a1a;
        color: #ffffff;
        margin: 10% auto;
        padding: 20px;
        border: 1px solid #888;
        width: 90%;
        max-width: 400px;
        border-radius: 10px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      }
      .close {
        color: #aaa;
        float: right;
        font-size: 28px;
        font-weight: bold;
        cursor: pointer;
      }
      .close:hover,
      .close:focus {
        color: #fff;
        text-decoration: none;
        cursor: pointer;
      }
      #createMintTokenForm .form-group {
        margin-bottom: 15px;
      }
      #createMintTokenForm label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
      }
      #createMintTokenForm input {
        width: 100%;
        padding: 8px;
        border: 1px solid #444;
        background-color: #2a2a2a;
        color: #fff;
        border-radius: 4px;
        box-sizing: border-box;
      }
      #createMintTokenForm button {
        width: 100%;
        padding: 10px;
        background-color: #3498db;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        transition: background-color 0.3s;
      }
      #createMintTokenForm button:hover {
        background-color: #2980b9;
      }
    `;
    document.head.appendChild(style);
  }

  showCreateMintTokenPopup() {
    if (this.accountService.getCurrentAccountIndex() === null) {
      alert("No account created yet. Please create an account before creating or minting tokens.");
      return;
    }

    if (this.modalElement) {
      this.modalElement.style.display = 'block';
    }
  }

  private handleCreateMintTokenSubmit(event: Event) {
    event.preventDefault();
    const nameInput = document.getElementById('tokenName') as HTMLInputElement;
    const symbolInput = document.getElementById('tokenSymbol') as HTMLInputElement;
    const amountInput = document.getElementById('tokenAmount') as HTMLInputElement;
    const submitButton = document.querySelector('#createMintTokenForm button[type="submit"]') as HTMLButtonElement;

    const tokenData = {
      name: nameInput.value,
      symbol: symbolInput.value,
      amount: amountInput.value
    };

    // Disable the button
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';

    this.tokenService.createOrMintToken(tokenData)
      .then(() => {
        this.closeModal();
      })
      .catch(error => {
        console.error('Detailed error in handleCreateMintTokenSubmit:', error);
        let errorMessage = 'Failed to create/mint token. ';
        if (error instanceof Error) {
          errorMessage += error.message;
        } else {
          errorMessage += 'Unknown error occurred.';
        }
        alert(errorMessage);
      })
      .finally(() => {
        // Re-enable the button and reset its text
        submitButton.disabled = false;
        submitButton.textContent = 'Create/Mint';

        // Clear the form fields
        nameInput.value = '';
        symbolInput.value = '';
        amountInput.value = '';
      });
  }

  private closeModal() {
    if (this.modalElement) {
      this.modalElement.style.display = 'none';
    }
  }

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
    document.getElementById('createTokensButton')?.addEventListener('click', () => {
      this.showCreateMintTokenPopup();
    });
    
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
      await this.updateAccountUI();
      
      // Get the current wallet and update balances
      const currentWallet = await this.accountService.getCurrentWallet();
      if (currentWallet) {
        await this.tokenService.updateBalancesForNewAccount(currentWallet);
      }
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

  public updateTokensTable(tokenRows: { name: string; symbol: string; balance: { public: string; private: string } }[]) {
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

      const balanceCell = document.createElement('td');
      balanceCell.innerHTML = `
        <div class="balance-container">
          <div class="balance-item">
            <span class="balance-label">Public:</span>
            <span class="balance-value">${token.balance.public}</span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Private:</span>
            <span class="balance-value">${token.balance.private}</span>
          </div>
        </div>
      `;
      row.appendChild(balanceCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'actions-cell';
      
      const sendButton = document.createElement('button');
      sendButton.textContent = 'Send';
      sendButton.className = 'action-button send-button';
      sendButton.addEventListener('click', () => this.handleSendToken(token));
      
      const receiveButton = document.createElement('button');
      receiveButton.textContent = 'Receive';
      receiveButton.className = 'action-button receive-button';
      receiveButton.addEventListener('click', () => this.handleReceiveToken(token));
      
      actionsCell.appendChild(sendButton);
      actionsCell.appendChild(receiveButton);
      row.appendChild(actionsCell);

      const shieldUnshieldCell = document.createElement('td');
      shieldUnshieldCell.className = 'shield-unshield-cell';

      const shieldButton = document.createElement('button');
      shieldButton.textContent = 'Shield';
      shieldButton.className = 'action-button shield-button';
      shieldButton.addEventListener('click', () => this.handleShieldToken(token));

      const unshieldButton = document.createElement('button');
      unshieldButton.textContent = 'Unshield';
      unshieldButton.className = 'action-button unshield-button';
      unshieldButton.addEventListener('click', () => this.handleUnshieldToken(token));

      shieldUnshieldCell.appendChild(shieldButton);
      shieldUnshieldCell.appendChild(unshieldButton);
      row.appendChild(shieldUnshieldCell);

      tokensTableBody.appendChild(row);
    });

    // Update CSS for the new layout
    const style = document.createElement('style');
    style.textContent = `
      .balance-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
      .balance-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        background-color: #2a2a2a;
        padding: 5px 10px;
        border-radius: 5px;
      }
      .balance-label {
        font-size: 0.8em;
        color: #888;
      }
      .balance-value {
        font-weight: bold;
      }
      .actions-cell {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .action-button {
        padding: 5px 10px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        transition: background-color 0.3s;
        width: 100%;
      }
      .send-button {
        background-color: #3498db;
        color: white;
      }
      .send-button:hover {
        background-color: #2980b9;
      }
      .receive-button {
        background-color: #2ecc71;
        color: white;
      }
      .receive-button:hover {
        background-color: #27ae60;
      }
      .loading-spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin: 20px auto;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .shield-unshield-cell {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .shield-button {
        background-color: #9b59b6;
        color: white;
      }
      .shield-button:hover {
        background-color: #8e44ad;
      }
      .unshield-button {
        background-color: #e67e22;
        color: white;
      }
      .unshield-button:hover {
        background-color: #d35400;
      }
    `;
    document.head.appendChild(style);
  }

  private async handleSendToken(token: { name: string; symbol: string; balance: { public: string; private: string } }) {
    const recipient = prompt(`Enter the recipient's address for ${token.symbol}:`);
    if (!recipient) return;

    const amount = prompt(`Enter the amount of ${token.symbol} to send:`);
    if (!amount) return;

    const isPrivate = confirm("Do you want to send from your private balance? Click OK for private, Cancel for public.");

    try {
      this.showLoadingSpinner();
      await this.tokenService.sendToken(token, recipient, amount, isPrivate);
      alert(`Successfully sent ${amount} ${token.symbol} to ${recipient}`);
    } catch (error) {
      console.error('Error sending tokens:', error);
      alert(`Failed to send tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.hideLoadingSpinner();
    }
  }

  private async handleReceiveToken(token: { name: string; symbol: string; balance: { public: string; private: string } }) {
    try {
      const address = await this.tokenService.getReceiveAddress();
      
      // Create a modal or dialog to display the address
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.left = '50%';
      modal.style.top = '50%';
      modal.style.transform = 'translate(-50%, -50%)';
      modal.style.backgroundColor = '#fff';
      modal.style.padding = '20px';
      modal.style.borderRadius = '10px';
      modal.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      modal.style.zIndex = '1000';
      modal.style.color = '#000';

      modal.innerHTML = `
        <h3>Your ${token.symbol} Receiving Address</h3>
        <p>${address}</p>
        <button id="copyAddress">Copy Address</button>
        <button id="closeModal">Close</button>
      `;

      document.body.appendChild(modal);

      document.getElementById('copyAddress')?.addEventListener('click', () => {
        navigator.clipboard.writeText(address).then(() => {
          alert('Address copied to clipboard!');
        });
      });

      document.getElementById('closeModal')?.addEventListener('click', () => {
        document.body.removeChild(modal);
      });
    } catch (error) {
      console.error('Error displaying receive address:', error);
      alert(`Failed to display receive address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private handleShieldToken(token: { name: string; symbol: string; balance: { public: string; private: string } }) {
    const amount = prompt(`Enter the amount of ${token.symbol} to shield:`);
    if (amount) {
      this.tokenService.shieldToken(token, amount)
        .then(() => {
          alert(`Successfully shielded ${amount} ${token.symbol}`);
          this.tokenService.updateTable(); // Refresh the table
        })
        .catch(error => {
          console.error('Error shielding tokens:', error);
          alert(`Failed to shield tokens: ${error.message}`);
        });
    }
  }

  private handleUnshieldToken(token: { name: string; symbol: string; balance: { public: string; private: string } }) {
    const amount = prompt(`Enter the amount of ${token.symbol} to unshield:`);
    if (amount) {
      this.tokenService.unshieldToken(token, amount)
        .then(() => {
          alert(`Successfully unshielded ${amount} ${token.symbol}`);
          this.tokenService.updateTable(); // Refresh the table
        })
        .catch(error => {
          console.error('Error unshielding tokens:', error);
          alert(`Failed to unshield tokens: ${error.message}`);
        });
    }
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
    accountSelect.addEventListener('change', async (event) => {
      const selectedIndex = (event.target as HTMLSelectElement).selectedIndex - 1;
      if (selectedIndex >= 0) {
        await this.accountService.setCurrentAccountIndex(selectedIndex);
        const currentWallet = await this.accountService.getCurrentWallet();
        if (currentWallet) {
          await this.tokenService.updateBalancesForNewAccount(currentWallet);
        }
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

  public showLoadingSpinner() {
    const tokensTableBody = document.getElementById('tokensTableBody');
    if (tokensTableBody) {
      tokensTableBody.innerHTML = '<tr><td colspan="3"><div class="loading-spinner"></div></td></tr>';
    }
  }

  public hideLoadingSpinner() {
    this.tokenService.updateTable();
  }
}