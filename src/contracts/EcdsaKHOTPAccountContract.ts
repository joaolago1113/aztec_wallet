import { type AuthWitnessProvider } from '@aztec/aztec.js/account';
import { AuthWitness, type CompleteAddress } from '@aztec/circuit-types';
import { Ecdsa } from '@aztec/circuits.js/barretenberg';
import { type Fr } from '@aztec/foundation/fields';
import { decode as base32Decode } from 'hi-base32';
import { getWallet } from '@aztec/aztec.js/wallet';
import { PXEFactory } from '../factories/PXEFactory.js';
import { DefaultAccountContract } from '@aztec/accounts/defaults';

import { type NoirCompiledContract, loadContractArtifact, Contract, type AztecAddress } from '@aztec/aztec.js';

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


export class EcdsaKHOTPAccountContract extends DefaultAccountContract {
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
    return new EcdsaKCustomAuthWitnessProvider(this.signingPrivateKey, this, _address.address);
  }
}

class EcdsaKCustomAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: Buffer, private accountContract: DefaultAccountContract, private address: AztecAddress) {}

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    let totpCode = await this.showHOTPModal();

    const ecdsa = new Ecdsa();
    const signature = ecdsa.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);

    const combinedSignature = new Uint8Array(signature.r.length + signature.s.length + 4);
    combinedSignature.set(signature.r, 0);
    combinedSignature.set(signature.s, 32);
    
    const hotpBytes = new Uint8Array(4);
    for (let i = 3; i >= 0; i--) {
        hotpBytes[i] = totpCode % 256;
        totpCode = Math.floor(totpCode / 256);
    }
    combinedSignature.set(hotpBytes, 64);

    return Promise.resolve(new AuthWitness(messageHash, [...combinedSignature]));
  }

  private async showHOTPModal(): Promise<number> {
    const pxe = await PXEFactory.getPXEInstance();

    const wallet = await getWallet(pxe, this.address, this.accountContract);
    const accountContract = await Contract.at(this.address, EcdsaKCustomAccountContractArtifact, wallet);
    const counter = await accountContract.methods.get_counter().simulate();

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content hotp-modal">
          <h2>Enter HOTP Code</h2>
          <p class="hotp-counter">Counter: <span>${counter}</span></p>
          <form id="hotpForm">
            <div class="form-group">
              <label for="hotpCode">6-Digit HOTP Code:</label>
              <input type="text" id="hotpCode" class="input" required pattern="\\d{6}">
            </div>
            <div class="form-actions">
              <button type="submit" class="button primary-button">Submit</button>
              <button type="button" class="button secondary-button" id="cancelHOTP">Cancel</button>
            </div>
          </form>
        </div>
      `;

      const hotpForm = modal.querySelector('#hotpForm') as HTMLFormElement;
      const cancelButton = modal.querySelector('#cancelHOTP') as HTMLButtonElement;

      cancelButton.addEventListener('click', () => {
        document.body.removeChild(modal);
        throw new Error('HOTP code entry cancelled');
      });

      hotpForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const hotpCodeInput = hotpForm.querySelector('#hotpCode') as HTMLInputElement;
        const hotpCode = hotpCodeInput.value.trim();

        if (hotpCode.length !== 6 || !/^\d+$/.test(hotpCode)) {
          alert('Please enter a valid 6-digit HOTP code.');
          return;
        }

        document.body.removeChild(modal);
        resolve(parseInt(hotpCode, 10));
      });

      document.body.appendChild(modal);
    });
  }
}