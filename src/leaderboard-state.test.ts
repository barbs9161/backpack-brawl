import { describe, expect, it } from 'vitest';
import {
  beginLeaderboardSubmission, leaderboardSubmissionFailed, leaderboardSubmissionSucceeded,
  leaveBattle, newGame, routeForGame, setLeaderboardName, skipReplay, startBattle, startSearch, updateRun,
} from './game';
import { buyItem } from './run';
import type { GameState, LeaderboardEntry, Phase } from './types';

const runId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const finished = (): GameState => {
  const game = newGame(123, runId);
  return { ...game, phase: 'finished', run: { ...game.run, wins: 5, lives: 3, round: 5 } };
};
const entry: LeaderboardEntry = { runId, playerName: 'Ada', wins: 5, lives: 3, rounds: 5, outcome: 'victory', createdAt: '2026-11-22T08:00:00.000Z' };
const pending = () => beginLeaderboardSubmission(setLeaderboardName(finished(), ' Ada '), runId);

describe('B7 run identity and submission transitions', () => {
  it('retains identity and submission state through shopping, search, battles and routing', () => {
    let game = newGame(123, runId);
    const submission = game.leaderboardSubmission;
    game = updateRun(game, (run) => buyItem(run, 0));
    for (let round = 1; round <= 3; round++) {
      game = startSearch(game);
      expect(game.runId).toBe(runId);
      game = startBattle(game, { id: 'test', name: 'Test', icon: '', hp: 1000, round, items: ['iron-cleaver'] });
      expect(game.runId).toBe(runId);
      game = skipReplay(game);
      game = leaveBattle(game);
      routeForGame(game);
      expect(game.runId).toBe(runId);
      expect(game.leaderboardSubmission).toBe(submission);
    }
    expect(game.phase).toBe('finished');
  });

  it('initializes new identities and resets submission state only for a new run', () => {
    const first = leaderboardSubmissionSucceeded(pending(), runId, entry);
    const next = newGame(123, otherId);
    expect(next.runId).not.toBe(first.runId);
    expect(next.leaderboardSubmission).toEqual({ playerName: '', status: 'idle', error: null, entry: null });
    expect(first.leaderboardSubmission.status).toBe('success');
  });

  it.each<Phase>(['shop', 'searching', 'battle'])('rejects submission in %s', (phase) => {
    const game = { ...finished(), phase };
    expect(beginLeaderboardSubmission(game, runId)).toBe(game);
    expect(setLeaderboardName(game, 'Ada')).toBe(game);
  });

  it('rejects a finished phase with nonterminal statistics or a mismatched identity', () => {
    const game = { ...newGame(123, runId), phase: 'finished' as const };
    expect(beginLeaderboardSubmission(game, runId)).toBe(game);
    const terminal = finished();
    expect(beginLeaderboardSubmission(terminal, otherId)).toBe(terminal);
  });

  it('blocks duplicate starts and name edits while pending and after success', () => {
    const game = pending();
    expect(game.leaderboardSubmission.status).toBe('submitting');
    expect(beginLeaderboardSubmission(game, runId)).toBe(game);
    expect(setLeaderboardName(game, 'Other')).toBe(game);
    const saved = leaderboardSubmissionSucceeded(game, runId, entry);
    expect(saved.leaderboardSubmission).toEqual({ playerName: ' Ada ', status: 'success', error: null, entry });
    expect(beginLeaderboardSubmission(saved, runId)).toBe(saved);
    expect(setLeaderboardName(saved, 'Other')).toBe(saved);
    expect(leaderboardSubmissionFailed(saved, runId, 'late')).toBe(saved);
    expect(leaderboardSubmissionSucceeded(saved, runId, entry)).toBe(saved);
  });

  it('preserves name and identity on failure and clears the error on retry', () => {
    const failed = leaderboardSubmissionFailed(pending(), runId, 'Offline');
    expect(failed.leaderboardSubmission).toEqual({ playerName: ' Ada ', status: 'error', error: 'Offline', entry: null });
    const retry = beginLeaderboardSubmission(failed, runId);
    expect(retry.runId).toBe(runId);
    expect(retry.leaderboardSubmission).toEqual({ playerName: ' Ada ', status: 'submitting', error: null, entry: null });
    expect(setLeaderboardName(failed, 'Grace').leaderboardSubmission.playerName).toBe('Grace');
  });

  it('ignores responses for another run, even when the new run is submitting', () => {
    const newer = { ...pending(), runId: otherId };
    expect(leaderboardSubmissionSucceeded(newer, runId, entry)).toBe(newer);
    expect(leaderboardSubmissionFailed(newer, runId, 'old failure')).toBe(newer);
    const game = pending();
    expect(leaderboardSubmissionSucceeded(game, runId, { ...entry, runId: otherId })).toBe(game);
  });

  it('ignores responses outside a pending finished submission', () => {
    const game = finished();
    expect(leaderboardSubmissionSucceeded(game, runId, entry)).toBe(game);
    expect(leaderboardSubmissionFailed(game, runId, 'unexpected')).toBe(game);
    const shopping = { ...pending(), phase: 'shop' as const };
    expect(leaderboardSubmissionFailed(shopping, runId, 'unexpected')).toBe(shopping);
    expect(leaderboardSubmissionSucceeded(shopping, runId, entry)).toBe(shopping);
  });

  it('does not mutate the previous game or retain a mutable response reference', () => {
    const game = pending();
    const response = { ...entry };
    const saved = leaderboardSubmissionSucceeded(game, runId, response);
    response.playerName = 'Changed';
    expect(saved.leaderboardSubmission.entry?.playerName).toBe('Ada');
    expect(game.leaderboardSubmission.status).toBe('submitting');
    expect(saved.run).toBe(game.run);
  });
});
