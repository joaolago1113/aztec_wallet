import { AccountService } from '../services/AccountService.js';
import { TokenService } from '../services/TokenService.js';
import { WalletConnectService } from '../services/WalletConnectService.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';
import { Fr } from "@aztec/aztec.js";
import { AztecAddress } from '@aztec/circuits.js';
import { TransactionService } from '../services/TransactionService.js';
import { TokenContract } from '@aztec/noir-contracts.js';
import { PXEFactory } from '../factories/PXEFactory.js';

interface SimulationResult {
  isPrivate: boolean;
  fromBalanceBefore: bigint;
  toBalanceBefore: bigint;
  fromBalanceAfter: bigint;
  toBalanceAfter: bigint;
  gasEstimate: bigint;
  error?: string;
}

export class UIManager {
  private accountService!: AccountService;
  private tokenService!: TokenService;
  private walletConnectService!: WalletConnectService;
  private transactionService!: TransactionService;
  private debounceTimer: NodeJS.Timeout | null = null;

  setTokenService(tokenService: TokenService) {
    this.tokenService = tokenService;
  }
  setAccountService(accountService: AccountService) {
    this.accountService = accountService;
  }
  setWalletConnectService(walletConnectService: WalletConnectService) {
    this.walletConnectService = walletConnectService;
  }
  setTransactionService(transactionService: TransactionService) {
    this.transactionService = transactionService;
  }

  constructor() {
    // Remove the call to createModal if it was here
  }

  private async handlePageChange() {
    const hash = window.location.hash.slice(1) || 'accounts'; // Default to 'accounts' if hash is empty
    console.log('Page changed to:', hash);
    
    // Add this line to initialize account info on every page change
    await this.initializeAccountInfo();
    
    switch (hash) {
      case 'accounts':
        await this.updateAccountsPage();
        break;
      case 'tokens':
        await this.updateTokensPage();
        break;
      case 'apps':
        await this.updateAppsPage();
        break;
      case 'transactions':
        await this.updateTransactionsPage();
        break;
      // Add other cases for different pages if needed
    }
  }

  private async updateAccountsPage() {
    await this.updateAccountUI();
    this.setAccountSelectionListener();
    // Any other account-specific updates
  }

  private async updateTokensPage() {
    console.log('Updating Tokens page');
    const currentWallet = await this.accountService.getCurrentWallet();
    if (currentWallet) {
      try {
        await this.tokenService.updateBalancesForNewAccount(currentWallet);
      } catch (error) {
        console.error('Error updating balances for new account:', error);
        alert('Failed to update token balances. Please try again.');
      }
    } else {
      console.warn('No current wallet available');
    }
  }

  private async updateAppsPage() {
    console.log('Updating Apps page');
    await this.displayPairings();
  }

  private async updateTransactionsPage() {
    console.log('Updating Transactions page');
    await this.transactionService.fetchTransactions();
    this.displayTransactions();
  }

