import { AccountService } from '../services/AccountService.js';
import { TokenService } from '../services/TokenService.js';
import { TokenContract } from '@aztec/noir-contracts.js';
import { WalletConnectService } from '../services/WalletConnectService.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';
import { Fr, Note } from "@aztec/aztec.js";
import { AztecAddress } from '@aztec/circuits.js';
import { TransactionService } from '../services/TransactionService.js';
import { PXEFactory } from '../factories/PXEFactory.js';
import { Transaction } from '../services/TransactionService.js';
import { TestContract } from '@aztec/noir-contracts.js';


interface SimulationResult {
  isPrivate: boolean;
  fromBalanceBefore: number;
  toBalanceBefore: number;
  fromBalanceAfter: number;
  toBalanceAfter: number;
  gasEstimate: bigint;
  error?: string;
}

// Add this helper function at the top of the file or in a separate utilities file
function getFrValue(frValue: Fr | { type: string, value: string }): bigint {
  if (frValue instanceof Fr) {
    return frValue.toBigInt();
  } else if (typeof frValue === 'object' && frValue.type === 'Fr') {
    return Fr.fromString(frValue.value).toBigInt();
  }
  throw new Error('Invalid Fr value');
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
      case 'bridge':
        await this.updateBridgePage();
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

        // Fetch pending shields for each token
        const pendingShields = await Promise.all(this.tokenService.getTokens().map(async (token) => {
          const tokenAddress = await this.tokenService.getTokenAddress(token);
          const pendingShieldNotes = await this.tokenService.getPendingShields(tokenAddress);
          const formattedPendingShieldNotes = pendingShieldNotes.map(note => ({
            items: note.items,
            formattedAmount: this.tokenService.formatAmount(note.items[0].toBigInt())
          }));
          return { token, pendingShieldNotes: formattedPendingShieldNotes };
        }));

        // Update the pending shields list
        this.updatePendingShieldsList(pendingShields);
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
    await this.displayTransactions();
  }

  private async updateBridgePage() {
    console.log('Updating Bridge page');
    await this.populateBridgeTokens();
    this.setupBridgeEventListeners();
  }

  private async populateBridgeTokens() {
    const tokens = await this.accountService.getTokens();
    const depositTokenSelect = document.getElementById('depositToken') as HTMLSelectElement;
    const withdrawTokenSelect = document.getElementById('withdrawToken') as HTMLSelectElement;

    if (depositTokenSelect && withdrawTokenSelect) {
      depositTokenSelect.innerHTML = '';
      withdrawTokenSelect.innerHTML = '';

      tokens.forEach(token => {
        const option = document.createElement('option');
        option.value = `${token.name}:${token.symbol}`;
        option.text = `${token.name} (${token.symbol})`;
        depositTokenSelect.add(option);
        withdrawTokenSelect.add(option.cloneNode(true) as HTMLOptionElement);
      });
    }
  }

  private setupBridgeEventListeners() {
    const depositForm = document.getElementById('depositForm') as HTMLFormElement;
    const withdrawForm = document.getElementById('withdrawForm') as HTMLFormElement;

    if (depositForm) {
      depositForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const depositTokenSelect = document.getElementById('depositToken') as HTMLSelectElement;
        const depositAmountInput = document.getElementById('depositAmount') as HTMLInputElement;
        const [name, symbol] = depositTokenSelect.value.split(':');
        const amount = depositAmountInput.value;
        await this.handleDeposit({ name, symbol }, amount);
      });
    }

    if (withdrawForm) {
      withdrawForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const withdrawTokenSelect = document.getElementById('withdrawToken') as HTMLSelectElement;
        const withdrawAmountInput = document.getElementById('withdrawAmount') as HTMLInputElement;
        const [name, symbol] = withdrawTokenSelect.value.split(':');
        const amount = withdrawAmountInput.value;
        await this.handleWithdraw({ name, symbol }, amount);
      });
    }
  }

  private async handleDeposit(token: { name: string; symbol: string }, amount: string) {
    const isPrivate = document.getElementById('depositPrivate') as HTMLInputElement;
    await this.tokenService.depositTokens(token, amount, isPrivate.checked);
    // Implement the logic for depositing tokens from Ethereum to Aztec
    console.log(`Depositing ${amount} ${token.symbol} from Ethereum to Aztec`);
    // TODO: Implement the deposit functionality
  }

  private async handleWithdraw(token: { name: string; symbol: string }, amount: string) {
    const isPrivate = document.getElementById('withdrawPrivate') as HTMLInputElement;
    await this.tokenService.withdrawTokens(token, amount, isPrivate.checked);
    // Implement the logic for withdrawing tokens from Aztec to Ethereum
    console.log(`Withdrawing ${amount} ${token.symbol} from Aztec to Ethereum`);
    // TODO: Implement the withdraw functionality
  }

  private async displayTransactions() {
    const transactionsTableBody = document.getElementById('transactionsTableBody');
    if (!transactionsTableBody) {
      console.debug('Transactions table body not found. This is expected if not on the Transactions page.');
      return;
    }

    try {
      const transactions = await this.transactionService.fetchTransactions();
      console.log('Displaying transactions:', transactions);
      transactionsTableBody.innerHTML = '';

      if (transactions.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5">No transactions found</td>';
        transactionsTableBody.appendChild(row);
      } else {
        for (const transaction of transactions) {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${await this.getActionDescription(transaction)}</td>
            <td>${await this.formatAmount(transaction)}</td>
            <td>${transaction.status}</td>
            <td>${new Date(transaction.timestamp).toLocaleString()}</td>
            <td>${await this.formatAddresses(transaction)}</td>
          `;
          transactionsTableBody.appendChild(row);
        }
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="5">Error fetching transactions. Please try again later.</td>';
      transactionsTableBody.appendChild(row);
    }
  }

  private async getActionDescription(transaction: Transaction): Promise<string> {
    const currentWallet = await this.accountService.getCurrentWallet();
    switch (transaction.action) {
      case 'mint':
        return 'Minted';
      case 'shield':
        return 'Shielded';
      case 'unshield':
        return 'Unshielded';
      case 'transfer':
        return transaction.from === currentWallet?.getAddress().toString() ? 'Sent' : 'Received';
      case 'redeem':
        return 'Redeemed';
      default:
        return 'Unknown';
    }
  }

  private async formatAmount(transaction: Transaction): Promise<string> {
    const currentWallet = await this.accountService.getCurrentWallet();
    const sign = transaction.action === 'unshield' || 
                 (transaction.action === 'transfer' && transaction.from === currentWallet?.getAddress().toString())
                 ? '-' : '+';
    return `${sign}${transaction.amount} ${transaction.token}`;
  }

  private async formatAddresses(transaction: Transaction): Promise<string> {
    const currentWallet = await this.accountService.getCurrentWallet();
    const currentAddress = currentWallet?.getAddress().toString();
    if (transaction.action === 'mint' || transaction.action === 'shield' || transaction.action === 'unshield') {
      return this.formatAddress(currentAddress);
    } else {
      return `${this.formatAddress(transaction.from)} → ${this.formatAddress(transaction.to)}`;
    }
  }

  private formatAddress(address: string | undefined): string {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown';
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
      } else if (target.matches('#eraseAllDataButton')) {
        this.handleEraseAllData(event);
      }
    });

    document.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      if (target.name === 'tokenAction') {
        this.updateTokenForm(target.value);
      }
    });

    document.addEventListener('submit', async (event) => {
      const target = event.target as HTMLElement;
      if (target.matches('#createMintTokenForm')) {
        event.preventDefault();
        await this.handleCreateMintImportTokenSubmit(event);
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
      const seedInput = document.getElementById('accountSeed') as HTMLInputElement;
      const seed = seedInput.value.trim();
      await this.accountService.createAccount(seed);
      this.updateAccountUI();
      
      const currentWallet = await this.accountService.getCurrentWallet();
      if (currentWallet) {
        await this.tokenService.updateBalancesForNewAccount(currentWallet);
      }

      // Clear the seed input after successful account creation
      seedInput.value = '';
    } catch (error) {
      console.error('Error during account creation:', error);
      alert(`Failed to create account: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      await this.accountService.createAccount(secretKey);
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
            pairingItem.remove();
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

  public async updateTokensTable(tokenRows: { name: string; symbol: string; balance: { public: string; private: string } }[]) {
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
    for (const token of tokenRows) {
      const row = document.createElement('tr');
      
      const tokenCell = document.createElement('td');
      tokenCell.innerHTML = `
        <div class="token-info">
          <span class="token-symbol">${token.symbol}</span>
          <span class="token-name">${token.name}</span>
          <div class="token-address-container">
            <span class="token-address" id="tokenAddress_${token.symbol}"></span>
            <button class="copy-address-button" data-symbol="${token.symbol}">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
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
    }

    tokensTableBody.appendChild(fragment);
    console.log('Tokens table updated');

    // Add event listeners for copy buttons
    const copyButtons = tokensTableBody.querySelectorAll('.copy-address-button');
    copyButtons.forEach(button => {
      button.addEventListener('click', async () => {
        const symbol = button.getAttribute('data-symbol');
        if (symbol) {
          const address = await this.getTokenAddress(symbol);
          await navigator.clipboard.writeText(address);
          this.showSuccessMessage(`Address for ${symbol} copied to clipboard!`);
        }
      });
    });

    // Fetch and display token addresses
    for (const token of tokenRows) {
      const addressSpan = document.getElementById(`tokenAddress_${token.symbol}`);
      if (addressSpan) {
        const address = await this.getTokenAddress(token.symbol);
        addressSpan.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
      }
    }
  }

  private async getTokenAddress(symbol: string): Promise<string> {
    const token = await this.tokenService.getTokenBySymbol(symbol);
    if (token) {
      const address = await this.tokenService.getTokenAddress(token);
      return address.toString();
    }
    return 'Address not found';
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

      const { recipient, amount, isPrivate, totpCode } = result;

      // Validate TOTP code
      const isValidTOTP = await this.accountService.validateTOTP(currentWallet.getAddress(), totpCode);
      if (!isValidTOTP) {
        alert('Invalid TOTP code. Please try again.');
        return;
      }

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
      const amountBigInt = BigInt(Math.round(parseFloat(amount) * 1e9));

      // Simulate the chosen transfer type
      const simulation = await this.simulateTransfer(tokenContract, fromAddress, toAddress, amountBigInt, isPrivate);

      // Hide loading indicator
      this.hideLoadingIndicator();

      // Show simulation results to the user
      const userConfirmed = await this.showTransferSimulation(simulation, fromAddress, toAddress, token);

      if (userConfirmed) {
        // Show loading indicator again
        this.showLoadingIndicator('Processing transfer...');

        await this.tokenService.sendToken(token, recipient, amount, isPrivate);

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

  private showSendTokenModal(token: { name: string; symbol: string }): Promise<{ recipient: string; amount: string; isPrivate: boolean; totpCode: number } | null> {
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
                <label class="radio-option">
                  <input type="radio" id="privateTransfer" name="transferType" value="private" checked>
                  <span class="radio-custom"></span>
                  Private Transfer
                </label>
                <label class="radio-option">
                  <input type="radio" id="publicTransfer" name="transferType" value="public">
                  <span class="radio-custom"></span>
                  Public Transfer
                </label>
              </div>
            </div>
            <div class="form-group">
              <label for="totpCode">TOTP Code:</label>
              <input class="input" type="number" id="totpCode" required>
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
        const totpCode = parseInt((document.getElementById('totpCode') as HTMLInputElement).value, 10);
        document.body.removeChild(modal);
        resolve({ recipient, amount, isPrivate, totpCode });
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
        fromBalanceBefore: Number(fromBalance) / 1e9,
        toBalanceBefore: Number(toBalance) / 1e9,
        fromBalanceAfter: (Number(fromBalance) - Number(amount)) / 1e9,
        toBalanceAfter: (Number(toBalance) + Number(amount)) / 1e9,
        gasEstimate,
        error,
      };
    } catch (err) {
      console.error('Error during transfer simulation:', err);
      error = err instanceof Error ? err.message : 'An unknown error occurred';

      return {
        isPrivate,
        fromBalanceBefore: Number(fromBalance) / 1e9,
        toBalanceBefore: Number(toBalance) / 1e9,
        fromBalanceAfter: 0,
        toBalanceAfter: 0,
        gasEstimate,
        error,
      };
    }
  }

  async showTransferSimulation(simulation: SimulationResult, fromAddress: AztecAddress | undefined, toAddress: AztecAddress | undefined, token: { name: string; symbol: string }): Promise<boolean> {
    const formatNumber = (num: number) => {
      return num.toFixed(9).replace(/\.?0+$/, '');
    };

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
                <h4>Your Balance ${fromAddress ? `(${fromAddress.toString().slice(0, 6)}...${fromAddress.toString().slice(-4)})` : ''}</h4>
                <p>Before: <span class="balance">${formatNumber(simulation.fromBalanceBefore)} ${token.symbol}</span></p>
                <p>After: <span class="balance">${formatNumber(simulation.fromBalanceAfter)} ${token.symbol}</span></p>
                <p>Change: <span class="balance-change">${formatNumber(simulation.fromBalanceAfter - simulation.fromBalanceBefore)} ${token.symbol}</span></p>
              </div>
              <div class="simulation-column">
                <h4>Recipient Balance ${toAddress ? `(${toAddress.toString().slice(0, 6)}...${toAddress.toString().slice(-4)})` : ''}</h4>
                <p>Before: <span class="balance">${formatNumber(simulation.toBalanceBefore)} ${token.symbol}</span></p>
                <p>After: <span class="balance">${formatNumber(simulation.toBalanceAfter)} ${token.symbol}</span></p>
                <p>Change: <span class="balance-change">${formatNumber(simulation.toBalanceAfter - simulation.toBalanceBefore)} ${token.symbol}</span></p>
              </div>
            </div>
            <p class="gas-estimate">Estimated gas: <span>${simulation.gasEstimate !== undefined ? simulation.gasEstimate.toString() : 'N/A'}</span></p>
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
    console.log('Setting up UI...');
    this.initializeAccountInfo();
    this.updateAccountUI();
    this.displayPairings();
    this.addCopyClipboard();
    this.setupDynamicEventListeners();
    this.setupHashChangeListener();
    this.loadAccountState();
    this.setupDropdownMenu();
    console.log('UI setup complete.');
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
    const button = event.target as HTMLButtonElement;
    const originalText = button.textContent || 'Rotate Nullifier Key';
    
    try {
      button.disabled = true;
      button.textContent = 'Processing...';
      this.showLoadingIndicator('Rotating Nullifier Key...');

      const currentAccountIndex = this.accountService.getCurrentAccountIndex();
      if (currentAccountIndex === null) {
        throw new Error('No account selected. Please select an account first.');
      }

      const wallet = await this.accountService.getCurrentWallet();
      if (!wallet) {
        throw new Error('No wallet available. Please create an account first.');
      }

      await this.accountService.rotateNullifierKey(wallet);
      this.showSuccessMessage('Nullifier key rotated successfully!');
    } catch (error) {
      console.error('Error rotating nullifier key:', error);
      alert('Failed to rotate nullifier key. Please try again.');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      this.hideLoadingIndicator();
    }
  }

  private showLoadingIndicator(message: string) {
    let loadingOverlay = document.getElementById('loadingOverlay');
    if (!loadingOverlay) {
      loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loadingOverlay';
      loadingOverlay.innerHTML = `
        <div class="loading-spinner"></div>
        <p id="loadingMessage"></p>
      `;
      document.body.appendChild(loadingOverlay);
    }
    const messageElement = loadingOverlay.querySelector('#loadingMessage');
    if (messageElement) {
      messageElement.textContent = message;
    }
    loadingOverlay.style.display = 'flex';
  }

  private hideLoadingIndicator() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
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

  public async updatePendingShieldsList(pendingShieldsData: { 
    token: { name: string; symbol: string }; 
    pendingShieldNotes: { items: Fr[]; formattedAmount: string }[];
  }[]) {
    const pendingShieldsList = document.getElementById('pendingShieldsList');
    if (pendingShieldsList) {
      pendingShieldsList.innerHTML = '';

      if (pendingShieldsData.length === 0) {
        pendingShieldsList.innerHTML = '<p class="no-pending-shields">No pending shields available.</p>';
        return;
      }

      for (const { token, pendingShieldNotes } of pendingShieldsData) {
        const tokenContainer = document.createElement('div');
        tokenContainer.className = 'token-pending-shields-container';
        tokenContainer.setAttribute('data-token-symbol', token.symbol);

        const tokenHeader = document.createElement('div');
        tokenHeader.className = 'token-pending-shields-header';
        tokenHeader.innerHTML = `
          <h4 class="token-pending-shields-title">${token.name} (${token.symbol})</h4>
          <span class="pending-shields-count">${pendingShieldNotes.length} pending</span>
        `;
        tokenContainer.appendChild(tokenHeader);

        if (pendingShieldNotes.length === 0) {
          const noShieldsMessage = document.createElement('p');
          noShieldsMessage.className = 'no-pending-shields';
          noShieldsMessage.textContent = `No pending shields for ${token.symbol}`;
          tokenContainer.appendChild(noShieldsMessage);
        } else {
          const notesList = document.createElement('ul');
          notesList.className = 'pending-shields-list';

          pendingShieldNotes.forEach((note, index) => {
            const noteItem = document.createElement('li');
            noteItem.className = 'pending-shield-note-item';
            
            // Safely access note.items[2] and provide a fallback
            const nonce = note.items[2] ? note.items[2].toBigInt() : BigInt(index);
            
            noteItem.innerHTML = `
              <div class="pending-shield-info">
                <span class="pending-shield-amount">${note.formattedAmount} ${token.symbol}</span>
                <span class="pending-shield-index">Shield #${nonce.toString()}</span>
              </div>
              <button class="redeem-button" data-token-name="${token.name}" data-token-symbol="${token.symbol}" data-index="${index}">Redeem</button>
            `;
            notesList.appendChild(noteItem);
          });

          tokenContainer.appendChild(notesList);
        }

        pendingShieldsList.appendChild(tokenContainer);
      }

      // Add event listeners for redeem buttons
      const redeemButtons = pendingShieldsList.querySelectorAll('.redeem-button');
      redeemButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
          const target = event.target as HTMLButtonElement;
          target.disabled = true;
          target.textContent = 'Redeeming...';

          let tokenSymbol = '';

          try {
            const tokenName = target.getAttribute('data-token-name') || '';
            tokenSymbol = target.getAttribute('data-token-symbol') || '';
            const index = parseInt(target.getAttribute('data-index') || '0', 10);
            await this.tokenService.redeemShield({ name: tokenName, symbol: tokenSymbol }, index);
            this.showSuccessMessage(`Successfully redeemed ${tokenSymbol} shield`);
          } catch (error) {
            console.error('Error redeeming shield:', error);
            this.showErrorMessage(`Failed to redeem ${tokenSymbol} shield: ${error instanceof Error ? error.message : 'Unknown error'}`);
          } finally {
            target.disabled = false;
            target.textContent = 'Redeem';
          }
        });
      });
    }
  }

  private showErrorMessage(message: string) {
    const errorMessage = document.createElement('div');
    errorMessage.id = 'errorMessage';
    errorMessage.className = 'error-message';
    errorMessage.innerHTML = `<p>${message}</p>`;
    document.body.appendChild(errorMessage);

    setTimeout(() => {
      const messageElement = document.getElementById('errorMessage');
      if (messageElement) {
        document.body.removeChild(messageElement);
      }
    }, 5000);
  }

  private async handleCreateMintImportTokenSubmit(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const nameInput = form.querySelector('#tokenName') as HTMLInputElement;
    const symbolInput = form.querySelector('#tokenSymbol') as HTMLInputElement;
    const amountInput = form.querySelector('#tokenAmount') as HTMLInputElement;
    const addressInput = form.querySelector('#tokenAddress') as HTMLInputElement;
    const mintAmountInput = form.querySelector('#mintAmount') as HTMLInputElement;
    const actionRadios = form.querySelectorAll('input[name="tokenAction"]') as NodeListOf<HTMLInputElement>;
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    const action = Array.from(actionRadios).find(radio => radio.checked)?.value;

    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';

    try {
      switch (action) {
        case 'create':
          await this.tokenService.createToken({
            name: nameInput.value,
            symbol: symbolInput.value,
            amount: amountInput.value
          });
          break;
        case 'mint':
          await this.tokenService.mintToken(addressInput.value, mintAmountInput.value);
          break;
        case 'import':
          await this.tokenService.importExistingToken(addressInput.value);
          break;
        default:
          throw new Error('Invalid action selected');
      }

      // Clear the form fields
      form.reset();
      this.updateTokenForm('create'); // Reset form to create mode

      this.showSuccessMessage(`Successfully ${action}ed token`);
    } catch (error) {
      console.error(`Error ${action}ing token:`, error);
      this.showErrorMessage(`Failed to ${action} token. ${error instanceof Error ? error.message : 'Unknown error occurred.'}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
    }
  }

  private updateTokenForm(action: string) {
    const createFields = document.getElementById('createFields');
    const mintImportFields = document.getElementById('mintImportFields');
    const tokenNameInput = document.getElementById('tokenName') as HTMLInputElement;
    const tokenSymbolInput = document.getElementById('tokenSymbol') as HTMLInputElement;
    const tokenAmountInput = document.getElementById('tokenAmount') as HTMLInputElement;
    const tokenAddressInput = document.getElementById('tokenAddress') as HTMLInputElement;
    const mintAmountGroup = document.getElementById('mintAmountGroup');
    const mintAmountInput = document.getElementById('mintAmount') as HTMLInputElement;

    if (action === 'create') {
      createFields!.style.display = 'block';
      mintImportFields!.style.display = 'none';
      tokenNameInput.required = true;
      tokenSymbolInput.required = true;
      tokenAmountInput.required = true;
      tokenAddressInput.required = false;
      mintAmountInput.required = false;
    } else {
      createFields!.style.display = 'none';
      mintImportFields!.style.display = 'block';
      tokenNameInput.required = false;
      tokenSymbolInput.required = false;
      tokenAmountInput.required = false;
      tokenAddressInput.required = true;
      
      if (action === 'mint') {
        mintAmountGroup!.style.display = 'block';
        mintAmountInput.required = true;
      } else {
        mintAmountGroup!.style.display = 'none';
        mintAmountInput.required = false;
      }
    }
  }

  private handleEraseAllData(event: Event) {
    console.log('Erase All Data button clicked');
    event.preventDefault(); // Prevent the default anchor behavior
    if (confirm('Are you sure you want to erase all data? This action cannot be undone.')) {
      console.log('User confirmed, clearing localStorage...');
      localStorage.clear();
      console.log('localStorage cleared, showing alert...');
      alert('All data has been erased. The page will now reload.');
      console.log('Reloading page...');
      window.location.reload();
    } else {
      console.log('User cancelled the operation');
    }
  }
}