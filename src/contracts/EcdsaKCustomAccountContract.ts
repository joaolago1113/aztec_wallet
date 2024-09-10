import { type AuthWitnessProvider } from '@aztec/aztec.js/account';
import { AuthWitness, type CompleteAddress } from '@aztec/circuit-types';
import { Ecdsa } from '@aztec/circuits.js/barretenberg';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type Fr } from '@aztec/foundation/fields';

import { DefaultAccountContract } from '@aztec/accounts/defaults';

import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js';

import EcdsaKCustomAccountContractJson from './target/ecdsa_k_custom_account_contract-EcdsaKCustomAccount.json';
export const EcdsaKCustomAccountContractArtifact = loadContractArtifact(EcdsaKCustomAccountContractJson as NoirCompiledContract);

/**
 * Custom account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256k1 public key stored in an immutable encrypted note.
 */
export class EcdsaKCustomAccountContract extends DefaultAccountContract {
  constructor(private signingPrivateKey: Buffer) {
    super(EcdsaKCustomAccountContractArtifact);
  }

  getDeploymentArgs() {
    const signingPublicKey = new Ecdsa().computePublicKey(this.signingPrivateKey);
    return [signingPublicKey.subarray(0, 32), signingPublicKey.subarray(32, 64)];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new EcdsaKCustomAuthWitnessProvider(this.signingPrivateKey);
  }
}

/** Creates auth witnesses using ECDSA signatures. */
class EcdsaKCustomAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: Buffer) {}

  createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const ecdsa = new Ecdsa();
    const signature = ecdsa.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);
    return Promise.resolve(new AuthWitness(messageHash, [...signature.r, ...signature.s]));
  }
}