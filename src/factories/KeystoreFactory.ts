import { KeyStore } from '../utils/Keystore.js';

export class KeystoreFactory {
  private static keystore: InstanceType<typeof KeyStore> | null = null;

  public static getKeystore(): InstanceType<typeof KeyStore> {
    if (!KeystoreFactory.keystore) {
      KeystoreFactory.keystore = new KeyStore();
    }
    return KeystoreFactory.keystore;
  }
}