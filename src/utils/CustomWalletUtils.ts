import { PXE, AccountWallet, AztecAddress, Contract, ContractArtifact } from '@aztec/aztec.js';
import { getWallet } from '@aztec/aztec.js/wallet';
import { EcdsaKAccountContractArtifact, EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
import { EcdsaKHOTPAccountContract } from '../contracts/EcdsaKHOTPAccountContract.js';
import EcdsaKCustomAccountContractJson from '../contracts/target/ecdsa_k_hotp_account_contract-EcdsaKHOTPAccount.json';
import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js';
import { KeystoreFactory } from '../factories/KeystoreFactory.js';

export async function getCustomEcdsaKWallet(pxe: PXE, address: AztecAddress, signingPrivateKey: Buffer): Promise<AccountWallet> {

  const keystore = KeystoreFactory.getKeystore();

  const is2FAEnabled = (await keystore.isAccount2FA(address));

  if (is2FAEnabled) {

    const hotpSecret = await keystore.get2FASecret(address);

    return await getWallet(pxe, address, new EcdsaKHOTPAccountContract(signingPrivateKey, hotpSecret));

  }else{
    
    return await getWallet(pxe, address, new EcdsaKAccountContract(signingPrivateKey));
  }
}