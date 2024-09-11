mod hotp_note;

contract EcdsaKCustomAccount {

    use crate::hotp_note::HotpSecretNote;

    use dep::aztec::prelude::{AztecAddress, FunctionSelector, NoteHeader, NoteGetterOptions, PrivateContext, PrivateImmutable, PrivateMutable};
    use dep::aztec::{
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note_with_keys,
        keys::getters::get_current_public_keys
    };
    use dep::std;

    use dep::authwit::{
        entrypoint::{app::AppPayload, fee::FeePayload}, account::AccountActions,
        auth_witness::get_auth_witness
    };

    use dep::ecdsa_public_key_note::EcdsaPublicKeyNote;

    #[aztec(storage)]
    struct Storage {
        public_key: PrivateImmutable<EcdsaPublicKeyNote>,
        hotp_secret: PrivateMutable<HotpSecretNote>,
    }

    // Creates a new account out of an ECDSA public key to use for signature verification
    #[aztec(private)]
    #[aztec(initializer)]
    fn constructor(signing_pub_key_x: [u8; 32], signing_pub_key_y: [u8; 32], hotp_secret: [u8; 32]) {
        let this = context.this_address();
        let this_keys = get_current_public_keys(&mut context, this);
        // Not emitting outgoing for msg_sender here to not have to register keys for the contract through which we
        // deploy this (typically MultiCallEntrypoint). I think it's ok here as I feel the outgoing here is not that
        // important.

        let hotp_secret: Field = bytes_le_to_field(hotp_secret);

        let mut pub_key_note = EcdsaPublicKeyNote::new(signing_pub_key_x, signing_pub_key_y, this_keys.npk_m.hash());
        storage.public_key.initialize(&mut pub_key_note).emit(encode_and_encrypt_note_with_keys(&mut context, this_keys.ovpk_m, this_keys.ivpk_m, this));

        let mut hotp_note = HotpSecretNote::new(hotp_secret, 0, this_keys.npk_m.hash());
        storage.hotp_secret.initialize(&mut hotp_note).emit(encode_and_encrypt_note_with_keys(&mut context, this_keys.ovpk_m, this_keys.ivpk_m, this));
    }

    // Note: If you globally change the entrypoint signature don't forget to update default_entrypoint.ts
    #[aztec(private)]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payload);
    }

    #[aztec(private)]
    #[aztec(noinitcheck)]
    #[aztec(view)]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        // Load public key and HOTP secret hash from storage
        let storage = Storage::init(context);
        let public_key = storage.public_key.get_note();
        let mut hotp_secret = storage.hotp_secret.get_note().note;

        // Load auth witness
        let witness: [Field; 68] = get_auth_witness(outer_hash); // Increased to 68 to include HOTP code
        let mut signature: [u8; 64] = [0; 64];
        for i in 0..64 {
            signature[i] = witness[i] as u8;
        }

        // Extract HOTP code from the witness
        let hotp_code = (witness[64] as u32) | ((witness[65] as u32) << 8) | ((witness[66] as u32) << 16) | ((witness[67] as u32) << 24);

        let hotp_secret_bytes: [u8; 32] = hotp_secret.value.to_be_bytes(32).as_array();

        let valid_code = generate_hotp_code(hotp_secret_bytes, hotp_secret.counter);
        // Verify HOTP code
        assert(hotp_code == valid_code, "Invalid HOTP code");

        // Verify payload signature using Ethereum's signing scheme
        let outer_hash_bytes: [u8; 32] = outer_hash.to_be_bytes(32).as_array();
        let hashed_message: [u8; 32] = std::hash::sha256(outer_hash_bytes);
        let verification = std::ecdsa_secp256k1::verify_signature(public_key.x, public_key.y, signature, hashed_message);
        assert(verification == true, "Invalid ECDSA signature");

        let this = context.this_address();
        let this_keys = get_current_public_keys(context, this);

        hotp_secret.counter += 1;
        storage.hotp_secret.replace(&mut hotp_secret).emit(encode_and_encrypt_note_with_keys( context, this_keys.ovpk_m, this_keys.ivpk_m, this));

        true
    }

    fn generate_hotp_code(key: [u8; 32], counter: u64) -> pub u32 {

        let mut counter_bytes: [u8; 8] = [0; 8];

        for i in 0..8 {
            counter_bytes[i] = ((counter >> (56 - i * 8)) & 0xff) as u8;
        }

        let hmac_result = hmac_sha256(key, counter_bytes);
        let offset = (hmac_result[31] & 0x0f) as u32;
        let binary = ((hmac_result[offset] & 0x7f) as u32) << 24
            | (hmac_result[offset + 1] as u32) << 16
            | (hmac_result[offset + 2] as u32) << 8
            | (hmac_result[offset + 3] as u32);

        let mut result = binary % 1000000; 
        let mut field_value: Field = 0;
        let mut base: Field = 1;

        for _ in 0..6 {
            field_value += (result % 10) as Field * base;
            result = result / 10;
            base *= 10; 
        }

        field_value as u32
    }


    fn hmac_sha256(key: [u8; 32], data: [u8; 8]) -> pub [u8; 32] {

        let mut key_copy: [u8; 64] = [0; 64];

        for i in 0..32 {
            key_copy[i] = key[i];
        }

        // Inner and outer padding constants for HMAC
        let ipad: [u8; 64] = [0x36; 64];
        let opad: [u8; 64] = [0x5c; 64];

        // XOR key with ipad and opad
        let mut i_key_pad: [u8; 64] = [0; 64];
        let mut o_key_pad: [u8; 64] = [0; 64];

        for i in 0..64 {
            i_key_pad[i] = key_copy[i] ^ ipad[i];
            o_key_pad[i] = key_copy[i] ^ opad[i];
        }

        // Perform inner hash (SHA-256)
        let mut inner_data: [u8; 72] = [0; 72];
        for i in 0..64 {
            inner_data[i] = i_key_pad[i];
        }
        for i in 0..8 {
            inner_data[i + 64] = data[i];
        }
        let inner_hash = std::hash::sha256(inner_data);

        // Perform outer hash (SHA-256)
        let mut outer_data: [u8; 96] = [0; 96];
        for i in 0..64 {
            outer_data[i] = o_key_pad[i];
        }
        for i in 0..32 {
            outer_data[i + 64] = inner_hash[i];
        }
        let final_hash = std::hash::sha256(outer_data);

        final_hash
    }

    fn bytes_le_to_field(bytes: [u8; 32]) -> pub Field {
        let mut field_value: Field = 0;
        let mut base: Field = 1;

        for i in 0..32 {
            field_value += bytes[i] as Field * base;
            base *= 256;
        }

        field_value
    }
}