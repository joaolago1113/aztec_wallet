console.log('Application starting...');

import './style.css';
import { PXEFactory } from './factories/PXEFactory.js';
import { WalletSdkFactory } from './factories/WalletSdkFactory.js';
import { KeystoreFactory } from './factories/KeystoreFactory.js';
import { AccountService } from './services/AccountService.js';
import { TokenService } from './services/TokenService.js';
import { WalletConnectService } from './services/WalletConnectService.js';
import { UIManager } from './ui/UIManager.js';
import { renderHeader } from './components/Header.js';
import { renderFooter } from './components/Footer.js';
import { TransactionService } from './services/TransactionService.js';
import { CONFIG } from './config.js';

let uiManager: UIManager;

async function main() {
  const pxe = await PXEFactory.getPXEInstance();
  
  console.log('PXE instance:', pxe);
  console.log('Available methods:', Object.keys(pxe));

  try {
    const nodeInfo = await pxe.getNodeInfo();
    console.log('PXE connection successful. Node info:', nodeInfo);
  } catch (error) {
    console.error('Failed to connect to PXE:', error);
    alert('Failed to connect to the Aztec network. Please check your connection and try again.');
    return;
  }

  const walletSdk = await WalletSdkFactory.getWalletSdkInstance();
  const keystore = KeystoreFactory.getKeystore();

  uiManager = new UIManager();

  // Create services without circular dependencies
  const accountService = new AccountService(pxe, keystore, uiManager);
  const tokenService = new TokenService(pxe, uiManager, accountService);
  const walletConnectService = new WalletConnectService(CONFIG.WALLETCONNECT_PROJECT_ID, CONFIG.SDK_METADATA, accountService, uiManager);
  const transactionService = new TransactionService(pxe, uiManager, accountService, tokenService);

  // Set up services after creation
  accountService.setTokenService(tokenService);
  uiManager.setWalletConnectService(walletConnectService);
  uiManager.setAccountService(accountService);
  uiManager.setTokenService(tokenService);
  uiManager.setTransactionService(transactionService);
  uiManager.setupUI();

  // Render the header and footer components
  const headerElement = document.querySelector('header');
  const footerElement = document.querySelector('footer');

  if (headerElement) {
    headerElement.innerHTML = await renderHeader();
  }

  if (footerElement) {
    footerElement.innerHTML = await renderFooter();
  }

  // Add event listener for navigation
  window.addEventListener('hashchange', () => {
    renderPage();
  });

  // Initial page render
  renderPage();
}

async function renderPage() {
  const hash = window.location.hash.slice(1) || 'accounts'; // Default to 'accounts' if hash is empty
  const contentElement = document.getElementById('content');

  if (contentElement) {
    try {
      const response = await fetch(`${hash}.html`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const mainContent = doc.querySelector('main');

      if (mainContent) {
        contentElement.innerHTML = mainContent.innerHTML;
        // Call the UIManager method directly
        uiManager.debouncedHandlePageChange();
      } else {
        contentElement.innerHTML = '<h2>Page not found</h2>';
      }
    } catch (error) {
      console.error(`Failed to load page: ${hash}`, error);
      contentElement.innerHTML = '<h2>Page not found</h2>';
    }
  }
}

main().catch(console.error);