// src/stellar/eventListener.ts — polls Soroban RPC getEvents for the five
// MateFi contracts, mirrors on-chain state into MongoDB and broadcasts
// websocket events (README sections 8 + 13).
//
// Skips gracefully (single startup warning) when no contract IDs are
// configured, so the relayer runs locally before deployment.
import { scValToNative, xdr } from '@stellar/stellar-sdk';
import { config, isContractConfigured } from '../config';
import { getRpcServer } from './client';
import { predictionPool } from './contracts/predictionPool';
import { settlement } from './contracts/settlement';
import { broadcastToMatch } from '../websocket/server';
import { initGame } from '../chess/gameManager';
import * as matchesDb from '../db/queries/matches';
import * as tradersDb from '../db/queries/traders';

interface DecodedEvent {
  id: string;
  contractId: string;
  name: string;        // topic[0] symbol, e.g. "MatchCreated"
  values: unknown[];   // decoded tuple payload
  txHash: string | null; // hash of the transaction that emitted the event
}

let timer: NodeJS.Timeout | null = null;
let polling = false;
let startLedger: number | null = null;
const seenEventIds = new Set<string>();

function configuredContractIds(): string[] {
  return [
    config.MATCH_REGISTRY_CONTRACT_ID,
    config.ESCROW_VAULT_CONTRACT_ID,
    config.PREDICTION_POOL_CONTRACT_ID,
    config.ORACLE_GATEWAY_CONTRACT_ID,
    config.SETTLEMENT_CONTRACT_ID,
  ].filter(isContractConfigured);
}

export function startEventListener(): void {
  const contractIds = configuredContractIds();
  if (contractIds.length === 0) {
    console.warn(
      '[events] no contract IDs configured — on-chain event listener disabled ' +
        '(local/DEV mode; set *_CONTRACT_ID env vars after deployment)'
    );
    return;
  }

  console.log(`[events] polling ${contractIds.length} contract(s) every ${config.EVENT_POLL_INTERVAL_MS}ms`);
  timer = setInterval(() => {
    void poll(contractIds);
  }, config.EVENT_POLL_INTERVAL_MS);
}

