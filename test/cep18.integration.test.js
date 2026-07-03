import request from 'supertest';
import facilitatorStub from '../server/facilitatorStub.js';
import dotenv from 'dotenv';

dotenv.config();

const runIntegration = process.env.INTEGRATION === '1';

const describeIf = runIntegration ? describe : describe.skip;

describeIf('CEP-18 operator integration (requires RPC + funded account)', () => {
  test('operator-built CEP-18 transfer via facilitator stub', async () => {
    const required = [
      'OPERATOR_PUBLIC_KEY',
      'OPERATOR_PRIVATE_KEY',
      'TOKEN_CONTRACT_HASH',
      'CSPR_NODE_RPC',
      'TEST_TARGET_PUBLIC_KEY',
    ];
    for (const v of required) {
      if (!process.env[v]) throw new Error(`Missing required env var for integration test: ${v}`);
    }

    const amount = process.env.TEST_TRANSFER_AMOUNT || '1';
    const res = await request(facilitatorStub)
      .post('/settle')
      .send({ transfer: { amount, targetPublicKeyHex: process.env.TEST_TARGET_PUBLIC_KEY, tokenContractHash: process.env.TOKEN_CONTRACT_HASH } })
      .timeout(120000);

    // Accept either settled=true (200) or a 202 in-progress response
    expect([200, 202].includes(res.status)).toBe(true);
    if (res.status === 200) {
      expect(res.body.settled).toBe(true);
      expect(res.body.txHash).toBeDefined();
    }
  }, 180000);
});
