'use strict';

const fs = require('fs');
const {TonClient} = require('@tonclient/core');
const {libNode} = require('@tonclient/lib-node');
const walletAbi = require('./contracts/SafeMultisigWallet.abi.json');
const keysConfirm = require(process.argv[2]);
const depoolAddr = process.argv[3];
const walletAddr = process.argv[4];

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
  async do(client, walletAbi, walletAddr, depoolAddr, keysConfirm) {
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

_.do(client, walletAbi, walletAddr, depoolAddr, keysConfirm)
  .then(() => process.exit())
  .catch((e) => {
    console.error(e);
    process.exit();
  });
