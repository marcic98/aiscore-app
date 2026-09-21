const EPS = 1e-9

export const PRIORITY_LEAGUES = [
  'Premier League','La Liga','UEFA Champions League','Champions League',
  'UEFA Europa League','Europa League','Serie A','Bundesliga','Ligue 1',
  'Eredivisie','Primeira Liga','Liga Portugal','Saudi Pro League',
  'Super Liga','SuperLiga','Jupiler Pro League','Pro League'
]

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export function impliedProbability(odds) {
  const o = Number(odds)
  return Number.isFinite(o) && o > 1 ? 1 / o : null
}

export function fairOdds(probability) {
  const p = Number(probability)
  return Number.isFinite(p) && p > 0 && p <= 1 ? 1 / p : null
}

export function edgePercentagePoints(probability, odds) {
  const implied = impliedProbability(odds)
  const p = Number(probability)
  if (implied === null || !Number.isFinite(p) || p < 0 || p > 1) return null
  return (p - implied) * 100
}

export function expectedValuePercent(probability, odds) {
  const p = Number(probability)
  const o = Number(odds)
  if (!Number.isFinite(p) || p < 0 || p > 1 || !Number.isFinite(o) || o <= 1) return null
  return (p * o - 1) * 100
}

export function expectedValueDnbPercent(winProbability, drawProbability, odds) {
  const pWin = Number(winProbability)
  const pDraw = Number(drawProbability)
  const o = Number(odds)
  if (![pWin,pDraw,o].every(Number.isFinite) || pWin < 0 || pDraw < 0 || pWin + pDraw > 1 || o <= 1) return null
  return (pWin * o + pDraw - 1) * 100
}

function poissonPmf(k, lambda) {
  if (!Number.isFinite(lambda) || lambda < 0 || k < 0) return 0
  let factorial = 1
  for (let i = 2; i <= k; i += 1) factorial *= i
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial
}

function poissonCdf(k, lambda) {
  let sum = 0
  for (let i = 0; i <= Math.floor(k); i += 1) sum += poissonPmf(i, lambda)
  return clamp(sum, 0, 1)
}

export function totalOverProbability(lambdaTotal, line) {
  const l = Number(line)
  if (!Number.isFinite(lambdaTotal) || lambdaTotal <= 0 || !Number.isFinite(l)) return null
  if (Math.abs(l % 1 - 0.5) > EPS) return null
  return 1 - poissonCdf(Math.floor(l), lambdaTotal)
}

export function totalUnderProbability(lambdaTotal, line) {
  const over = totalOverProbability(lambdaTotal, line)
  return over === null ? null : 1 - over
}

export function bttsProbability(lambdaHome, lambdaAway) {
  if (![lambdaHome,lambdaAway].every((x) => Number.isFinite(x) && x > 0)) return null
  return 1 - Math.exp(-lambdaHome) - Math.exp(-lambdaAway) + Math.exp(-(lambdaHome + lambdaAway))
}

export function matchOutcomeProbabilities(lambdaHome, lambdaAway, maxGoals = 10) {
  if (![lambdaHome,lambdaAway].every((x) => Number.isFinite(x) && x > 0)) return null
  let home = 0, draw = 0, away = 0
  for (let h = 0; h <= maxGoals; h += 1) {
    const ph = poissonPmf(h, lambdaHome)
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = ph * poissonPmf(a, lambdaAway)
      if (h > a) home += p
      else if (h === a) draw += p
      else away += p
    }
  }
  const sum = home + draw + away
  if (sum <= 0) return null
  return { home: home / sum, draw: draw / sum, away: away / sum }
}

function fixtureGoalsForTeam(fixture, teamId) {
  const homeId = fixture?.teams?.home?.id
  const awayId = fixture?.teams?.away?.id
  if (homeId !== teamId && awayId !== teamId) return null
  const gf = Number(homeId === teamId ? fixture?.goals?.home : fixture?.goals?.away)
  const ga = Number(homeId === teamId ? fixture?.goals?.away : fixture?.goals?.home)
  if (!Number.isFinite(gf) || !Number.isFinite(ga)) return null
  return { gf, ga, isHome: homeId === teamId }
}