  private displayTransactions() {
    const transactionsTableBody = document.getElementById('transactionsTableBody');
    if (!transactionsTableBody) {
      console.debug('Transactions table body not found. This is expected if not on the Transactions page.');
      return;
    }

    const transactions = this.transactionService.getTransactions();
    console.log('Displaying transactions:', transactions);
    transactionsTableBody.innerHTML = '';

    if (transactions.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="4">No transactions found</td>';
      transactionsTableBody.appendChild(row);
    } else {
      transactions.forEach(transaction => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${transaction.type}</td>
          <td>${transaction.amount} ${transaction.token}</td>
          <td>${transaction.status}</td>
          <td>${new Date(transaction.timestamp).toLocaleString()}</td>
        `;
        transactionsTableBody.appendChild(row);
      });
    }
  }

  private setupDynamicEventListeners() {
    document.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;

      if (target.matches('#accountForm button[type="submit"]')) {
        event.preventDefault();
        await this.createAccountSubmit(event);
      } else if (target.matches('#exportKeys')) {
        await this.exportKeys(event);
      } else if (target.matches('#importKeys')) {
        await this.importKeys(event);
      } else if (target.matches('#logoutLink')) {
        await this.handleLogout();
      } else if (target.matches('#connectAppButton')) {
        await this.handleConnectApp();
      } else if (target.matches('#rotateNullifierKey')) {
        await this.rotateNullifierKey(event);
      }
    });

    document.addEventListener('submit', async (event) => {
      const target = event.target as HTMLElement;
      if (target.matches('#createMintTokenForm')) {
        event.preventDefault();
        await this.handleCreateMintTokenSubmit(event);
      }
    });
  }

  private async handleLogout() {
    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex !== null) {
      try {
        await this.accountService.removeAccount(currentAccountIndex);
        await this.accountService.setCurrentAccountIndex(null);
        await this.updateAccountUI();
        this.tokenService.resetTokens();
      } catch (error) {
        console.error('Error during logout:', error);
        alert('Failed to log out. Please try again.');
      }
    } else {
      alert('No account is currently selected.');
    }
  }

  private async createAccountSubmit(event: Event) {
    event.preventDefault();
    const submitButton = (event.target as HTMLElement).closest('button');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Creating...';
    }

    try {
      const secretKeyFr = await CryptoUtils.generateSecretKey();
      await this.accountService.createAccount(secretKeyFr);
      await this.updateAccountUI();
      
      const currentWallet = await this.accountService.getCurrentWallet();
      if (currentWallet) {
        await this.tokenService.updateBalancesForNewAccount(currentWallet);
      }
    } catch (error) {
      console.error('Error during account creation:', error);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Create New Account';
      }
    }
  }

  private async exportKeys(event: Event) {
    event.preventDefault();
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

    if(secretKey === null) {
      return;
    }
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

  private async handleConnectApp() {
    const walletConnectLinkInput = document.getElementById('walletConnectLink') as HTMLInputElement;
    if (walletConnectLinkInput) {
      const uri = walletConnectLinkInput.value.trim();
      if (uri) {
        try {
          await this.walletConnectService.pair(uri);
          this.displayPairings();
          walletConnectLinkInput.value = ''; // Clear the input after successful connection
        } catch (error) {
          console.error('Failed to connect:', error);
          alert('Failed to connect. Please check the URL and try again.');
        }
      } else {
        alert('Please enter a valid WalletConnect URL.');
      }
    }
  }

  public async displayPairings() {
    const pairingList = document.getElementById('pairingList');
    if (pairingList) {
      pairingList.innerHTML = ''; // Clear existing pairings

      const pairings = await this.walletConnectService.getPairings();

      pairings.forEach((pairing) => {
        const pairingItem = document.createElement('div');
        pairingItem.className = 'pairing-item';
        pairingItem.innerHTML = `
          <p><strong>Peer:</strong> ${pairing.peerMetadata?.name || 'Unknown'}</p>
          <p><strong>URL:</strong> ${pairing.peerMetadata?.url || 'N/A'}</p>
          <p><strong>Active:</strong> ${pairing.active ? 'Yes' : 'No'}</p>
          <button class="button secondary-button disconnect-button" data-topic="${pairing.topic}">Disconnect</button>
        `;
        pairingList.appendChild(pairingItem);

        const disconnectButton = pairingItem.querySelector('.disconnect-button');
        if (disconnectButton) {
          disconnectButton.addEventListener('click', async () => {
            await this.walletConnectService.disconnectPairing(pairing.topic);
            this.displayPairings(); // Refresh the list after disconnecting
          });
        }
      });
    }
  }

  private loadAccountState() {
    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex !== null) {
      this.updateAccountUI();
    }
  }

  public updateTokensTable(tokenRows: { name: string; symbol: string; balance: { public: string; private: string } }[]) {
    console.log('Updating tokens table with rows:', tokenRows);
    const tokensTableBody = document.getElementById('tokensTableBody');
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (!tokensTableBody || !loadingSpinner) {
      console.debug('Tokens table body or loading spinner not found. This is expected if not on the Tokens page.');
      return;
    }

    // Hide loading spinner
    loadingSpinner.style.display = 'none';

    // Clear existing rows
    tokensTableBody.innerHTML = '';

    // Create a document fragment to improve performance
    const fragment = document.createDocumentFragment();

    // Add new rows
    tokenRows.forEach(token => {
      const row = document.createElement('tr');
      
      const tokenCell = document.createElement('td');
      tokenCell.innerHTML = `
        <div class="token-info">
          <span class="token-symbol">${token.symbol}</span>
          <span class="token-name">${token.name}</span>
        </div>
      `;
      row.appendChild(tokenCell);

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
      sendButton.addEventListener('click', async () => {
        await this.handleSendToken(token);
      });
      actionsCell.appendChild(sendButton);

      ['Shield', 'Unshield'].forEach(action => {
        const button = document.createElement('button');
        button.textContent = action;
        button.className = `action-button ${action.toLowerCase()}-button`;
        button.addEventListener('click', () => {
          const methodName = `handle${action}Token` as keyof UIManager;
          if (typeof this[methodName] === 'function') {
            (this[methodName] as Function)(token);
          }
        });
        actionsCell.appendChild(button);
      });

      row.appendChild(actionsCell);
      fragment.appendChild(row);
    });

    tokensTableBody.appendChild(fragment);
    console.log('Tokens table updated');
  }

  async handleSendToken(token: { name: string; symbol: string }) {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      alert("No wallet available. Please create an account first.");
      return;
    }

    try {
      const result = await this.showSendTokenModal(token);
      if (!result) {
        console.log('Transfer cancelled by user');
        return;
      }

      const { recipient, amount, isPrivate } = result;
      const toAddress = AztecAddress.fromString(recipient);

      // Check if the recipient address is registered
      const isRecipientRegistered = await this.isAddressRegistered(toAddress);
      if (!isRecipientRegistered) {
        alert(`The recipient address ${recipient} is not registered. Please ask the recipient to register their address first.`);
        return;
      }

      // Show loading indicator
      this.showLoadingIndicator('Simulating transfer...');

      const tokenAddress = await this.tokenService.getTokenAddress(token);
      const tokenContract = await TokenContract.at(tokenAddress, currentWallet);

      const fromAddress = currentWallet.getAddress();
      const amountBigInt = BigInt(amount);

      // Simulate the chosen transfer type
      const simulation = await this.simulateTransfer(tokenContract, fromAddress, toAddress, amountBigInt, isPrivate);

      // Hide loading indicator
      this.hideLoadingIndicator();

      // Show simulation results to the user
      const userConfirmed = await this.showTransferSimulation(simulation, fromAddress, toAddress, token);

      if (userConfirmed) {
        // Show loading indicator again
        this.showLoadingIndicator('Processing transfer...');

        let tx;
        if (isPrivate) {
          tx = await tokenContract.methods.transfer(toAddress, amountBigInt).send();
        } else {
          tx = await tokenContract.methods.transfer_public(fromAddress, toAddress, amountBigInt, 0).send();
        }

        await tx.wait();
        console.log(`Successfully sent ${amount} ${token.symbol} to ${recipient}`);
        await this.tokenService.updateTable();

        // Hide loading indicator
        this.hideLoadingIndicator();

        // Show success message
        this.showSuccessMessage(`Successfully sent ${amount} ${token.symbol} to ${recipient}`);
      } else {
        console.log('Transfer cancelled by user');
      }
    } catch (error) {
      // Hide loading indicator in case of error
      this.hideLoadingIndicator();

      console.error('Error sending tokens:', error);
      alert(`Failed to send tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private showSendTokenModal(token: { name: string; symbol: string }): Promise<{ recipient: string; amount: string; isPrivate: boolean } | null> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h2>Send ${token.symbol} Tokens</h2>
          <form id="sendTokenForm">
            <div class="form-group">
              <label for="recipient">Recipient Address:</label>
              <input class="input" type="text" id="recipient" required>
            </div>
            <div class="form-group">
              <label for="amount">Amount:</label>
              <input class="input" type="number" id="amount" min="0" step="any" required>
            </div>
            <div class="form-group">
              <label>Transfer Type:</label>
              <div class="radio-group">
                <div class="radio-option">
                  <input type="radio" id="privateTransfer" name="transferType" value="private" checked>
                  <span class="radio-custom"></span>
                  <label for="privateTransfer">Private Transfer</label>
                </div>
                <div class="radio-option">
                  <input type="radio" id="publicTransfer" name="transferType" value="public">
                  <span class="radio-custom"></span>
                  <label for="publicTransfer">Public Transfer</label>
                </div>
              </div>
            </div>
            <div class="modal-actions">
              <button type="submit" id="proceedSend" class="button primary-button">Proceed</button>
              <button type="button" id="cancelSend" class="button secondary-button">Cancel</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);

      const form = modal.querySelector('#sendTokenForm') as HTMLFormElement;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const recipient = (document.getElementById('recipient') as HTMLInputElement).value;
        const amount = (document.getElementById('amount') as HTMLInputElement).value;
        const isPrivate = (document.getElementById('privateTransfer') as HTMLInputElement).checked;
        document.body.removeChild(modal);
        resolve({ recipient, amount, isPrivate });
      });

