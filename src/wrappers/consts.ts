export const opVerify = 0x3b3cca17;
export const maxTimestampDelta = 180;

export abstract class Errors {
    static incorrect_sequence = 40;
    static incorrect_proof = 41;
    static no_such_oracle = 42;
    static incorrect_signature = 43;
    static incorrect_timestamp = 44;
    static not_enough_data = 45;
    static incorrect_suggested_price = 46;
};