export function summarizeRecentFixtures(fixtures, teamId, maxMatches = 10) {
  const rows = (fixtures || [])
    .map((f) => ({ fixture: f, goals: fixtureGoalsForTeam(f, teamId) }))
    .filter((x) => x.goals)
    .slice(0, maxMatches)

  if (!rows.length) return { sampleSize: 0, available: false }

  let weightSum = 0, gf = 0, ga = 0, points = 0, btts = 0, over15 = 0, over25 = 0, clean = 0, failed = 0
  rows.forEach((row, index) => {
    const weight = Math.pow(0.9, index)
    const { gf: gFor, ga: gAgainst } = row.goals
    weightSum += weight
    gf += gFor * weight
    ga += gAgainst * weight
    points += (gFor > gAgainst ? 3 : gFor === gAgainst ? 1 : 0) * weight
    btts += (gFor > 0 && gAgainst > 0 ? 1 : 0) * weight
    over15 += (gFor + gAgainst >= 2 ? 1 : 0) * weight
    over25 += (gFor + gAgainst >= 3 ? 1 : 0) * weight
    clean += (gAgainst === 0 ? 1 : 0) * weight
    failed += (gFor === 0 ? 1 : 0) * weight
  })

  return {
    available: true,
    sampleSize: rows.length,
    gfAvg: gf / weightSum,
    gaAvg: ga / weightSum,
    pointsPerGame: points / weightSum,
    bttsRate: btts / weightSum,
    over15Rate: over15 / weightSum,
    over25Rate: over25 / weightSum,
    cleanSheetRate: clean / weightSum,
    failedToScoreRate: failed / weightSum,
  }
}

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace('%',''))
  return Number.isFinite(n) ? n : null
}

export function summarizeTeamSeason(teamStats) {
  if (!teamStats || typeof teamStats !== 'object') return { available: false }
  const playedHome = num(teamStats?.fixtures?.played?.home)
  const playedAway = num(teamStats?.fixtures?.played?.away)
  const avgForHome = num(teamStats?.goals?.for?.average?.home)
  const avgForAway = num(teamStats?.goals?.for?.average?.away)
  const avgAgainstHome = num(teamStats?.goals?.against?.average?.home)
  const avgAgainstAway = num(teamStats?.goals?.against?.average?.away)
  return {
    available: [playedHome,playedAway,avgForHome,avgForAway,avgAgainstHome,avgAgainstAway].some((x) => x !== null),
    playedHome, playedAway, avgForHome, avgForAway, avgAgainstHome, avgAgainstAway,
    cleanSheets: num(teamStats?.clean_sheet?.total),
    failedToScore: num(teamStats?.failed_to_score?.total),
    form: teamStats?.form || null,
  }
}

function blend(values) {
  const valid = values.filter((x) => Number.isFinite(x.value) && x.weight > 0)
  const w = valid.reduce((s, x) => s + x.weight, 0)
  return w ? valid.reduce((s, x) => s + x.value * x.weight, 0) / w : null
}

export function estimateExpectedGoals(input) {
  const {
    homeRecent, awayRecent, homeSeason, awaySeason,
    homeLineupConfirmed = false, awayLineupConfirmed = false,
    homeKeyAbsences = 0, awayKeyAbsences = 0,
  } = input || {}

  const hRecent = homeRecent?.sampleSize >= 5
  const aRecent = awayRecent?.sampleSize >= 5
  const hs = homeSeason?.available
  const as = awaySeason?.available

  if ((!hRecent || !aRecent) && (!hs || !as)) return null

  const homeAttack = blend([
    { value: homeRecent?.gfAvg, weight: hRecent ? 0.45 : 0 },
    { value: homeSeason?.avgForHome, weight: hs ? 0.55 : 0 },
  ])
  const awayDefence = blend([
    { value: awayRecent?.gaAvg, weight: aRecent ? 0.45 : 0 },
    { value: awaySeason?.avgAgainstAway, weight: as ? 0.55 : 0 },
  ])
  const awayAttack = blend([
    { value: awayRecent?.gfAvg, weight: aRecent ? 0.45 : 0 },
    { value: awaySeason?.avgForAway, weight: as ? 0.55 : 0 },
  ])
  const homeDefence = blend([
    { value: homeRecent?.gaAvg, weight: hRecent ? 0.45 : 0 },
    { value: homeSeason?.avgAgainstHome, weight: hs ? 0.55 : 0 },
  ])

  if (![homeAttack,awayDefence,awayAttack,homeDefence].every(Number.isFinite)) return null

  let lambdaHome = (homeAttack + awayDefence) / 2
  let lambdaAway = (awayAttack + homeDefence) / 2

  const absencePenalty = 0.06
  lambdaHome *= clamp(1 - homeKeyAbsences * absencePenalty, 0.75, 1)
  lambdaAway *= clamp(1 - awayKeyAbsences * absencePenalty, 0.75, 1)

  if (!homeLineupConfirmed) lambdaHome *= 0.99
  if (!awayLineupConfirmed) lambdaAway *= 0.99

  return {
    lambdaHome: clamp(lambdaHome, 0.2, 3.5),
    lambdaAway: clamp(lambdaAway, 0.2, 3.5),
    method: 'weighted_recent_season_poisson',
  }
}

