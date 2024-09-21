import { type AuthWitnessProvider } from '@aztec/aztec.js/account';
import { AuthWitness, type CompleteAddress } from '@aztec/circuit-types';
import { Ecdsa } from '@aztec/circuits.js/barretenberg';
import { type Fr } from '@aztec/foundation/fields';
import { decode as base32Decode } from 'hi-base32';
import { getWallet } from '@aztec/aztec.js/wallet';
import { PXEFactory } from '../factories/PXEFactory.js';
import { DefaultAccountContract } from '@aztec/accounts/defaults';
import { sha256 } from '../utils/CryptoUtils.js';

import { type NoirCompiledContract, loadContractArtifact, Contract, type AztecAddress } from '@aztec/aztec.js';

import EcdsaKCustomAccountContractJson from './target/ecdsa_k_hotp_account_contract2-EcdsaKHOTPAccount2.json';

export const EcdsaKCustomAccountContractArtifact = loadContractArtifact(EcdsaKCustomAccountContractJson as NoirCompiledContract);


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
    let hotpCode = await this.showHOTPModal();
  
    // Convert hotpCode to bytes
    const hotpBytes = new Uint8Array(4);
    let tempCode = hotpCode;
    for (let i = 3; i >= 0; i--) {
      hotpBytes[i] = tempCode % 256;
      tempCode = Math.floor(tempCode / 256);
    }
  
    // Construct combined message
    const messageHashBytes = messageHash.toBuffer(); 
    
    const combinedMessage = new Uint8Array(messageHashBytes.length + hotpBytes.length);
    combinedMessage.set(messageHashBytes, 0);
    combinedMessage.set(hotpBytes, messageHashBytes.length);
  
    // Compute combinedMessageHash
    const combinedMessageHash = sha256(combinedMessage);
  
    // Sign the combinedMessageHash
    const ecdsa = new Ecdsa();
    const signature = ecdsa.constructSignature(combinedMessageHash, this.signingPrivateKey);
  
    // Auth witness is the signature (r, s)
    return Promise.resolve(new AuthWitness(messageHash, [...signature.r, ...signature.s]));
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
          <h2>Enter 2FA Code</h2>
          <p class="hotp-counter">Counter: <span>${counter}</span></p>
          <form id="hotpForm">
            <div class="form-group">
              <div class="input-group">
                <input type="text" id="hotpCode1" class="input code-input" maxlength="1" required>
                <input type="text" id="hotpCode2" class="input code-input" maxlength="1" required>
                <input type="text" id="hotpCode3" class="input code-input" maxlength="1" required>
                <input type="text" id="hotpCode4" class="input code-input" maxlength="1" required>
                <input type="text" id="hotpCode5" class="input code-input" maxlength="1" required>
                <input type="text" id="hotpCode6" class="input code-input" maxlength="1" required>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="button primary-button">Submit</button>
              <button type="button" class="button secondary-button" id="cancelHOTP">Cancel</button>
            </div>
          </form>
        </div>
      `;
      modal.style.zIndex = '999999999999';

      const hotpForm = modal.querySelector('#hotpForm') as HTMLFormElement;
      const cancelButton = modal.querySelector('#cancelHOTP') as HTMLButtonElement;
      const codeInputs = modal.querySelectorAll('.code-input');

      codeInputs.forEach((input, index) => {
        (input as HTMLInputElement).addEventListener('input', (event) => {
          const target = event.target as HTMLInputElement;
          const value = target.value;

          if (index === 0 && value.length === 6) {
            // If pasting into the first input and it's 6 digits, distribute to all inputs
            for (let i = 0; i < 6; i++) {
              (codeInputs[i] as HTMLInputElement).value = value[i];
            }
            (codeInputs[5] as HTMLInputElement).focus();
          } else if (value.length === 1 && index < codeInputs.length - 1) {
            (codeInputs[index + 1] as HTMLInputElement).focus();
          }
        });
        (input as HTMLInputElement).addEventListener('paste', (event) => {
          event.preventDefault();
          const pastedText = (event.clipboardData || (window as any).clipboardData).getData('text');
          if (pastedText.length === 6 && /^\d+$/.test(pastedText)) {
            for (let i = 0; i < 6; i++) {
              (codeInputs[i] as HTMLInputElement).value = pastedText[i];
            }
            (codeInputs[5] as HTMLInputElement).focus();
          }
        });
        (input as HTMLInputElement).style.caretColor = 'transparent';
      });

      cancelButton.addEventListener('click', () => {
        document.body.removeChild(modal);
        throw new Error('HOTP code entry cancelled');
      });

      hotpForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const hotpCode = Array.from(codeInputs).map(input => (input as HTMLInputElement).value).join('');

        if (hotpCode.length !== 6 || !/^\d+$/.test(hotpCode)) {
          alert('Please enter a valid 6-digit 2FA code.');
          return;
        }

        document.body.removeChild(modal);
        resolve(parseInt(hotpCode, 10));
      });

      document.body.appendChild(modal);
      (codeInputs[0] as HTMLInputElement).focus();
    });
  }
}