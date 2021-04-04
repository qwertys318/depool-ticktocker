'use strict';

const fs = require('fs');
const {TonClient} = require('@tonclient/core');
const {libNode} = require('@tonclient/lib-node');
const walletAbi = require('./contracts/SafeMultisigWallet.abi.json');
const depoolAbi = require('./contracts/DePool.abi.json');
const keysCreate = require(process.argv[2]);
const keysConfirm = require(process.argv[3]);
const depoolAddr = process.argv[4];
const walletAddr = process.argv[5];

const ROUND_END = 1606141148;
const VALIDATORS_ELECTED_FOR = 65536;
const ELECTIONS_START_BEFORE = 32768;
const ELECTIONS_END_BEFORE = 8192;
const ELECTIONS_START_BYPASS = 60;

const LAST_TICKTOCK_ELECTIONS_FILENAME = 'last-ticktock-elections-id.data';

TonClient.useBinaryLibrary(libNode);

const client = new TonClient({
  network: {
    server_address: 'main.ton.dev'
  }
});

const _ = {
  log(str) {
    const date = (new Date()).toLocaleString();
    console.log(`${date}: ${str}`);
  },
  getCurrentElectionsId() {
    const ts = Math.floor(Date.now() / 1000);
    let electionsCounter = 0;
    let tmpElectionsEnd = ROUND_END;
    while (1) {
      tmpElectionsEnd += VALIDATORS_ELECTED_FOR;
      electionsCounter++;

      const electionsStart = tmpElectionsEnd - ELECTIONS_START_BEFORE + ELECTIONS_START_BYPASS;
      const electionsEnd = tmpElectionsEnd - ELECTIONS_END_BEFORE;
      if (ts > electionsStart && ts < electionsEnd) {
        return electionsCounter;
      }
      if (tmpElectionsEnd > ts) {
        return null;
      }
    }
  },
  getLastTicktockElectionsId() {
    if (!fs.existsSync(LAST_TICKTOCK_ELECTIONS_FILENAME)) {
      return null;
    }
    return parseInt(fs.readFileSync(LAST_TICKTOCK_ELECTIONS_FILENAME));
  },
  writeLastTicktockElectionsId(id) {
    fs.writeFileSync(LAST_TICKTOCK_ELECTIONS_FILENAME, id.toString());
  },
  async queryWalletBoc(client, walletAddr) {
    const result = await client.net.query_collection({
      collection: 'accounts',
      filter: {id: {eq: walletAddr}},
      result: 'boc',
    });
    return result.result[0].boc;
  },
  async getTxs(client, abi, walletAddr, boc) {
    const signer = {type: 'None'};
    const call_set = {function_name: 'getTransactions'};
    const message = await client.abi.encode_message({abi, address: walletAddr, call_set, signer});
    const resultOfRunTvm = await client.tvm.run_tvm({message: message.message, account: boc});
    const result = await client.abi.decode_message({abi, message: resultOfRunTvm.out_messages[0]});
    return result.value.transactions;
  },
  async confirmTx(client, abi, walletAddr, transactionId, keys) {
    const signer = {type: 'Keys', keys};
    const call_set = {function_name: 'confirmTransaction', input: {transactionId}};
    const message = (await client.abi.encode_message({abi, address: walletAddr, call_set, signer})).message;
    const shard_block_id = (await client.processing.send_message({message, abi, send_events: false})).shard_block_id;
    await client.processing.wait_for_transaction({abi, message, shard_block_id, send_events: false});
  },
  async ticktock(client, walletAbi, depoolAbi, walletAddr, depoolAddr, keys) {
    const payload = (await client.abi.encode_message_body({
      abi: depoolAbi,
      call_set: {function_name: 'ticktock'},
      signer: {type: 'None'},
      is_internal: true,
    })).body;
    const signer = {type: 'Keys', keys};
    const call_set = {
      function_name: 'submitTransaction',
      input: {dest: depoolAddr, value: '1000000000', bounce: false, allBalance: false, payload},
    };
    const message = (await client.abi.encode_message({abi: walletAbi, address: walletAddr, call_set, signer})).message;
    const shard_block_id = (await client.processing.send_message({
      message,
      abi: walletAbi,
      send_events: false
    })).shard_block_id;
    await client.processing.wait_for_transaction({abi: walletAbi, message, shard_block_id, send_events: false});
  },
  async do(client, walletAbi, depoolAbi, walletAddr, depoolAddr, keysCreate, keysConfirm) {
    const currentElectionsId = this.getCurrentElectionsId();
    if (null !== currentElectionsId) {
      this.log(`Current elections id: ${currentElectionsId}.`);
      const lastTicktockElectionsId = this.getLastTicktockElectionsId();
      if (lastTicktockElectionsId !== currentElectionsId) {
        this.log('Ticktock...');
        await this.ticktock(client, walletAbi, depoolAbi, walletAddr, depoolAddr, keysCreate);
        this.writeLastTicktockElectionsId(currentElectionsId);
      } else {
        this.log('Ticktock already performed.');
      }
    } else {
      this.log('No current elections.');
    }

    this.log('Get wallet boc...');
    const walletBoc = await this.queryWalletBoc(client, walletAddr);
    this.log('Get transactions...');
    const txs = await this.getTxs(client, walletAbi, walletAddr, walletBoc);
    for (const tx of txs) {
      if (tx.dest === depoolAddr) {
        this.log(`Confirming transaction '${tx.id}'...`);
        await this.confirmTx(client, walletAbi, walletAddr, tx.id, keysConfirm);
      }
    }
    this.log('Done.');
  }
};

_.do(client, walletAbi, depoolAbi, walletAddr, depoolAddr, keysCreate, keysConfirm)
  .then(() => process.exit())
  .catch((e) => {
    console.error(e);
    process.exit();
  });