export function dataQualityScore(input = {}) {
  let score = 0
  const reasons = []
  const add = (points, ok, label) => { if (ok) { score += points; reasons.push(label) } }

  add(18, input.homeRecentSample >= 5 && input.awayRecentSample >= 5, 'recent_form_5plus')
  add(8, input.homeRecentSample >= 10 && input.awayRecentSample >= 10, 'recent_form_10')
  add(16, input.teamSeasonStats, 'season_team_stats')
  add(12, input.currentOdds, 'current_odds')
  add(12, input.lineupsConfirmed, 'confirmed_lineups')
  add(8, input.injuriesAvailable, 'injuries')
  add(6, input.h2hSample >= 3, 'recent_h2h')
  add(6, input.standingsAvailable, 'standings')
  add(6, input.eventsOrLiveStats, 'live_events_stats')
  add(4, input.fresh, 'fresh_data')
  add(4, input.priorityLeague, 'priority_coverage')

  const capped = clamp(score, 0, 100)
  return {
    score: capped,
    label: capped >= 75 ? 'HIGH' : capped >= 50 ? 'MEDIUM' : 'LOW',
    reasons,
  }
}

export function probabilityForMarket(model, market, selection, line = null) {
  if (!model?.lambdaHome || !model?.lambdaAway) return null
  const outcomes = matchOutcomeProbabilities(model.lambdaHome, model.lambdaAway)
  const total = model.lambdaHome + model.lambdaAway
  const m = String(market || '').toLowerCase()
  const s = String(selection || '').toLowerCase()

  if (m === '1x2') {
    if (s === 'home') return outcomes?.home ?? null
    if (s === 'draw') return outcomes?.draw ?? null
    if (s === 'away') return outcomes?.away ?? null
  }
  if (m === 'double chance') {
    if (s === 'home/draw') return (outcomes?.home ?? 0) + (outcomes?.draw ?? 0)
    if (s === 'draw/away') return (outcomes?.draw ?? 0) + (outcomes?.away ?? 0)
    if (s === 'home/away') return (outcomes?.home ?? 0) + (outcomes?.away ?? 0)
  }
  if (m === 'draw no bet') {
    if (s === 'home') {
      const denom = 1 - (outcomes?.draw ?? 0)
      return denom > 0 ? (outcomes?.home ?? 0) / denom : null
    }
    if (s === 'away') {
      const denom = 1 - (outcomes?.draw ?? 0)
      return denom > 0 ? (outcomes?.away ?? 0) / denom : null
    }
  }
  if (m === 'goals') {
    if (!Number.isFinite(Number(line))) return null
    if (s === 'over') return totalOverProbability(total, Number(line))
    if (s === 'under') return totalUnderProbability(total, Number(line))
  }
  if (m === 'btts') {
    const yes = bttsProbability(model.lambdaHome, model.lambdaAway)
    if (yes === null) return null
    return s === 'yes' ? yes : s === 'no' ? 1 - yes : null
  }
  if (m === 'home team goals') {
    if (!Number.isFinite(Number(line))) return null
    if (s === 'over') return totalOverProbability(model.lambdaHome, Number(line))
    if (s === 'under') return totalUnderProbability(model.lambdaHome, Number(line))
  }
  if (m === 'away team goals') {
    if (!Number.isFinite(Number(line))) return null
    if (s === 'over') return totalOverProbability(model.lambdaAway, Number(line))
    if (s === 'under') return totalUnderProbability(model.lambdaAway, Number(line))
  }
  return null
}

