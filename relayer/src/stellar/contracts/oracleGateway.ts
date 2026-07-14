// src/stellar/contracts/oracleGateway.ts — OracleGateway call wrappers.
import { nativeToScVal } from '@stellar/stellar-sdk';
import { config } from '../../config';
import { contractCallEnabled, enumScVal, invokeContract, invokeContractTx } from '../client';

export type Winner = 'PlayerA' | 'PlayerB' | 'Draw';

/** Numeric on-chain match IDs only; dev/off-chain match IDs (uuids) are skipped. */
function toU64(matchId: string, label: string): bigint | null {
  if (!/^\d+$/.test(matchId)) {
    console.warn(`[stellar] ${label}: matchId "${matchId}" is not an on-chain u64 — skipping (no-op)`);
    return null;
  }
  return BigInt(matchId);
}

export const oracleGateway = {
  /** post_evaluation(match_id, fen, depth, score) — stores eval, may lock market. */
  async postEvaluation(matchId: string, fen: string, depth: number, score: number): Promise<void> {
    if (!contractCallEnabled(config.ORACLE_GATEWAY_CONTRACT_ID, 'oracle.postEvaluation')) return;
    const id = toU64(matchId, 'oracle.postEvaluation');
    if (id === null) return;

    await invokeContract(config.ORACLE_GATEWAY_CONTRACT_ID, 'post_evaluation', [
      nativeToScVal(id, { type: 'u64' }),
      nativeToScVal(Buffer.from(fen), { type: 'bytes' }),
      nativeToScVal(depth, { type: 'u32' }),
      nativeToScVal(score, { type: 'i32' }),
    ]);
  },

  /**
   * post_result(match_id, winner) — triggers Settlement.execute on-chain.
   * Returns the settlement transaction hash (the relayer submits this tx, and
   * Settlement.execute runs atomically inside it), or null when the call is a
   * no-op (contracts unconfigured, or a dev/off-chain uuid match id).
   */
  async postResult(matchId: string, winner: Winner): Promise<string | null> {
    if (!contractCallEnabled(config.ORACLE_GATEWAY_CONTRACT_ID, 'oracle.postResult')) return null;
    const id = toU64(matchId, 'oracle.postResult');
    if (id === null) return null;

    const { hash } = await invokeContractTx(config.ORACLE_GATEWAY_CONTRACT_ID, 'post_result', [
      nativeToScVal(id, { type: 'u64' }),
      enumScVal(winner),
    ]);
    return hash;
  },
};
