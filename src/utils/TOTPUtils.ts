import { Fr } from '@aztec/aztec.js';
import * as crypto from 'crypto';

export class TOTPUtils {
  static generateTOTPSecret(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  static hashTOTPSecret(secret: string): Fr {
    const hash = crypto.createHash('sha256').update(secret).digest();
    return Fr.fromBuffer(hash);
  }

  static generateTOTPCode(secretHash: Fr, timeStep: bigint): number {
    const hmac = crypto.createHmac('sha1', secretHash.toBuffer());
    hmac.update(Buffer.from(timeStep.toString(16).padStart(16, '0'), 'hex'));
    const hmacResult = hmac.digest();

    const offset = hmacResult[hmacResult.length - 1] & 0xf;
    const binary =
      ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff);

    return binary % 1000000;
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
}