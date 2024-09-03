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

  constructor() {
    // Remove the call to createModal if it was here
  }

  private async handlePageChange() {
    const hash = window.location.hash.slice(1) || 'accounts'; // Default to 'accounts' if hash is empty
    console.log('Page changed to:', hash);
    
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
      
      ['Send', 'Shield', 'Unshield'].forEach(action => {
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

  private handleSendToken(token: { name: string; symbol: string; balance: { public: string; private: string } }) {
    const recipient = prompt(`Enter the recipient's address for ${token.symbol}:`);
    if (!recipient) return;

    const amount = prompt(`Enter the amount of ${token.symbol} to send:`);
    if (!amount) return;

    const isPrivate = confirm("Do you want to send from your private balance? Click OK for private, Cancel for public.");

    try {
      this.showLoadingSpinner();
      this.tokenService.sendToken(token, recipient, amount, isPrivate)
        .then(() => {
          alert(`Successfully sent ${amount} ${token.symbol} to ${recipient}`);
        })
        .catch(error => {
          console.error('Error sending tokens:', error);
          alert(`Failed to send tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
        })
        .finally(() => {
          this.hideLoadingSpinner();
        });
    } catch (error) {
      console.error('Error sending tokens:', error);
      alert(`Failed to send tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
    const dropdownMenu = document.querySelector('.dropdown-menu');
    const avatarButton = document.querySelector('.avatar-button');
    const dropdownContent = document.querySelector('.dropdown-content');

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

      avatarButton.addEventListener('mouseenter', showDropdown);
      dropdownMenu.addEventListener('mouseenter', showDropdown);
      dropdownMenu.addEventListener('mouseleave', hideDropdown);

      // Keep the click event listener for mobile devices
      avatarButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('active');
      });

      document.addEventListener('click', (e) => {
        if (!dropdownMenu.contains(e.target as Node)) {
          dropdownMenu.classList.remove('active');
        }
      });

      dropdownContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
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

  setupUI() {
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
}