import { PXE, AccountWallet, AztecAddress, Fr } from '@aztec/aztec.js';
import { getWallet } from '@aztec/aztec.js/wallet';

import { EcdsaKCustomAccountContract } from '../contracts/EcdsaKCustomAccountContract.js';

export function getCustomEcdsaKWallet(pxe: PXE, address: AztecAddress, signingPrivateKey: Buffer): Promise<AccountWallet> {

  return getWallet(pxe, address, new EcdsaKCustomAccountContract(signingPrivateKey, Buffer.from([])));
}