export function stopEventListener(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function poll(contractIds: string[]): Promise<void> {
  if (polling) return; // skip overlapping polls
  polling = true;
  try {
    const rpc = getRpcServer();

    if (startLedger === null) {
      const latest = await rpc.getLatestLedger();
      startLedger = Math.max(1, latest.sequence - config.EVENT_START_LOOKBACK_LEDGERS);
      if (config.EVENT_START_LOOKBACK_LEDGERS > 0) {
        console.log(
          `[events] starting at ledger ${startLedger} ` +
            `(${config.EVENT_START_LOOKBACK_LEDGERS} ledgers back from ${latest.sequence})`
        );
      }
    }

    let response;
    try {
      response = await rpc.getEvents({
        startLedger,
        filters: [{ type: 'contract', contractIds }],
        limit: 100,
      });
    } catch (e) {
      // The requested start ledger may predate the RPC's retention window.
      // Reset to the current ledger and resume forward — better than wedging.
      const msg = (e as Error).message;
      if (/ledger|start|range|retention|oldest/i.test(msg)) {
        const latest = await rpc.getLatestLedger();
        console.warn(
          `[events] start ledger ${startLedger} outside RPC retention — resetting to ${latest.sequence}`
        );
        startLedger = latest.sequence;
        return; // pick up from the new window on the next tick
      }
      throw e;
    }

    const events = response.events ?? [];
    let maxEventLedger = 0;
    for (const ev of events) {
      maxEventLedger = Math.max(maxEventLedger, Number(ev.ledger) || 0);
      const decoded = decodeEvent(ev);
      if (!decoded) continue;
      if (seenEventIds.has(decoded.id)) continue;
      seenEventIds.add(decoded.id);
      try {
        await handleEvent(decoded);
      } catch (e) {
        console.error(`[events] handler failed for ${decoded.name}:`, (e as Error).message);
      }
    }

    // Advance the window WITHOUT skipping events. A page is capped at `limit`,
    // so when it is full there may be more events at/after the last seen ledger
    // — resume from there next tick (re-reading that ledger is safe; events are
    // de-duped in-memory and DB writes are idempotent). Only when the page is
    // not full have we caught up, so we can jump to the chain head.
    const PAGE_LIMIT = 100;
    if (events.length >= PAGE_LIMIT && maxEventLedger > 0) {
      startLedger = maxEventLedger;
    } else if (response.latestLedger) {
      startLedger = Math.max(startLedger, response.latestLedger);
    }
    if (seenEventIds.size > 5000) seenEventIds.clear();
  } catch (e) {
    console.error('[events] poll failed:', (e as Error).message);
  } finally {
    polling = false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeEvent(ev: any): DecodedEvent | null {
  try {
    const topics: xdr.ScVal[] = ev.topic ?? [];
    if (topics.length === 0) return null;
    const name = String(scValToNative(topics[0]));
    const rawValue = ev.value ? scValToNative(ev.value) : [];
    const values: unknown[] = Array.isArray(rawValue) ? rawValue : [rawValue];
    const contractId =
      typeof ev.contractId === 'string'
        ? ev.contractId
        : ev.contractId?.contractId?.() ?? ev.contractId?.toString() ?? '';
    const txHash = ev.txHash ? String(ev.txHash) : null;
    return { id: String(ev.id ?? ev.pagingToken ?? `${ev.ledger}-${name}`), contractId, name, values, txHash };
  } catch {
    return null;
  }
}

/** Soroban unit enums decode as ['PlayerA'] or 'PlayerA' depending on shape. */
function normalizeEnum(v: unknown): string {
  if (Array.isArray(v)) return String(v[0]);
  return String(v);
}

async function handleEvent(ev: DecodedEvent): Promise<void> {
  switch (ev.name) {
    case 'MatchCreated': {
      // (match_id, player_a, bet_amount, time_control_secs)
      const [matchId, playerA, betAmount, timeControl] = ev.values;
      await matchesDb.createGame({
        matchId: String(matchId),
        playerA: String(playerA),
        betAmount: betAmount as bigint,
        timeControl: Number(timeControl),
        status: 'open',
      });
      console.log(`[events] MatchCreated #${matchId} by ${playerA}`);
      break;
    }

    case 'MatchActive': {
      // (match_id, player_a, player_b, bet_amount)
      const [rawId, playerA, playerB, betAmount] = ev.values;
      const matchId = String(rawId);

      // Ensure the row exists even if MatchCreated was missed, then activate.
      const existing = await matchesDb.getGame(matchId);

      // Replay-safe: a finished match must never be resurrected by a re-scanned
      // MatchActive event (the lookback window can re-deliver old events).
      if (existing && (existing.status === 'completed' || existing.status === 'cancelled')) {
        break;
      }

      const timeControl = existing?.time_control ?? 600;
      if (!existing) {
        await matchesDb.createGame({
          matchId,
          playerA: String(playerA),
          betAmount: betAmount as bigint,
          timeControl,
          status: 'open',
        });
      }
      await matchesDb.activateGame(matchId, String(playerB));

      await initGame(matchId, String(playerA), String(playerB), {
        betAmount: betAmount as bigint,
        timeControlSecs: timeControl,
        persist: false, // row already in DB
      });

      broadcastToMatch(matchId, {
        type: 'MATCH_STARTED',
        matchId,
        playerA: String(playerA),
        playerB: String(playerB),
      });
      console.log(`[events] MatchActive #${matchId}: ${playerA} vs ${playerB}`);
      break;
    }

    case 'MatchCancelled': {
      const [rawId] = ev.values;
      await matchesDb.updateGameStatus(String(rawId), 'cancelled');
      console.log(`[events] MatchCancelled #${rawId}`);
      break;
    }

    case 'BetPlaced': {
      // (match_id, trader, outcome, amount)
      const [rawId, trader, rawOutcome, amount] = ev.values;
      const matchId = String(rawId);
      const outcome = normalizeEnum(rawOutcome);

      await tradersDb.insertTrader({
        matchId,
        traderAddress: String(trader),
        outcome,
        amountStroops: amount as bigint,
        txHash: ev.txHash,
      });

      // Fetch live pool sizes + odds from the contract for the full payload.
      const [market, odds] = await Promise.all([
        predictionPool.getMarket(matchId),
        predictionPool.getOdds(matchId),
      ]);

      broadcastToMatch(matchId, {
        type: 'BET_PLACED',
        matchId,
        poolA: Number(market?.pool_a ?? 0),
        poolB: Number(market?.pool_b ?? 0),
        poolDraw: Number(market?.pool_draw ?? 0),
        oddsA: odds?.[0] ?? 0,
        oddsB: odds?.[1] ?? 0,
        oddsDraw: odds?.[2] ?? 0,
        traderAddress: String(trader),
        outcome,
        amount: Number(amount),
      });
      console.log(`[events] BetPlaced #${matchId}: ${trader} → ${outcome} (${amount} stroops)`);
      break;
    }

    case 'MarketLocked': {
      const [rawId, evalScore] = ev.values;
      await matchesDb.updateGameStatus(String(rawId), 'locked');
      console.log(`[events] MarketLocked #${rawId} at ${evalScore} cp`);
      break;
    }

    case 'MatchSettled': {
      // (match_id, winner, player_prize, net_pool, winning_pool, fee_treasury, fee_to_prize)
      const [rawId, rawWinner, playerPrize, netPool, , , feeToPrize] = ev.values;
      const matchId = String(rawId);
      const winner = normalizeEnum(rawWinner) as 'PlayerA' | 'PlayerB' | 'Draw';

      await matchesDb.recordSettlement({
        matchId,
        winner,
        playerPrize: playerPrize as bigint,
        tradingNet: netPool as bigint,
        flywheelBonus: feeToPrize as bigint,
        txHash: ev.txHash,
      });

      broadcastToMatch(matchId, {
        type: 'SETTLEMENT_DONE',
        matchId,
        winner,
        playerPrize: Number(playerPrize ?? 0),
        netPool: Number(netPool ?? 0),
        txHash: ev.txHash,
      });

      // Permissionless claims: pay every winning trader recorded locally.
      await settlement.payWinningTraders(matchId, winner);
      console.log(`[events] MatchSettled #${matchId}: winner ${winner}`);
      break;
    }

    default:
      // EvalPosted / ThresholdCrossed / FundsLocked / etc. — informational
      break;
  }
}
