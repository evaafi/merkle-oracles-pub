import {
    AccountAddress,
    AddressUnlockCondition,
    CoinType, Ed25519Address, FeatureType, hexToUtf8,
    initLogger, MetadataFeature, NftOutput,
    Output,
    OutputType,
    UnlockCondition, utf8ToHex, Utils,
    Wallet,
    WalletOptions
} from "@iota/sdk";
import path from "path";
import { DataToPush } from "../types";

export class WalletService {
    private wallet: Wallet;
    private readonly alias: string;
    private readonly walletPath: string;

    constructor(alias: string, dbPath: string) {
        this.alias = alias;
        this.walletPath = dbPath;
    }

    async initAccount() {
        try {
            this.wallet = new Wallet({
                storagePath: path.join(this.walletPath, 'db'),
            });
            await this.wallet.setStrongholdPassword(process.env.STRONGHOLD_PASSWORD);

            const account = await this.wallet.getAccount(this.alias);
            // console.log(await account.addresses())
        } catch (error) {
            console.log(error)
            console.log('Wallet not found, creating...');
            this.wallet = await this.createWallet();
        }
    }

    private async createWallet(): Promise<Wallet> {
        try {
            const walletOptions: WalletOptions = {
                storagePath: path.join(this.walletPath, 'db'),
                clientOptions: {
                    nodes: process.env.IOTA_NODES.split(','),
                },
                coinType: CoinType.IOTA,
                secretManager: {
                    stronghold: {
                        snapshotPath: path.join(this.walletPath, 'wallet.stronghold'),
                        password: process.env.STRONGHOLD_PASSWORD,
                    },
                },
            };

            this.wallet = new Wallet(walletOptions);
            await this.wallet.storeMnemonic(process.env.IOTA_MNEMONIC);

            const account = await this.wallet.createAccount({
                alias: this.alias,
            });
            //console.log(account);
            console.log('Generated new account:', account.getMetadata().alias);
            return this.wallet;
        } catch (error) {
            console.error('Can not create account: ', error);
            throw (error)
        }
    }
    async destroyWallet() {
        await this.wallet.destroy();
    }
    async getAddress(): Promise<AccountAddress> {
        const account = await this.wallet.getAccount(this.alias);
        const addresses = await account.addresses();
        return addresses[0];
    }

    async updateNftOutput(prices: DataToPush, creating = false) {
        try {
            const account = await this.wallet.getAccount(this.alias);
            await account.sync();
            const balance = await account.getBalance();
            if (!(balance.nfts.includes(process.env.NFT_ID)) && !creating) {
                throw new Error(`NFT not found in balance: ${process.env.NFT_ID}`);
            }

            const addressUnlockCondition: UnlockCondition =
                new AddressUnlockCondition(
                    new Ed25519Address(
                        Utils.bech32ToHex((await this.getAddress()).address)
                    ));
            const client = await this.wallet.getClient();
            const nftOutputWithMetadata = await client.buildNftOutput({
                nftId: process.env.NFT_ID !== '' ? process.env.NFT_ID : '0x0000000000000000000000000000000000000000000000000000000000000000',
                unlockConditions: [addressUnlockCondition],
                features: [new MetadataFeature(utf8ToHex(JSON.stringify(prices)))],
            });
            const transaction = await account.sendOutputs([nftOutputWithMetadata]);
            console.log(`Transaction sent: ${transaction.transactionId}`);
            const blockId = await account.retryTransactionUntilIncluded(
                transaction.transactionId,
            );
            console.log(`Block included: ${process.env.IOTA_EXPLORER_URL}/block/${blockId}`);
        } catch (error) {
            console.error('Can not send transaction: ', error);
            throw (error)
        }
    }

    async getPrices(): Promise<DataToPush> {
        try {
            const account = await this.wallet.getAccount(this.alias);
            await account.sync();
            const balance = await account.getBalance();
            if (!(balance.nfts.includes(process.env.NFT_ID))) {
                throw new Error(`NFT not found in balance: ${process.env.NFT_ID}`);
            }
            const client = await this.wallet.getClient();
            const nftOutputString = await client.nftOutputId(process.env.NFT_ID);
            const output = await client.getOutput(nftOutputString);
            if (output.output.type !== OutputType.Nft) {
                throw new Error('Output is not NFT');
            }
            const nftOutput = Output.parse(output.output) as NftOutput;
            const features = nftOutput.getFeatures();
            if (features[0].type !== FeatureType.Metadata) {
                throw new Error('First feature is not Metadata');
            }
            const meta = nftOutput.getFeatures()[0] as MetadataFeature;
            return JSON.parse(hexToUtf8(meta.data));
        } catch (error) {
            console.error('Can not get prices from nft: ', error);
            throw (error)
        }
    }
}
