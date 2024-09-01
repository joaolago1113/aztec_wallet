import { ShieldswapWalletSdk } from "@shieldswap/wallet-sdk";
import { PXEFactory } from './PXEFactory.js';

const WALLETCONNECT_PROJECT_ID = "9c949a62a5bde2de36fcd8485d568064";

export class WalletSdkFactory {
  private static walletSdkInstance: ShieldswapWalletSdk | null = null;

  public static async getWalletSdkInstance(): Promise<ShieldswapWalletSdk> {
    if (!WalletSdkFactory.walletSdkInstance) {
      const pxe = await PXEFactory.getPXEInstance();
      WalletSdkFactory.walletSdkInstance = new ShieldswapWalletSdk(
        {
          projectId: WALLETCONNECT_PROJECT_ID,
        },
        pxe
      );
    }
    return WalletSdkFactory.walletSdkInstance;
  }
}