import { PXE } from '@aztec/circuit-types';
import { createPXEClient, waitForPXE } from "@aztec/aztec.js";

const PXE_URL = 'http://localhost:8080';

export class PXEFactory {
  private static pxeInstance: PXE | null = null;

  public static async getPXEInstance(): Promise<PXE> {
    if (!PXEFactory.pxeInstance) {
      PXEFactory.pxeInstance = createPXEClient(PXE_URL);
      await waitForPXE(PXEFactory.pxeInstance);
    }
    return PXEFactory.pxeInstance;
  }
}