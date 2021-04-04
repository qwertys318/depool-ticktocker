# Free TON Depool Ticktocker

The script helps to take depool ticktocking under your control.  
### What is this script doing?
- Waiting for elections.
- Waiting "unfreeze stake time" after start of elections.
- Send ticktock only one time by elections.
- Confirm any(!) transactions from your wallet to depool.

### Requirements
- Node.js v10.21.0+
- Yarn 1.22.5+

### Installation
```
git clone https://github.com/qwertys318/depool-ticktocker.git
cd depool-ticktocker
yarn install
```

### Using
Call script with following parameters:
```
node ./index.js {PATH_MSIG_CUTSTODIAN_1_KEYS_JSON} {PATH_MSIG_CUTSTODIAN_2_KEYS_JSON} {DEPOOL_ADDR} {MSIG_ADDR}
```
Cron example:
```
*/15 * * * * node /home/freeton/depool-ticktocker/index.js /home/freeton/ton-keys/msig.keys.json /home/freeton/ton-keys/confirm.keys.json 0:6be946e953ef40045c6d4b0be2c90aa5eef571fb69be4be59275cf7a0ba7a857 0:ef6685ec161bb90678ad85aac1c17d5f5c20cbfbd2822d608e47eccabda4f286 >> /home/freeton/depool-ticktocker/log.log
```
