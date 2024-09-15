mod hotp_note;

contract EcdsaKHOTPAccount {

    use crate::hotp_note::HotpSecretNote;

    use dep::aztec::prelude::{PrivateContext, PrivateImmutable, PrivateMutable };
    use dep::aztec::{
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note_with_keys,
        keys::getters::get_current_public_keys
    };

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
    fn constructor(signing_pub_key_x: [u8; 32], signing_pub_key_y: [u8; 32], hotp_secret: [u8; 20]) {
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

    // Note: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts
    #[aztec(private)]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payload, cancellable);
    }

    #[aztec(private)]
    #[aztec(noinitcheck)]
    #[aztec(view)]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[aztec(noinitcheck)]
    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        // Load storage
        let storage = Storage::init(context);

        // Load public key from storage
        let public_key = storage.public_key.get_note();

        // Load hotp_secret note
        let mut hotp_secret = storage.hotp_secret.get_note().note;

        // Load auth witness
        let witness: [Field; 68] = unsafe { get_auth_witness(outer_hash) };
        let mut signature: [u8; 64] = [0; 64];
        for i in 0..64 {
            signature[i] = witness[i] as u8;
        }

        // Verify payload signature using Ethereum's signing scheme
        let outer_hash_bytes: [u8; 32] = outer_hash.to_be_bytes();
        let hashed_message: [u8; 32] = std::hash::sha256(outer_hash_bytes);
        let verification = std::ecdsa_secp256k1::verify_signature(
            public_key.x,
            public_key.y,
            signature,
            hashed_message,
        );

        assert(verification == true, "Invalid ECDSA signature");

        // Extract HOTP code from the witness
        let hotp_code = (witness[67] as u32)
            | ((witness[66] as u32) << 8)
            | ((witness[65] as u32) << 16)
            | ((witness[64] as u32) << 24);

        let hotp_secret_bytes: [u8; 20] = hotp_secret.value.to_be_bytes();

        // Generate valid HOTP codes for counter -1, counter, counter +1
        let mut code_valid = false;

        // Handle potential underflow when subtracting 1 from the counter
        let mut counters_to_try: [Field; 3] = [0; 3];
        
        if ((hotp_secret.counter as u8) > 0) {

            counters_to_try =
            [
                hotp_secret.counter,
                hotp_secret.counter - 1,
                hotp_secret.counter + 1,
            ];
        } else {
            counters_to_try = [hotp_secret.counter, hotp_secret.counter + 1, hotp_secret.counter + 2];
        };

        let mut valid_code = generate_hotp_code(hotp_secret_bytes, counters_to_try[0] as u64);

        if hotp_code == valid_code {
            code_valid = true;
        }else{
            valid_code = generate_hotp_code(hotp_secret_bytes, counters_to_try[1] as u64);

            if hotp_code == valid_code {
                code_valid = true;
            }else{
                valid_code = generate_hotp_code(hotp_secret_bytes, counters_to_try[2] as u64);

                if hotp_code == valid_code {
                    code_valid = true;
                }
            }
        }

        assert(code_valid == true, "Invalid HOTP code");

        // Update the counter to the accepted counter + 1
        hotp_secret.counter += 1;

        // Replace the hotp_secret note with the updated counter
        let this = context.this_address();
        let this_keys = get_current_public_keys(context, this);

        storage.hotp_secret
            .replace(&mut hotp_secret)
            .emit(encode_and_encrypt_note_with_keys(
                context,
                this_keys.ovpk_m,
                this_keys.ivpk_m,
                this,
            ));

        true
    }


    #[contract_library_method]
    fn generate_hotp_code(key: [u8; 20], counter: u64) -> u32 {

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
        
        result
    }

    #[contract_library_method]
    fn hmac_sha256(mut key: [u8; 20], data: [u8; 8]) -> [u8; 32] {

        let mut key_copy: [u8; 64] = [0; 64];

        for i in 0..key.len() {
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

    #[contract_library_method]
    fn bytes_le_to_field(bytes: [u8; 20]) -> Field {
        let mut field_value: Field = 0;
        let mut base: Field = 1;

        for i in 0..20 {
            field_value += bytes[19 - i] as Field * base;
            base *= 256;
        }

        field_value
    }

    unconstrained fn get_counter() -> pub Field {
        let storage = Storage::init(context);
        let hotp_secret_note = storage.hotp_secret.view_note();
        hotp_secret_note.counter
}


}
