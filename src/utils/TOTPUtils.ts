import { Fr } from '@aztec/aztec.js';
import { hash as blake3Hash } from 'blake3';
import { randomBytes } from 'crypto';

export class TOTPUtils {
  static generateTOTPSecret(seed: string | undefined): string {
    if (!seed) {
      seed = randomBytes(32).toString('hex');
    }
    const hash = blake3Hash(Buffer.from(seed));
    return hash.toString('base64');
  }

  /*
  static generateTOTPCode(secretHash: Fr, timeStep: bigint): number {
    // Convert the secret hash and time step into a suitable format for hashing
    const timeStepBytes = Buffer.from(timeStep.toString(16).padStart(16, '0'), 'hex');
    const input = Buffer.concat([secretHash.toBuffer(), timeStepBytes]);

    // Use BLAKE3 for hashing
    const hashResult = blake3Hash(input);

    // Extract the TOTP code from the hash output
    const offset = hashResult[31] & 0xf;
    const binary =
      ((hashResult[offset] & 0x7f) << 24) |
      ((hashResult[offset + 1] & 0xff) << 16) |
      ((hashResult[offset + 2] & 0xff) << 8) |
      (hashResult[offset + 3] & 0xff);

    return binary % 1000000; // Return a 6-digit code
  }

  static validateTOTPCode(providedCode: number, secretHash: Fr, currentTimestamp: bigint): boolean {
    const timeStep = currentTimestamp / BigInt(30);

    for (let i = -2; i <= 2; i++) {
      const validCode = TOTPUtils.generateTOTPCode(secretHash, timeStep + BigInt(i));
      if (providedCode === validCode) {
        return true;
      }
    }

    return false;
  }
    */
}
