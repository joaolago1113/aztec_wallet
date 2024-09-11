import { type AuthWitnessProvider } from '@aztec/aztec.js/account';
import { AuthWitness, type CompleteAddress } from '@aztec/circuit-types';
import { Ecdsa } from '@aztec/circuits.js/barretenberg';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type Fr } from '@aztec/foundation/fields';
import { hash } from 'blake3';

import { DefaultAccountContract } from '@aztec/accounts/defaults';

import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js';

import EcdsaKCustomAccountContractJson from './target/ecdsa_k_custom_account_contract-EcdsaKCustomAccount.json';
export const EcdsaKCustomAccountContractArtifact = loadContractArtifact(EcdsaKCustomAccountContractJson as NoirCompiledContract);

/**
 * Custom account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256k1 public key stored in an immutable encrypted note.
 */
export class EcdsaKCustomAccountContract extends DefaultAccountContract {
  constructor(private signingPrivateKey: Buffer, private totpSecret: Buffer) {
    super(EcdsaKCustomAccountContractArtifact);
  }

  getDeploymentArgs() {
    const signingPublicKey = new Ecdsa().computePublicKey(this.signingPrivateKey);
    return [
      signingPublicKey.subarray(0, 32),
      signingPublicKey.subarray(32, 64),
      this.totpSecret
    ];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new EcdsaKCustomAuthWitnessProvider(this.signingPrivateKey);
  }
}

/** Creates auth witnesses using ECDSA signatures. */
class EcdsaKCustomAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: Buffer) {}

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    // Prompt for TOTP code
    const totpCode = await this.promptForTOTPCode();

    const ecdsa = new Ecdsa();
    const signature = ecdsa.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);

    // Combine the signature with the TOTP code
    const combinedSignature = new Uint8Array(signature.r.length + signature.s.length + 4);
    combinedSignature.set(signature.r, 0);
    combinedSignature.set(signature.s, 32);
    combinedSignature.set(new Uint8Array(new Uint32Array([totpCode]).buffer), 64);

    return Promise.resolve(new AuthWitness(messageHash, [...combinedSignature]));
  }

  private async promptForTOTPCode(): Promise<number> {
    return new Promise((resolve) => {
      const totpCode = prompt("Please enter your TOTP code:");
      if (totpCode === null) {
        throw new Error("TOTP code is required");
      }
      const parsedCode = parseInt(totpCode, 10);
      if (isNaN(parsedCode) || parsedCode < 0 || parsedCode > 999999) {
        throw new Error("Invalid TOTP code. Please enter a 6-digit number.");
      }
      resolve(parsedCode);
    });
  }
}