function marketName(name = '') {
  const n = name.toLowerCase()
  if (n.includes('match winner') || n === 'winner' || n.includes('1x2')) return '1X2'
  if (n.includes('double chance')) return 'Double Chance'
  if (n.includes('draw no bet')) return 'Draw No Bet'
  if (n.includes('both teams') || n.includes('btts')) return 'BTTS'
  if ((n.includes('home') || n.includes('team 1')) && n.includes('total')) return 'Home Team Goals'
  if ((n.includes('away') || n.includes('team 2')) && n.includes('total')) return 'Away Team Goals'
  if (n.includes('goals over/under') || n.includes('over/under') || n === 'goals') return 'Goals'
  return null
}

function selectionInfo(market, rawValue = '') {
  const value = String(rawValue).trim()
  const low = value.toLowerCase()
  if (market === '1X2') {
    if (['home','1'].includes(low)) return { selection: 'Home', line: null }
    if (['draw','x'].includes(low)) return { selection: 'Draw', line: null }
    if (['away','2'].includes(low)) return { selection: 'Away', line: null }
  }
  if (market === 'Double Chance') {
    if (['home/draw','1x','home or draw'].includes(low)) return { selection: 'Home/Draw', line: null }
    if (['draw/away','x2','draw or away'].includes(low)) return { selection: 'Draw/Away', line: null }
    if (['home/away','12','home or away'].includes(low)) return { selection: 'Home/Away', line: null }
  }
  if (market === 'Draw No Bet') {
    if (low.includes('home') || low === '1') return { selection: 'Home', line: 0 }
    if (low.includes('away') || low === '2') return { selection: 'Away', line: 0 }
  }
  if (market === 'BTTS') {
    if (low === 'yes') return { selection: 'Yes', line: null }
    if (low === 'no') return { selection: 'No', line: null }
  }
  if (['Goals','Home Team Goals','Away Team Goals'].includes(market)) {
    const side = low.includes('over') ? 'Over' : low.includes('under') ? 'Under' : null
    const nums = value.match(/[0-9]+(?:\.[0-9]+)?/g)
    const line = nums?.length ? Number(nums[nums.length - 1]) : null
    if (side && Number.isFinite(line) && Math.abs(line % 1 - 0.5) < EPS) return { selection: side, line }
  }
  return null
}

export function normalizeBookmakerOdds(apiResponse = []) {
  const best = new Map()
  for (const item of apiResponse || []) {
    const ts = item?.update || item?.fixture?.timestamp || null
    for (const bookmaker of item?.bookmakers || []) {
      for (const bet of bookmaker?.bets || []) {
        const market = marketName(bet?.name || bet?.bet || '')
        if (!market) continue
        for (const value of bet?.values || []) {
          const info = selectionInfo(market, value?.value)
          const odds = Number(value?.odd)
          if (!info || !Number.isFinite(odds) || odds <= 1) continue
          const key = [market, info.selection, info.line ?? ''].join('|')
          const candidate = {
            market,
            selection: info.selection,
            line: info.line,
            odds,
            bookmaker: bookmaker?.name || null,
            bookmakerId: bookmaker?.id || null,
            timestamp: ts,
            signalKey: key,
          }
          const prev = best.get(key)
          if (!prev || candidate.odds > prev.odds) best.set(key, candidate)
        }
      }
    }
  }
  return [...best.values()]
}

function confidenceFrom({ qualityScore, edgePP, probability, lineupConfirmed }) {
  let score = qualityScore * 0.55
  score += clamp(edgePP, 0, 12) * 2.2
  if (probability >= 0.58) score += 7
  if (lineupConfirmed) score += 5
  return score >= 70 ? 'HIGH' : score >= 52 ? 'MEDIUM' : 'LOW'
}

function stakeFor(confidence, edgePP, quality) {
  if (confidence === 'HIGH' && quality === 'HIGH' && edgePP >= 6) return 1.5
  if (confidence === 'HIGH' || confidence === 'MEDIUM') return 1
  return 0.5
}

