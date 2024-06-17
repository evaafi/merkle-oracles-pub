import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Dictionary, Sender, SendMode, Slice } from '@ton/core';
import { KeyPair, sign } from '@ton/crypto';
import { convertToMerkleProof, generateMerkleProofDirect } from './merkleProofs';
import { opVerify } from './consts';

export type OracleFull = {
    id: number,
    pubkey: Buffer,
    secret: Buffer
}

export type Oracle = {
    id: number,
    pubkey: Buffer
}

export type OraclePricesData = {
    timestamp: number, 
    prices: Dictionary<bigint, bigint>
}

export type VerifierConfig = {
    oracles: Array<Oracle>;
};

export type SignedData = {
    signature: Buffer,
    packedData: Cell
};

export function verifierConfigToCell(config: VerifierConfig): Cell {
    let dict = Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.Buffer(32));
    for (let oracle of config.oracles) {
        dict.set(oracle.id, oracle.pubkey);
    }
    return beginCell().storeUint(config.oracles.length, 32).storeDict(dict).endCell();
}

export class Verifier implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Verifier(address);
    }

    static createFromConfig(config: VerifierConfig, code: Cell, workchain = 0) {
        const data = verifierConfigToCell(config);
        const init = { code, data };
        return new Verifier(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    static packPricesData(data: OraclePricesData): Cell {
        return beginCell()
          .storeUint(data.timestamp, 32)
          .storeDict(data.prices, Dictionary.Keys.BigUint(256), Dictionary.Values.BigVarUint(4))
        .endCell();
    }

    static signPricesData(oracle: OracleFull, data: OraclePricesData): SignedData {
        let packedData = this.packPricesData(data);
        return {
            signature: sign(packedData.hash(), oracle.secret),
            packedData: packedData
        };
    }

    static createOracleDataProof(oracle: Oracle, 
                                 data: OraclePricesData, 
                                 signature: Buffer,
                                 assets: Array<bigint>): Slice {
        let prunedDict = generateMerkleProofDirect(data.prices, assets, Dictionary.Keys.BigUint(256));
        let prunedData = beginCell().storeUint(data.timestamp, 32).storeMaybeRef(prunedDict).endCell();
        let merkleProof = convertToMerkleProof(prunedData);
        let oracleDataProof = beginCell().storeUint(oracle.id, 32).storeRef(merkleProof).storeBuffer(signature).asSlice();
        return oracleDataProof;
    }

    static packOraclesData(oraclesData: {oracle: Oracle, data: OraclePricesData, signature: Buffer}[], 
                           assets: Array<bigint>): Cell {
        if (oraclesData.length == 0) {
            throw new Error("no oracles data to pack");
        }
        let proofs = oraclesData.sort((d1, d2) => d1.oracle.id - d2.oracle.id).map(
            ({oracle, data, signature}) => this.createOracleDataProof(oracle, data, signature, assets)
        );
        return proofs.reduceRight((acc: Cell | null, val) => beginCell().storeSlice(val).storeMaybeRef(acc).endCell(), null)!;
    }

    static prepareAssetsData(oraclesData: {oracle: Oracle, data: OraclePricesData, signature: Buffer}[], 
                                 assets: Array<bigint>) {
        let byValue = (a: bigint, b: bigint) => (a < b) ? -1 : ((a > b) ? 1 : 0);
        let assetsData = assets.sort(byValue).map((assetId) => {
            let assetPrices = oraclesData.map(({oracle, data}) => {
                let price = data.prices.get(assetId);
                if (price === undefined) {
                    throw new Error(`Missing price data for asset ${assetId} at oracle ${oracle.id}`)
                }
                return price;
            }).sort(byValue);
            let len = assetPrices.length;
            let midRight = Math.floor(len / 2);
            let midLeft = Math.floor((len - 1) / 2); // same for odd len
            let medianPrice = (assetPrices[midLeft] + assetPrices[midRight]) / BigInt(2);
            return {assetId, medianPrice};
        });
        return assetsData;
    }

    static packAssetsData(assetsData: {assetId: bigint, medianPrice: bigint}[]): Cell {
        if (assetsData.length == 0) {
            throw new Error("No assets data to pack");
        }
        return assetsData.reduceRight(
            (acc: Cell | null, {assetId, medianPrice}) => beginCell()
                                                              .storeUint(assetId, 256)
                                                              .storeCoins(medianPrice)
                                                              .storeMaybeRef(acc)
                                                            .endCell(), 
            null
        )!;
    }

    static packRequest(assetsDataCell: Cell, oraclesDataCell: Cell): Cell {
        let request = beginCell()
          .storeUint(opVerify, 32)
          .storeRef(assetsDataCell)
          .storeRef(oraclesDataCell)
        .endCell();
        return request;
    }

    static makeVerifyRequest(oraclesData: {oracle: Oracle, data: OraclePricesData, signature: Buffer}[], 
                               assets: Array<bigint>): Cell {    
        let assetsData = this.prepareAssetsData(oraclesData, assets);
        let assetsDataCell = this.packAssetsData(assetsData);
        
        let oraclesDataCell = this.packOraclesData(oraclesData, assets);
        return this.packRequest(assetsDataCell, oraclesDataCell);
    }

    async getResult(provider: ContractProvider) {
        const { stack } = await provider.get("get_result", []);
        return stack.readCell();
    }
}
