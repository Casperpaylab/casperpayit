import fs from 'fs';
import sdk from 'casper-js-sdk';
import dotenv from 'dotenv';

dotenv.config();

let NODE_RPC = process.env.CSPR_NODE_RPC || process.env.CASPER_NODE_RPC || 'https://node.testnet.cspr.cloud/rpc';
if (NODE_RPC && !NODE_RPC.endsWith('/rpc')) {
  NODE_RPC = NODE_RPC.replace(/\/+$|\s+$/g, '').replace(/\/rpc$/, '') + '/rpc';
}
const DEPLOY_HASH = process.env.DEPLOY_HASH || 'aaa13ac8cd44a7870b6e2e767058057b9a9a2eef98a7fc96b66b019acc8bacd2';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || '15000');
const POLL_ATTEMPTS = Number(process.env.POLL_ATTEMPTS || '20');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async function(){
  try{
    const handler = new sdk.HttpHandler(NODE_RPC);
    if (process.env.CSPR_CLOUD_ACCESS_TOKEN && process.env.CSPR_CLOUD_ACCESS_TOKEN.trim().length > 0) {
      handler.setCustomHeaders({ authorization: process.env.CSPR_CLOUD_ACCESS_TOKEN });
    }
    const rpc = new sdk.RpcClient(handler);

    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
      const res = await rpc.getDeploy(DEPLOY_HASH);
      if (!res || !res.deploy) {
        console.error('No deploy found for', DEPLOY_HASH);
        process.exit(1);
      }

      const exec = res.deploy.execution_info;
      console.log(`Attempt ${attempt}/${POLL_ATTEMPTS}: execution_info keys:`, Object.keys(exec || {}));
      if (exec && exec.execution_result) {
        console.log(JSON.stringify(exec.execution_result, null, 2));
        process.exit(0);
      }

      if (attempt < POLL_ATTEMPTS) {
        console.log(`No execution_result yet; waiting ${POLL_INTERVAL_MS}ms before retrying...`);
        await sleep(POLL_INTERVAL_MS);
      }
    }

    console.error(`Timed out after ${POLL_ATTEMPTS} attempts waiting for execution_result.`);
    process.exit(2);
  } catch(e) {
    console.error('ERROR', e && (e.message || e));
    process.exit(1);
  }
})();
