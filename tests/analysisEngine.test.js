import test from 'node:test'
import assert from 'node:assert/strict'
import {
  impliedProbability, edgePercentagePoints, expectedValuePercent, fairOdds,
  expectedValueDnbPercent, dataQualityScore, estimateExpectedGoals,
  rankPrematchOptions, settlePick, closingLineValuePercent,
  liveStateHash, probabilityForMarket
} from '../src/analysisEngine.js'

test('implied probability 2.00 = 50%', () => {
  assert.equal(impliedProbability(2), 0.5)
})

test('edge example 57% at 2.00 = +7pp', () => {
  assert.ok(Math.abs(edgePercentagePoints(0.57, 2) - 7) < 1e-9)
})

test('EV example 57% at 2.00 = +14%', () => {
  assert.ok(Math.abs(expectedValuePercent(0.57, 2) - 14) < 1e-9)
})

test('fair odds 62% = 1.6129', () => {
  assert.ok(Math.abs(fairOdds(0.62) - 1.6129032258) < 1e-6)
})

test('DNB EV includes draw refund', () => {
  assert.ok(Math.abs(expectedValueDnbPercent(0.45, 0.30, 2.0) - 20) < 1e-9)
})

test('null odds handling never fabricates math', () => {
  assert.equal(impliedProbability(null), null)
  assert.equal(edgePercentagePoints(0.6, null), null)
  assert.equal(expectedValuePercent(0.6, null), null)
})

test('low data quality produces LOW', () => {
  const q = dataQualityScore({ homeRecentSample: 2, awayRecentSample: 2 })
  assert.equal(q.label, 'LOW')
})

test('missing model returns three NO QUALIFIED BET slots', () => {
  const picks = rankPrematchOptions({ model: null, odds: [], quality: { label: 'LOW', score: 10 } })
  assert.equal(picks.length, 3)
  assert.ok(picks.every((p) => p.status === 'NO_QUALIFIED_BET'))
})

test('expected goals requires real sample or season stats', () => {
  assert.equal(estimateExpectedGoals({}), null)
})

test('Poisson market probability is deterministic', () => {
  const model = { lambdaHome: 1.7, lambdaAway: 1.1 }
  const a = probabilityForMarket(model, 'Goals', 'Over', 2.5)
  const b = probabilityForMarket(model, 'Goals', 'Over', 2.5)
  assert.equal(a, b)
  assert.ok(a > 0 && a < 1)
})

test('settlement 1X2', () => {
  const fixture = { fixture: { status: { short: 'FT' } }, goals: { home: 2, away: 1 } }
  assert.equal(settlePick({ market: '1X2', selection: 'Home' }, fixture), 'WIN')
  assert.equal(settlePick({ market: '1X2', selection: 'Away' }, fixture), 'LOSS')
})

test('settlement DNB draw = VOID', () => {
  const fixture = { fixture: { status: { short: 'FT' } }, goals: { home: 1, away: 1 } }
  assert.equal(settlePick({ market: 'Draw No Bet', selection: 'Home' }, fixture), 'VOID')
})

test('settlement goals', () => {
  const fixture = { fixture: { status: { short: 'FT' } }, goals: { home: 2, away: 1 } }
  assert.equal(settlePick({ market: 'Goals', selection: 'Over', line: 2.5 }, fixture), 'WIN')
  assert.equal(settlePick({ market: 'Goals', selection: 'Under', line: 2.5 }, fixture), 'LOSS')
})

test('unsettled fixture remains null', () => {
  const fixture = { fixture: { status: { short: '2H' } }, goals: { home: 2, away: 1 } }
  assert.equal(settlePick({ market: 'Goals', selection: 'Over', line: 2.5 }, fixture), null)
})

test('CLV is based on original signal price vs closing price', () => {
  assert.ok(Math.abs(closingLineValuePercent(2.0, 1.8) - 11.1111111111) < 1e-6)
})

test('goal/red/minute changes live state identity', () => {
  const a = liveStateHash({ fixtureId: 1, minute: 55, homeGoals: 0, awayGoals: 0, redHome: 0, redAway: 0 })
  const b = liveStateHash({ fixtureId: 1, minute: 56, homeGoals: 1, awayGoals: 0, redHome: 0, redAway: 0 })
  const c = liveStateHash({ fixtureId: 1, minute: 56, homeGoals: 1, awayGoals: 0, redHome: 1, redAway: 0 })
  assert.notEqual(a, b)
  assert.notEqual(b, c)
})
