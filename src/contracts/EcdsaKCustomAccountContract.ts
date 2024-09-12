import { type AuthWitnessProvider } from '@aztec/aztec.js/account';
import { AuthWitness, type CompleteAddress } from '@aztec/circuit-types';
import { Ecdsa } from '@aztec/circuits.js/barretenberg';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type Fr } from '@aztec/foundation/fields';
import { decode as base32Decode } from 'hi-base32';

import { DefaultAccountContract } from '@aztec/accounts/defaults';

import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js';

import EcdsaKCustomAccountContractJson from './target/ecdsa_k_custom_account_contract-EcdsaKCustomAccount.json';

export const EcdsaKCustomAccountContractArtifact = loadContractArtifact(EcdsaKCustomAccountContractJson as NoirCompiledContract);


/*
export class EcdsaKCustomAccountContract extends DefaultAccountContract {
  constructor(private signingPrivateKey: Buffer) {
    super(EcdsaKCustomAccountContractArtifact as ContractArtifact);
  }

  getDeploymentArgs() {
    const signingPublicKey = new Ecdsa().computePublicKey(this.signingPrivateKey);
    return [signingPublicKey.subarray(0, 32), signingPublicKey.subarray(32, 64)];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new EcdsaKCustomAuthWitnessProvider(this.signingPrivateKey);
  }
}

class EcdsaKCustomAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: Buffer) {}

  createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const ecdsa = new Ecdsa();
    const signature = ecdsa.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);
    return Promise.resolve(new AuthWitness(messageHash, [...signature.r, ...signature.s]));
  }
}
  */


export class EcdsaKCustomAccountContract extends DefaultAccountContract {
  constructor(private signingPrivateKey: Buffer, private totpSecret: Buffer) {
    super(EcdsaKCustomAccountContractArtifact);
  }

  getDeploymentArgs() {

    const signingPublicKey = new Ecdsa().computePublicKey(this.signingPrivateKey);

    const decodedBuffer = base32Decode.asBytes(this.totpSecret.toString());

    return [
      signingPublicKey.subarray(0, 32),
      signingPublicKey.subarray(32, 64),
      Buffer.from(decodedBuffer)
    ];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new EcdsaKCustomAuthWitnessProvider(this.signingPrivateKey);
  }
}

class EcdsaKCustomAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: Buffer) {}

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {

    const totpCode = await this.promptForTOTPCode();

    const ecdsa = new Ecdsa();
    const signature = ecdsa.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);

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