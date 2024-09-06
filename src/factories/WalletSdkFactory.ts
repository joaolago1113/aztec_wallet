import { ShieldswapWalletSdk } from "@shieldswap/wallet-sdk";
import { PXEFactory } from './PXEFactory.js';
import { CONFIG } from '../config.js';
import { AsyncOrSync } from "ts-essentials";
import { PXE } from "@aztec/aztec.js";

const WALLETCONNECT_PROJECT_ID = CONFIG.WALLETCONNECT_PROJECT_ID;

export class WalletSdkFactory {
  private static walletSdkInstance: ShieldswapWalletSdk | null = null;

  public static async getWalletSdkInstance(): Promise<ShieldswapWalletSdk> {
    if (!WalletSdkFactory.walletSdkInstance) {
      const pxe = await PXEFactory.getPXEInstance();
      
      WalletSdkFactory.walletSdkInstance = new ShieldswapWalletSdk(
        {
          projectId: WALLETCONNECT_PROJECT_ID,
        },
        pxe as any
      );
    }
    return WalletSdkFactory.walletSdkInstance;
  }
}