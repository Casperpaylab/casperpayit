import { getInvoice, updateInvoice, getInvoicesForOwner, saveInvoice, readState } from './state.js';

const CASPER_NODE_RPC = process.env.CASPER_NODE_RPC || null;

async function getOnChainReceivedAmount(accountHash) {
  if (!CASPER_NODE_RPC) return 0;
  try {
    // dynamic import so tests don't fail if not used
    const { CasperServiceByJsonRPC } = await import('casper-js-sdk');
    const client = new CasperServiceByJsonRPC(CASPER_NODE_RPC);

    // normalize account-hash: remove any prefix like 'account-hash-'
    const normalized = String(accountHash).replace(/^account-hash-?/, '');

    // If transfer scanning is enabled, attempt block scanning first (best-effort)
    const useScan = process.env.CASPER_USE_TRANSFER_SCAN === 'true';
    if (useScan) {
      try {
        const scanned = await scanRecentBlocksForPayments(client, normalized, Number(process.env.CASPER_SCAN_LOOKBACK || 50));
        if (scanned > 0) return scanned;
      } catch (e) {
        console.warn('[invoice_listener] transfer-scan failed, falling back to balance', e?.message || e);
      }
    }

    // try common high-level methods first
    if (typeof client.getAccountBalance === 'function') {
      const bal = await client.getAccountBalance(normalized);
      try { return Number(BigInt(bal)) / 1e9; } catch (e) { return Number(bal) / 1e9; }
    }

    if (typeof client.getBalance === 'function') {
      const bal = await client.getBalance(normalized);
      try { return Number(BigInt(bal)) / 1e9; } catch (e) { return Number(bal) / 1e9; }
    }

    // fallback: raw RPC call (state_get_balance or similar)
    if (typeof client.rpc === 'function') {
      try {
        const res = await client.rpc('state_get_balance', [normalized]);
        const candidate = res?.balance ?? res?.result?.balance ?? res?.result?.balance_value ?? null;
        if (candidate != null) {
          try { return Number(BigInt(candidate)) / 1e9; } catch (e) { return Number(candidate) / 1e9; }
        }
      } catch (e) {}
    }

    return 0;
  } catch (err) {
    console.warn('[invoice_listener] Casper RPC failed or unsupported', err?.message || err);
    return 0;
  }
}

async function scanRecentBlocksForPayments(client, normalizedAccountHash, lookback = 50) {
  // Best-effort: attempt to get the latest block height, then iterate backwards
  // and inspect deploy execution results for Transfer transforms.
  try {
    let latestHeight = null;
    if (typeof client.getLatestBlockInfo === 'function') {
      const info = await client.getLatestBlockInfo();
      latestHeight = info?.block?.header?.height || info?.block?.height || null;
    }
    if (latestHeight == null && typeof client.getBlockHeight === 'function') {
      latestHeight = await client.getBlockHeight();
    }
    if (latestHeight == null && typeof client.getBlock === 'function') {
      const block = await client.getBlock();
      latestHeight = block?.header?.height || block?.height || null;
    }
    if (latestHeight == null) return 0;

    let totalMotes = 0n;
    const start = Math.max(1, Number(latestHeight) - lookback + 1);
    for (let h = Number(latestHeight); h >= start; h--) {
      try {
        let block = null;
        if (typeof client.getBlockByHeight === 'function') block = await client.getBlockByHeight(h);
        else if (typeof client.getBlock === 'function') block = await client.getBlock(h);
        else if (typeof client.rpc === 'function') {
          const r = await client.rpc('chain_get_block', [h]);
          block = r?.result || r;
        }
        if (!block) continue;

        const deployHashes = block?.body?.deploy_hashes || block?.body?.deploy_hashes || block?.body?.proposer?.deploy_hashes || [];
        for (const dh of deployHashes) {
          try {
            let deploy = null;
            if (typeof client.getDeploy === 'function') deploy = await client.getDeploy(dh);
            else if (typeof client.rpc === 'function') deploy = (await client.rpc('info_get_deploy', [dh]))?.result || null;
            if (!deploy) continue;
            const execResults = deploy?.execution_results || deploy?.result?.execution_results || deploy?.execution_results || [];
            for (const exec of execResults) {
              const transforms = exec?.result?.transforms || exec?.transforms || exec?.result?.effect?.transforms || [];
              for (const t of transforms) {
                // look for Transfer entries
                if (t?.transform_type === 'Transfer' || t?.transform_type === 'WriteTransfer') {
                  const to = t?.to || t?.recipient || t?.target || t?.account || null;
                  const amount = t?.amount || t?.motes || t?.value || t?.bytes || null;
                  if (!to || !amount) continue;
                  const toNorm = String(to).replace(/^account-hash-?/, '');
                  if (toNorm === normalizedAccountHash) {
                    try { totalMotes += BigInt(amount); } catch (e) { totalMotes += BigInt(Number(amount)); }
                  }
                }
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    return Number(totalMotes) / 1e9;
  } catch (err) {
    console.warn('[invoice_listener] scanRecentBlocksForPayments failed', err?.message || err);
    return 0;
  }
}

export async function checkAndSettleInvoice(invoice) {
  try {
    if (!invoice || !invoice.paymentAddress) return null;
    const onChain = await getOnChainReceivedAmount(invoice.paymentAddress);
    const alreadyPaid = Number(invoice.paid || 0);
    const remaining = Number(invoice.remaining ?? invoice.amount ?? 0);
    const netIncoming = Number(onChain) - alreadyPaid;
    if (netIncoming > 0) {
      const applied = Math.min(netIncoming, remaining);
      const updated = {
        ...invoice,
        paid: (invoice.paid || 0) + applied,
        remaining: Math.max(0, remaining - applied),
        payments: [ ...(invoice.payments || []), { amount: applied, receivedAt: new Date().toISOString(), source: 'onchain' } ],
      };
      if (updated.remaining <= 0) updated.status = 'paid';
      else if (updated.paid > 0) updated.status = 'partial';
      saveInvoice(updated);
      return updated;
    }
    return null;
  } catch (err) {
    console.error('[invoice_listener] checkAndSettleInvoice failed', err?.message || err);
    return null;
  }
}

let _intervalId = null;
export function startInvoiceListener(bot, pollMs = 30000) {
  if (_intervalId) return;
  _intervalId = setInterval(async () => {
    try {
      const state = readState();
      const invoices = Object.values(state.invoices || {});
      for (const inv of invoices) {
        if (!inv || inv.status === 'paid') continue;
        const settled = await checkAndSettleInvoice(inv);
        if (settled) {
          try {
            await bot.telegram.sendMessage(Number(inv.owner), `🔔 Invoice ${inv.id} updated:\n${settled.paid} paid · ${settled.remaining} remaining`);
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[invoice_listener] poll error', err?.message || err);
    }
  }, pollMs);
  // Allow the timer to not block process exit (helpful in tests/CI)
  try { if (_intervalId && typeof _intervalId.unref === 'function') _intervalId.unref(); } catch (e) {}
}

export async function stopInvoiceListener() {
  if (_intervalId) clearInterval(_intervalId);
  _intervalId = null;
}

export default { startInvoiceListener, stopInvoiceListener, checkAndSettleInvoice };