export function rankPrematchOptions({ model, odds, quality, lineupConfirmed = false, minOdds = 1.2, minEdgePP = 3, minEvPct = 2 }) {
  if (!model || quality?.label === 'LOW') return noQualifiedTop3('Insufficient data quality')

  const outcomes = matchOutcomeProbabilities(model.lambdaHome, model.lambdaAway)
  const candidates = []
  for (const price of odds || []) {
    if (price.odds < minOdds) continue
    const probability = probabilityForMarket(model, price.market, price.selection, price.line)
    if (probability === null) continue

    const implied = impliedProbability(price.odds)
    const edgePP = edgePercentagePoints(probability, price.odds)
    let evPct = expectedValuePercent(probability, price.odds)
    if (price.market === 'Draw No Bet' && outcomes) {
      const side = price.selection.toLowerCase()
      const pWin = side === 'home' ? outcomes.home : outcomes.away
      evPct = expectedValueDnbPercent(pWin, outcomes.draw, price.odds)
    }
    if (implied === null || edgePP === null || evPct === null) continue
    if (edgePP < minEdgePP || evPct < minEvPct) continue

    const confidence = confidenceFrom({
      qualityScore: quality.score,
      edgePP,
      probability,
      lineupConfirmed,
    })
    const score = edgePP * 2 + evPct * 0.55 + quality.score * 0.22 + (confidence === 'HIGH' ? 12 : confidence === 'MEDIUM' ? 6 : 0)
    candidates.push({
      ...price,
      aiProbability: probability,
      impliedProbability: implied,
      fairOdds: fairOdds(probability),
      edgePP,
      evPct,
      confidence,
      stakeUnits: stakeFor(confidence, edgePP, quality.label),
      status: 'QUALIFIED',
      score,
    })
  }

  candidates.sort((a,b) => b.score - a.score || b.edgePP - a.edgePP)
  const chosen = candidates.slice(0, 3).map((x, i) => ({
    ...x,
    rank: i + 1,
    why: explainPick(x, model),
    mainRisk: riskForPick(x),
  }))
  while (chosen.length < 3) chosen.push(noQualified(chosen.length + 1, 'No additional option passed price and evidence thresholds'))
  return chosen
}

function explainPick(pick, model) {
  const lambda = (model.lambdaHome + model.lambdaAway).toFixed(2)
  return `Model probability ${(pick.aiProbability * 100).toFixed(1)}% vs market implied ${(pick.impliedProbability * 100).toFixed(1)}%; price edge ${pick.edgePP.toFixed(1)} pp. Goal expectation model total: ${lambda}.`
}

function riskForPick(pick) {
  if (pick.market === 'Goals' || pick.market.includes('Team Goals')) return 'Finishing variance and game-state changes can invalidate the pre-match goal expectation.'
  if (pick.market === '1X2' || pick.market === 'Double Chance' || pick.market === 'Draw No Bet') return 'Red cards, lineup changes and early game-state shifts can materially change win probabilities.'
  if (pick.market === 'BTTS') return 'One-sided game state or poor finishing can break the both-teams scoring assumption.'
  return 'Market and match-state uncertainty.'
}

function noQualified(rank, reason) {
  return {
    rank,
    status: 'NO_QUALIFIED_BET',
    market: null,
    selection: null,
    odds: null,
    aiProbability: null,
    impliedProbability: null,
    fairOdds: null,
    edgePP: null,
    evPct: null,
    confidence: 'LOW',
    stakeUnits: 0,
    why: reason,
    mainRisk: null,
    signalKey: `NO_QUALIFIED_BET|${rank}`,
  }
}

function noQualifiedTop3(reason) {
  return [1,2,3].map((rank) => noQualified(rank, reason))
}

export function verdictFromPicks(picks, qualityLabel) {
  const qualified = (picks || []).filter((p) => p.status === 'QUALIFIED')
  if (qualityLabel === 'LOW' || qualified.length === 0) return 'PRESKOCI'
  return 'IGRAJ'
}

export function overallConfidence(picks, qualityLabel) {
  const qualified = (picks || []).filter((p) => p.status === 'QUALIFIED')
  if (!qualified.length) return 'LOW'
  if (qualityLabel === 'HIGH' && qualified.some((p) => p.confidence === 'HIGH')) return 'HIGH'
  if (qualityLabel !== 'LOW') return 'MEDIUM'
  return 'LOW'
}

export function priorityLeagueScore(name = '') {
  const normalized = String(name).toLowerCase()
  const idx = PRIORITY_LEAGUES.findIndex((x) => normalized.includes(x.toLowerCase()))
  return idx < 0 ? 0 : PRIORITY_LEAGUES.length - idx
}

