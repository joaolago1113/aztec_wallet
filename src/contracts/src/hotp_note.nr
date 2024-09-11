use dep::aztec::prelude::{AztecAddress, PrivateContext, NoteHeader, NoteInterface};
use dep::aztec::{
    protocol_types::{constants::GENERATOR_INDEX__NOTE_NULLIFIER, hash::poseidon2_hash_with_separator},
    note::utils::compute_note_hash_for_nullify, keys::getters::get_nsk_app
};

global HOTP_SECRET_NOTE_LEN: Field = 3; 
// Fields: 1 for Hotp_secret + 1 for npk_m_hash
global HOTP_SECRET_NOTE_BYTES_LEN: Field = 3 * 32 + 64; 
// 32 bytes for Hotp_secret + 32 bytes for npk_m_hash

#[aztec(note)]
struct HotpSecretNote {
    value: Field,
    counter: u64,
    npk_m_hash: Field,
}

impl NoteInterface<HOTP_SECRET_NOTE_LEN, HOTP_SECRET_NOTE_BYTES_LEN> for HotpSecretNote {
    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        let secret = context.request_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator([
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let secret = get_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator([
            note_hash_for_nullify,
            secret,
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
}

impl HotpSecretNote {
    pub fn new(value: Field, counter: u64, npk_m_hash: Field) -> Self {

        HotpSecretNote {
            value,  
            counter,
            npk_m_hash, 
            header: NoteHeader::empty() 
        }
    }
}
