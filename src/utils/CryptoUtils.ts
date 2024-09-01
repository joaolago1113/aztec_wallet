import { createHash, randomBytes } from 'crypto';
import { Fr } from "@aztec/aztec.js";
import { CompleteAddress, derivePublicKeyFromSecretKey, Point, deriveSigningKey, deriveKeys } from '@aztec/circuits.js';


export class CryptoUtils {
  static async generateSecretKey(seed?: string): Promise<Fr> {
    if (!seed) {
      seed = randomBytes(32).toString('hex');
    }

    const hash1 = createHash('sha256').update(`${seed}1`).digest('hex');
    const hash2 = createHash('sha256').update(`${seed}2`).digest('hex');
    const combinedHash = `${hash1}${hash2}`;
    const combinedBigInt = BigInt('0x' + combinedHash);

    return new Fr(combinedBigInt % Fr.MODULUS);
  }

  static deriveSigningKey = deriveSigningKey;
}