export function liveGoalProbability({ minute, baselineGoalsPer90 = 2.6, totalShots, shotsOnTarget, redHome = 0, redAway = 0 }) {
  const m = Number(minute)
  if (!Number.isFinite(m) || m < 1 || m > 95) return null
  const remaining = Math.max(0, 95 - m)
  if (remaining <= 0) return 0

  const shots = Math.max(0, Number(totalShots) || 0)
  const sot = Math.max(0, Number(shotsOnTarget) || 0)
  const expectedShotsByNow = Math.max(2, m * 0.22)
  const tempo = clamp((shots + sot * 0.8) / expectedShotsByNow, 0.55, 1.65)
  const redDiff = Math.abs((Number(redHome) || 0) - (Number(redAway) || 0))
  const redFactor = redDiff ? 1.08 : 1
  const lambdaRemaining = clamp((baselineGoalsPer90 / 90) * remaining * tempo * redFactor, 0.02, 2.5)
  return 1 - Math.exp(-lambdaRemaining)
}

export function liveStateHash({ fixtureId, minute, homeGoals, awayGoals, redHome = 0, redAway = 0 }) {
  return [fixtureId, minute, homeGoals, awayGoals, redHome, redAway].join(':')
}

export function settlePick(pick, fixture, stats = null) {
  const status = fixture?.fixture?.status?.short || fixture?.status?.short
  if (!['FT','AET','PEN'].includes(status)) return null

  const home = Number(fixture?.goals?.home)
  const away = Number(fixture?.goals?.away)
  if (![home,away].every(Number.isFinite)) return null
  const total = home + away
  const market = String(pick?.market || '')
  const selection = String(pick?.selection || '').toLowerCase()
  const line = Number(pick?.line)

  if (market === '1X2') {
    const result = home > away ? 'home' : home < away ? 'away' : 'draw'
    return result === selection ? 'WIN' : 'LOSS'
  }
  if (market === 'Double Chance') {
    if (selection === 'home/draw') return home >= away ? 'WIN' : 'LOSS'
    if (selection === 'draw/away') return away >= home ? 'WIN' : 'LOSS'
    if (selection === 'home/away') return home !== away ? 'WIN' : 'LOSS'
  }
  if (market === 'Draw No Bet') {
    if (home === away) return 'VOID'
    if (selection === 'home') return home > away ? 'WIN' : 'LOSS'
    if (selection === 'away') return away > home ? 'WIN' : 'LOSS'
  }
  if (market === 'BTTS') {
    const yes = home > 0 && away > 0
    if (selection === 'yes') return yes ? 'WIN' : 'LOSS'
    if (selection === 'no') return !yes ? 'WIN' : 'LOSS'
  }
  if (market === 'Goals' && Number.isFinite(line)) {
    if (selection === 'over') return total > line ? 'WIN' : total === line ? 'VOID' : 'LOSS'
    if (selection === 'under') return total < line ? 'WIN' : total === line ? 'VOID' : 'LOSS'
  }
  if (market === 'Home Team Goals' && Number.isFinite(line)) {
    if (selection === 'over') return home > line ? 'WIN' : home === line ? 'VOID' : 'LOSS'
    if (selection === 'under') return home < line ? 'WIN' : home === line ? 'VOID' : 'LOSS'
  }
  if (market === 'Away Team Goals' && Number.isFinite(line)) {
    if (selection === 'over') return away > line ? 'WIN' : away === line ? 'VOID' : 'LOSS'
    if (selection === 'under') return away < line ? 'WIN' : away === line ? 'VOID' : 'LOSS'
  }

  return null
}

export function closingLineValuePercent(signalOdds, closingOdds) {
  const s = Number(signalOdds)
  const c = Number(closingOdds)
  if (![s,c].every(Number.isFinite) || s <= 1 || c <= 1) return null
  return (s / c - 1) * 100
}


export function classifyLineup(confirmedLineups, projectedLineup = null) {
  const confirmed = Array.isArray(confirmedLineups) &&
    confirmedLineups.length >= 2 &&
    confirmedLineups.every((team) => Array.isArray(team?.startXI) && team.startXI.length >= 7)
  if (confirmed) return 'CONFIRMED'
  const projected = projectedLineup &&
    Array.isArray(projectedLineup) &&
    projectedLineup.length >= 2
  if (projected) return 'PROJECTED'
  return 'UNAVAILABLE'
}
