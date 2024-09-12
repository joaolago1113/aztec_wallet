import { PXE, AccountWallet, AztecAddress, Fr } from '@aztec/aztec.js';
import { getWallet } from '@aztec/aztec.js/wallet';

import { EcdsaKCustomAccountContract } from '../contracts/EcdsaKCustomAccountContract.js';

export function getCustomEcdsaKWallet(pxe: PXE, address: AztecAddress, signingPrivateKey: Buffer, totpSecret: string): Promise<AccountWallet> {
  const totpSecretBuffer = Buffer.from(totpSecret);
  return getWallet(pxe, address, new EcdsaKCustomAccountContract(signingPrivateKey, totpSecretBuffer));
}