      modal.querySelector('#cancelSend')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(null);
      });
    });
  }

  private async simulateTransfer(
    tokenContract: TokenContract,
    fromAddress: AztecAddress,
    toAddress: AztecAddress,
    amount: bigint,
    isPrivate: boolean
  ): Promise<SimulationResult> {
    let call;
    let fromBalance: bigint = BigInt(0);
    let toBalance: bigint = BigInt(0);
    let error: string | undefined;
    let gasEstimate: bigint = BigInt(0);

    try {
      if (isPrivate) {
        call = tokenContract.methods.transfer(toAddress, amount);
        fromBalance = await tokenContract.methods.balance_of_private(fromAddress).simulate();
        toBalance = await tokenContract.methods.balance_of_private(toAddress).simulate();
      } else {
        call = tokenContract.methods.transfer_public(fromAddress, toAddress, amount, 0);
        fromBalance = await tokenContract.methods.balance_of_public(fromAddress).simulate();
        toBalance = await tokenContract.methods.balance_of_public(toAddress).simulate();
      }

      try {
        const simulationResult = await call.simulate();
        gasEstimate = simulationResult.gasUsed;
      } catch (simulationError) {
        console.error('Simulation error:', simulationError);
        error = simulationError instanceof Error ? simulationError.message : 'Unknown simulation error';
      }

      return {
        isPrivate,
        fromBalanceBefore: fromBalance,
        toBalanceBefore: toBalance,
        fromBalanceAfter: fromBalance - amount,
        toBalanceAfter: toBalance + amount,
        gasEstimate,
        error,
      };
    } catch (err) {
      console.error('Error during transfer simulation:', err);
      error = err instanceof Error ? err.message : 'An unknown error occurred';

      return {
        isPrivate,
        fromBalanceBefore: fromBalance,
        toBalanceBefore: toBalance,
        fromBalanceAfter: BigInt(0),
        toBalanceAfter: BigInt(0),
        gasEstimate,
        error,
      };
    }
  }

  async showTransferSimulation(simulation: SimulationResult, fromAddress: AztecAddress, toAddress: AztecAddress, token: { name: string; symbol: string }): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content simulation-modal">
          <h2>Transfer Simulation Results</h2>
          ${simulation.error 
            ? `<div class="simulation-error">
                 <h3>Simulation Error</h3>
                 <p>${simulation.error}</p>
               </div>`
            : ''}
          <div class="simulation-results">
            <h3>${simulation.isPrivate ? 'Private' : 'Public'} Transfer</h3>
            <div class="simulation-details">
              <div class="simulation-column">
                <h4>Your Balance (${fromAddress.toString().slice(0, 6)}...${fromAddress.toString().slice(-4)})</h4>
                <p>Before: <span class="balance">${simulation.fromBalanceBefore} ${token.symbol}</span></p>
                <p>After: <span class="balance">${simulation.fromBalanceAfter} ${token.symbol}</span></p>
              </div>
              <div class="simulation-column">
                <h4>Recipient Balance (${toAddress.toString().slice(0, 6)}...${toAddress.toString().slice(-4)})</h4>
                <p>Before: <span class="balance">${simulation.toBalanceBefore} ${token.symbol}</span></p>
                <p>After: <span class="balance">${simulation.toBalanceAfter} ${token.symbol}</span></p>
              </div>
            </div>
            <p class="gas-estimate">Estimated gas: <span>${simulation.gasEstimate}</span></p>
          </div>
          <div class="modal-actions">
            ${simulation.error
              ? `<button id="proceedAnyway" class="button primary-button">Proceed Anyway</button>`
              : `<button id="confirmTransfer" class="button primary-button">Confirm Transfer</button>`
            }
            <button id="cancelTransfer" class="button secondary-button">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.querySelector('#confirmTransfer')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(true);
      });

      modal.querySelector('#proceedAnyway')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(true);
      });

      modal.querySelector('#cancelTransfer')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
    });
  }

  private async handleShieldToken(token: { name: string; symbol: string; balance: { public: string; private: string } }) {
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

  private async updateAccountUI() {
    const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement | null;
    const accountLabel = document.getElementById('accountLabel');
    const accountAddress = document.getElementById('accountAddress');

    const accounts = await this.accountService.getAccounts();
    
    if (accountSelect) {
      accountSelect.innerHTML = '<option value="" disabled selected>Select an account</option>';
      
      accounts.forEach((account, index) => {
        const option = document.createElement('option');
        option.value = index.toString();
        option.textContent = `Account ${index + 1} (${account.toString().slice(0, 5)}...${account.toString().slice(-5)})`;
        accountSelect.appendChild(option);
      });

      console.log(accountSelect);

      // Select the current account in the dropdown
      const currentAccountIndex = this.accountService.getCurrentAccountIndex();
      if (currentAccountIndex !== null && currentAccountIndex < accounts.length) {
        accountSelect.value = currentAccountIndex.toString();
      }
    }

    await this.updateHeaderAccountInfo(accountLabel, accountAddress, accounts);
  }

  private async updateHeaderAccountInfo(accountLabel: HTMLElement | null, accountAddress: HTMLElement | null, accounts: AztecAddress[]) {
    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex !== null && accounts.length > 0) {
      if (accountLabel && accountAddress && currentAccountIndex < accounts.length) {
        accountLabel.textContent = `Account ${currentAccountIndex + 1}`;
        accountAddress.textContent = `(${accounts[currentAccountIndex].toString().slice(0, 5)}...${accounts[currentAccountIndex].toString().slice(-5)})`;
      }
    } else {
      if (accountLabel && accountAddress) {
        accountLabel.textContent = 'Connect';
        accountAddress.textContent = '';
      }
    }
  }

  private setAccountSelectionListener() {
    const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement | null;
    if (!accountSelect) {
      console.debug('Account select not found. This is expected if not on the Accounts page.');
      return;
    }

    accountSelect.addEventListener('change', async (event) => {
      const selectedIndex = (event.target as HTMLSelectElement).selectedIndex - 1;
      if (selectedIndex >= 0) {
        await this.accountService.setCurrentAccountIndex(selectedIndex);
        const currentWallet = await this.accountService.getCurrentWallet();
        if (currentWallet) {
          await this.tokenService.updateBalancesForNewAccount(currentWallet);
        }
        this.updateHeaderAccountInfo(
          document.getElementById('accountLabel'),
          document.getElementById('accountAddress'),
          await this.accountService.getAccounts()
        );
      }
    });
  }

  private addCopyClipboard() {
    document.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      if (target.id === 'copyAddressButton' || target.closest('#copyAddressButton')) {
        const currentAccountIndex = this.accountService.getCurrentAccountIndex();
        if (currentAccountIndex === null) {
          alert('No account selected. Please select an account first.');
          return;
        }

        const contractAddress = await this.accountService.retrieveContractAddress(currentAccountIndex);

        if (contractAddress) {
          try {
            await navigator.clipboard.writeText(contractAddress.address.toString());
            alert('Contract address copied to clipboard!');
          } catch (err) {
            console.error('Failed to copy:', err);
            alert('Failed to copy address. Please try again.');
          }
        } else {
          alert('No contract address available to copy.');
        }
      }
    });
  }

  public showLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const tableContainer = document.querySelector('.table-container');
    if (loadingSpinner && tableContainer) {
      loadingSpinner.style.display = 'block';
      tableContainer.classList.add('loading');
    }
  }

  public hideLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const tableContainer = document.querySelector('.table-container');
    if (loadingSpinner && tableContainer) {
      loadingSpinner.style.display = 'none';
      tableContainer.classList.remove('loading');
    }
  }

  private setupDropdownMenu() {
    const dropdownMenu = document.getElementById('accountDropdown');
    const avatarButton = document.getElementById('avatarButton');
    const dropdownContent = document.getElementById('dropdownContent');

    if (dropdownMenu && avatarButton && dropdownContent) {
      let timeoutId: NodeJS.Timeout | null = null;

      const showDropdown = () => {
        if (timeoutId) clearTimeout(timeoutId);
        dropdownMenu.classList.add('active');
      };

      const hideDropdown = () => {
        timeoutId = setTimeout(() => {
          dropdownMenu.classList.remove('active');
        }, 300); // Delay before hiding the dropdown
      };

      // Hover functionality
      dropdownMenu.addEventListener('mouseenter', showDropdown);
      dropdownMenu.addEventListener('mouseleave', hideDropdown);

      // Click functionality
      avatarButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('active');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!dropdownMenu.contains(e.target as Node)) {
          dropdownMenu.classList.remove('active');
        }
      });

      // Prevent dropdown from closing when clicking inside
      dropdownContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    } else {
      console.error('Dropdown menu elements not found');
    }
  }

  showCreateMintTokenPopup() {
    if (this.accountService.getCurrentAccountIndex() === null) {
      alert("No account created yet. Please create an account before creating or minting tokens.");
      return;
    }

    // Instead of showing a modal, we can focus on the Create/Mint form
    const createMintForm = document.getElementById('createMintTokenForm');
    if (createMintForm) {
      createMintForm.scrollIntoView({ behavior: 'smooth' });
      const firstInput = createMintForm.querySelector('input') as HTMLInputElement;
      if (firstInput) {
        firstInput.focus();
      }
    }
  }

  private handleCreateMintTokenSubmit(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const nameInput = form.querySelector('#tokenName') as HTMLInputElement;
    const symbolInput = form.querySelector('#tokenSymbol') as HTMLInputElement;
    const amountInput = form.querySelector('#tokenAmount') as HTMLInputElement;
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

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
        // Clear the form fields
        nameInput.value = '';
        symbolInput.value = '';
        amountInput.value = '';
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
      });
  }

  private async initializeAccountInfo() {
    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex !== null) {
      const accounts = await this.accountService.getAccounts();
      if (accounts.length > currentAccountIndex) {
        const currentAccount = accounts[currentAccountIndex];
        const accountLabel = document.getElementById('accountLabel');
        const accountAddress = document.getElementById('accountAddress');
        
        if (accountLabel && accountAddress) {
          accountLabel.textContent = `Account ${currentAccountIndex + 1}`;
          accountAddress.textContent = `(${currentAccount.toString().slice(0, 5)}...${currentAccount.toString().slice(-5)})`;
        }
      }
    }
  }

  setupUI() {
    this.initializeAccountInfo();
    this.updateAccountUI();
    this.displayPairings();
    this.addCopyClipboard();
    this.setupDynamicEventListeners();
    this.setupHashChangeListener();
    this.loadAccountState();
    this.setupDropdownMenu();
  }

  private setupHashChangeListener() {
    window.addEventListener('hashchange', () => {
      this.debouncedHandlePageChange();
    });
    // Trigger the page change handler on initial load
    this.debouncedHandlePageChange();
  }

  public debouncedHandlePageChange() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.handlePageChange();
    }, 100); // Adjust this delay as needed
  }

  private async rotateNullifierKey(event: Event) {
    event.preventDefault();
    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex === null) {
      alert('No account selected. Please select an account first.');
      return;
    }

    try {
      const wallet = await this.accountService.getCurrentWallet();
      if (!wallet) {
        throw new Error('No wallet available. Please create an account first.');
      }

      await this.accountService.rotateNullifierKey(wallet);
      alert('Nullifier key rotated successfully!');
    } catch (error) {
      console.error('Error rotating nullifier key:', error);
      alert('Failed to rotate nullifier key. Please try again.');
    }
  }

  private showLoadingIndicator(message: string) {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.innerHTML = `
      <div class="loading-spinner"></div>
      <p>${message}</p>
    `;
    document.body.appendChild(loadingOverlay);
  }

  private hideLoadingIndicator() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      document.body.removeChild(loadingOverlay);
    }
  }

  private showSuccessMessage(message: string) {
    const successMessage = document.createElement('div');
    successMessage.id = 'successMessage';
    successMessage.innerHTML = `
      <p>${message}</p>
    `;
    document.body.appendChild(successMessage);

    // Remove the success message after 3 seconds
    setTimeout(() => {
      const messageElement = document.getElementById('successMessage');
      if (messageElement) {
        document.body.removeChild(messageElement);
      }
    }, 3000);
  }

  private async isAddressRegistered(address: AztecAddress): Promise<boolean> {
    try {

      const pxe = await PXEFactory.getPXEInstance();


      pxe.getRegisteredAccount(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  async registerAddress(address: AztecAddress) {
    try {

      const pxe = await PXEFactory.getPXEInstance();

      //TODO: fix this
      //await pxe.registerRecipient(address);
      console.log(`Address ${address.toString()} registered successfully.`);
    } catch (error) {
      console.error(`Failed to register address ${address.toString()}:`, error);
      throw error;
    }
  }

  async handleRegisterAddress() {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      alert("No wallet available. Please create an account first.");
      return;
    }

    const address = currentWallet.getAddress();
    try {
      await this.registerAddress(address);
      alert(`Your address ${address.toString()} has been registered successfully.`);
    } catch (error) {
      alert(`Failed to register your address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}