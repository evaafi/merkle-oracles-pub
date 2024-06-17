# EVAA Oracle

This is the repository for the EVAA Oracle. It provides a decentralized oracle service for the EVAA ecosystem, but can be used by any other project that needs a decentralized oracle service.

## Installation

First, you need to install the dependencies:

```bash
npm install
```

Then, the following environment variables must be set:

| Variable | Description                                                                                            | Recommended Value |
| --- |--------------------------------------------------------------------------------------------------------| --- |
| TELEGRAM_BOT_TOKEN | The Telegram bot token that will be used to send notifications.                                        | - |
| TELEGRAM_CHAT_ID | The chat ID of the Telegram chat where notifications will be sent.                                     | - |
| INFURA_API_KEY | The API key of the Infura that will be used to connect to the Ethereum network (for Supra oracle).     | - |
| RPC_NAMES | The names of the RPCs that will be used. Any name can be used. Must be separated by commas.            | - |
| RPC_ENDPOINTS | The endpoints of the RPCs that will be used. Must be separated by commas.                              | - |
| RPC_API_KEYS | The API keys of the RPCs that will be used. Must be separated by commas.                               | - |
| IOTA_NODES | The nodes of the IOTA network that will be used. Must be separated by commas.                          | https://api.stardust-mainnet.iotaledger.net |
| NFT_ID | The ID of the NFT that will be used to save the oracle data. Must be empty for the first time running. | - |
| IOTA_MNEMONIC | The mnemonic of the IOTA wallet.                                                                       | - |
| SERVICE_ALIAS | The alias of the service. Any name can be used.                                                        | - |
| STRONGHOLD_PASSWORD | The password of the Stronghold snapshot file.                                                          | - |
| IOTA_EXPLORER_URL | The URL of the IOTA explorer.                                                                          | https://explorer.iota.org/mainnet
| ORACLE_ID | The ID of the oracle.                                                                                  | - |
| ORACLE_MNEMONIC | The mnemonic of the oracle.                                                                            | - |

**Important:** It is strongly recommended to have your own IOTA node for stable operation.

Make sure you have at least 1 IOTA token in the wallet to be able to create NFT with needed amount of storage. 

For the first run, you need to create a new NFT by commenting out 3 lines in the `src/index.ts` file:

```typescript
const prices: DataToPush = {"status":"ok","timestamp":1718226090,"packedPrices":"b5ee9c7241020c01000114000109666a0caac001020120020702012003060201200405004dbf748433fcbcc1ac75e54798fb9cdfd8d368b8d6ae3092f4c291cf8465590f7b14a036aeab33b0004dbf6627c5eaf750e15e689006a18f136130fa2b6874a62e57f9c529bc43cfae49cea0385af0a930004dbf895668e908644f30322b997de8faaafc21f05aa52f8982f042dac1fe0b4d09d0501c5b676d58020120080b020120090a004bbf47b22d8d0a21004209a3eeb54d9c61d63c8ef5dbc1a701ddc4311c1cacb03f8c87733a1cd0004bbf670f2d046c32f2b194958abd36b7c71cd118ec635f0990ceac863e9350f1de668772e599d0004bbf8a9006bd3fb03d355daeeff93b24be90afaa6e3ca0073ff5720f8a852c93327843b972cce8a3b24289","signature":"c83003e58a3cb074cdee70d61f7a71e1ac1cd15e84de0d41da77f53ce913a507f770f3c5f3a658cfaba41cddd2520968812664b6b858a7a12ed7623766be7d04","assets":["11876925370864614464799087627157805050745321306404563164673853337929163193738","91621667903763073563570557639433445791506232618002614896981036659302854767224","81203563022592193867903899252711112850180680126331353892172221352147647262515","59636546167967198470134647008558085436004969028957957410318094280110082891718","33171510858320790266247832496974106978700190498800858393089426423762035476944","23103091784861387372100043848078515239542568751939923972799733728526040769767"],"publicKey":"1f9010e120564c457c243efa02583081dea1d76f5a9a2aa04f631e532b647889"};
await iotaWalletService.updateNftOutput(prices, true);
return;
```

and running the following command:

```bash
npm run start
```

After the NFT is created, you can find the NFT ID in your wallet. Then, set the `NFT_ID` environment variable to the NFT ID. Next, comment out the 3 lines in the `src/index.ts` file. Now, you need to build the service:

```bash
docker compose build
```

Finally, you can run the service:

```bash
docker compose up -d
```