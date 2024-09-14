import { createHash, randomBytes } from 'crypto';
import { Fr } from "@aztec/aztec.js";

export class CryptoUtils {
  static generateSecretKey(seed?: string, nonce: number = 0): Fr {
    if (!seed) {
      seed = randomBytes(32).toString('hex');
    }
    const hash1 = createHash('sha256').update(`${seed}${nonce}1`).digest('hex');
    const hash2 = createHash('sha256').update(`${seed}${nonce}2`).digest('hex');
    const combinedHash = `${hash1}${hash2}`;
    const combinedBigInt = BigInt('0x' + combinedHash);

    return new Fr(combinedBigInt % Fr.MODULUS);
  }

  static generateHOTPSecret(seed: string | undefined, nonce: number = 0): string {
    if (!seed) {
      seed = randomBytes(32).toString('hex');
    }
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    const hash = createHash('sha256').update(`${seed}${nonce}`).digest();
    
    for (let i = 0; i < 32; i++) {
      const index = hash[i % hash.length] % 32;
      secret += base32Chars[index];
    }

    return secret;
  }
}