import './style.css';
import { PXEFactory } from './factories/PXEFactory.js';
import { WalletSdkFactory } from './factories/WalletSdkFactory.js';
import { KeystoreFactory } from './factories/KeystoreFactory.js';
import { AccountService } from './services/AccountService.js';
import { TokenService } from './services/TokenService.js';
import { WalletConnectService } from './services/WalletConnectService.js';
import { UIManager } from './ui/UIManager.js';

const WALLETCONNECT_PROJECT_ID = "9c949a62a5bde2de36fcd8485d568064";

const SHIELDSWAP_METADATA = {
  name: "Aztec Wallet",
  description: "",
  url: "http://localhost:5173",
  icons: [],
};

async function main() {
  const pxe = await PXEFactory.getPXEInstance();
  const walletSdk = await WalletSdkFactory.getWalletSdkInstance();
  const keystore = KeystoreFactory.getKeystore();

  const uiManager = new UIManager();

  const accountService = new AccountService(pxe, keystore, uiManager);
  const tokenService = new TokenService(pxe, uiManager);
  const walletConnectService = new WalletConnectService(WALLETCONNECT_PROJECT_ID, SHIELDSWAP_METADATA, accountService, uiManager);

  uiManager.setWalletConnectService(walletConnectService);
  uiManager.setAccountService(accountService);
  uiManager.setTokenService(tokenService);
  uiManager.setupUI();
}

main().catch(console.error);