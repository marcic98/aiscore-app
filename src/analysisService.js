import {
  dataQualityScore, estimateExpectedGoals, overallConfidence, priorityLeagueScore,
  rankPrematchOptions, summarizeRecentFixtures, summarizeTeamSeason,
  verdictFromPicks, liveGoalProbability, impliedProbability, fairOdds,
  edgePercentagePoints, expectedValuePercent, liveStateHash, classifyLineup
} from './analysisEngine'


function extractContext(bundle, fixture) {
  const standingsGroups = bundle?.standings?.[0]?.league?.standings || []
  const table = standingsGroups.flat ? standingsGroups.flat() : []
  const homeId = fixture?.teams?.home?.id
  const awayId = fixture?.teams?.away?.id
  const homeStanding = table.find((x) => x?.team?.id === homeId) || null
  const awayStanding = table.find((x) => x?.team?.id === awayId) || null

  const lastDate = (fixtures = []) => {
    const dates = fixtures.map((x) => new Date(x?.fixture?.date).getTime()).filter(Number.isFinite)
    return dates.length ? Math.max(...dates) : null
  }
  const matchTime = new Date(fixture?.fixture?.date).getTime()
  const homeLast = lastDate(bundle?.home_recent || [])
  const awayLast = lastDate(bundle?.away_recent || [])
  const days = (last) => last && Number.isFinite(matchTime) ? Math.max(0, (matchTime - last) / 86400000) : null

  return {
    home_rank: homeStanding?.rank ?? null,
    away_rank: awayStanding?.rank ?? null,
    home_points: homeStanding?.points ?? null,
    away_points: awayStanding?.points ?? null,
    home_days_rest: days(homeLast),
    away_days_rest: days(awayLast),
    round: fixture?.league?.round || null,
    referee: fixture?.fixture?.referee || null,
    referee_stats: null,
    weather: null,
    tactical_structured_data: null,
  }
}

function stableHash(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}


export function buildPrematchAnalysis(bundle, settings = {}) {
  const fixture = bundle?.fixture
  if (!fixture?.fixture?.id) throw new Error('Fixture unavailable')

  const homeId = fixture.teams?.home?.id
  const awayId = fixture.teams?.away?.id
  const homeRecent = summarizeRecentFixtures(bundle.home_recent || [], homeId, 10)
  const awayRecent = summarizeRecentFixtures(bundle.away_recent || [], awayId, 10)
  const homeSeason = summarizeTeamSeason(bundle.home_team_stats)
  const awaySeason = summarizeTeamSeason(bundle.away_team_stats)
  const lineupState = bundle?.lineup_confirmed === true
    ? 'CONFIRMED'
    : bundle?.lineup_confirmed === false
      ? 'PROJECTED'
      : classifyLineup(bundle?.lineups || [], bundle?.projected_lineup || null)
  const confirmed = lineupState === 'CONFIRMED'

  const context = extractContext(bundle, fixture)

  const quality = dataQualityScore({
    homeRecentSample: homeRecent.sampleSize || 0,
    awayRecentSample: awayRecent.sampleSize || 0,
    teamSeasonStats: homeSeason.available && awaySeason.available,
    currentOdds: !!bundle?.availability?.odds,
    lineupsConfirmed: confirmed,
    injuriesAvailable: !!bundle?.availability?.injuries,
    h2hSample: (bundle.h2h || []).length,
    standingsAvailable: !!bundle?.availability?.standings,
    fresh: !!bundle?.data_last_updated,
    priorityLeague: priorityLeagueScore(fixture?.league?.name) > 0,
  })

  const model = estimateExpectedGoals({
    homeRecent,
    awayRecent,
    homeSeason,
    awaySeason,
    homeLineupConfirmed: confirmed,
    awayLineupConfirmed: confirmed,
    homeKeyAbsences: 0,
    awayKeyAbsences: 0,
  })

  const picks = rankPrematchOptions({
    model,
    odds: bundle.odds || [],
    quality,
    lineupConfirmed: confirmed,
    minOdds: Number(settings.minOdds ?? 1.2),
    minEdgePP: Number(settings.minEdgePP ?? 3),
    minEvPct: Number(settings.minEvPct ?? 2),
  })

  const verdict = verdictFromPicks(picks, quality.label)
  const confidence = overallConfidence(picks, quality.label)
  const stateHash = stableHash({
    fixture: fixture.fixture.id,
    mode: 'prematch',
    lineupConfirmed: confirmed,
    lineups: (bundle.lineups || []).map((x) => ({
      team: x?.team?.id,
      xi: (x?.startXI || []).map((p) => p?.player?.id),
    })),
    odds: (bundle.odds || []).map((o) => [o.signal_key, o.odds]),
  })

  return {
    analysis: {
      fixture_id: fixture.fixture.id,
      mode: 'prematch',
      league_id: fixture.league?.id ?? null,
      league_name: fixture.league?.name ?? null,
      home_team_id: homeId ?? null,
      home_team_name: fixture.teams?.home?.name ?? null,
      away_team_id: awayId ?? null,
      away_team_name: fixture.teams?.away?.name ?? null,
      match_date: fixture.fixture?.date ?? null,
      match_status: fixture.fixture?.status?.short ?? null,
      minute: fixture.fixture?.status?.elapsed ?? null,
      score_home: fixture.goals?.home ?? null,
      score_away: fixture.goals?.away ?? null,
      state_hash: stateHash,
      data_quality: quality.label,
      data_quality_score: quality.score,
      confidence,
      verdict,
      analysis_generated_at: new Date().toISOString(),
      data_last_updated: bundle.data_last_updated ?? null,
      source_snapshot: {
        provider: 'API-Football',
        quality_reasons: quality.reasons,
        lineup_status: lineupState,
        model_method: model?.method || null,
        unavailable: Object.entries(bundle.availability || {}).filter(([,v]) => v === false).map(([k]) => k),
        context,
      },
    },
    picks,
    quality,
    model,
    homeRecent,
    awayRecent,
    homeSeason,
    awaySeason,
    lineupStatus: lineupState,
    context,
  }
}

function statMap(stats) {
  const result = {}
  for (const team of stats || []) {
    const id = team?.team?.id
    if (!id) continue
    result[id] = {}
    for (const row of team.statistics || []) result[id][row.type] = row.value
  }
  return result
}

function numeric(value) {
  if (value === null || value === undefined) return 0
  const n = Number(String(value).replace('%',''))
  return Number.isFinite(n) ? n : 0
}

function redCardsFromStats(stats, teamId) {
  const map = statMap(stats)
  return numeric(map?.[teamId]?.['Red Cards'])
}

export function buildLiveAnalysis(liveBundle, prematchResult, settings = {}) {
  const fixture = liveBundle?.fixture
  if (!fixture?.fixture?.id) throw new Error('Live fixture unavailable')

  const homeId = fixture.teams?.home?.id
  const awayId = fixture.teams?.away?.id
  const statsByTeam = statMap(liveBundle.stats)
  const h = statsByTeam[homeId] || {}
  const a = statsByTeam[awayId] || {}
  const minute = numeric(fixture.fixture?.status?.elapsed)
  const totalShots = numeric(h['Total Shots']) + numeric(a['Total Shots'])
  const shotsOnTarget = numeric(h['Shots on Goal']) + numeric(a['Shots on Goal'])
  const redHome = redCardsFromStats(liveBundle.stats, homeId)
  const redAway = redCardsFromStats(liveBundle.stats, awayId)
  const baselineGoalsPer90 = prematchResult?.model
    ? prematchResult.model.lambdaHome + prematchResult.model.lambdaAway
    : null

  const quality = dataQualityScore({
    homeRecentSample: prematchResult?.homeRecent?.sampleSize || 0,
    awayRecentSample: prematchResult?.awayRecent?.sampleSize || 0,
    teamSeasonStats: !!prematchResult?.model,
    currentOdds: !!liveBundle?.availability?.live_odds,
    lineupsConfirmed: !!liveBundle?.availability?.lineups,
    injuriesAvailable: false,
    h2hSample: 0,
    standingsAvailable: false,
    eventsOrLiveStats: !!liveBundle?.availability?.stats,
    fresh: !!liveBundle?.data_last_updated,
    priorityLeague: priorityLeagueScore(fixture?.league?.name) > 0,
  })

  const stateHash = liveStateHash({
    fixtureId: fixture.fixture.id,
    minute,
    homeGoals: fixture.goals?.home ?? 0,
    awayGoals: fixture.goals?.away ?? 0,
    redHome,
    redAway,
  })

  if (!baselineGoalsPer90 || !liveBundle?.availability?.stats) {
    const empty = [1,2,3].map((rank) => ({
      rank,
      status: 'NO_QUALIFIED_BET',
      signalKey: `NO_QUALIFIED_BET|${rank}`,
      market: null,
      selection: null,
      line: null,
      bookmaker: null,
      odds: null,
      aiProbability: null,
      impliedProbability: null,
      fairOdds: null,
      edgePP: null,
      evPct: null,
      confidence: 'LOW',
      stakeUnits: 0,
      why: 'Live probability unavailable because baseline or live statistics are missing.',
      mainRisk: null,
    }))
    return {
      analysis: {
        fixture_id: fixture.fixture.id,
        mode: 'live',
        league_id: fixture.league?.id ?? null,
        league_name: fixture.league?.name ?? null,
        home_team_id: homeId ?? null,
        home_team_name: fixture.teams?.home?.name ?? null,
        away_team_id: awayId ?? null,
        away_team_name: fixture.teams?.away?.name ?? null,
        match_date: fixture.fixture?.date ?? null,
        match_status: fixture.fixture?.status?.short ?? null,
        minute,
        score_home: fixture.goals?.home ?? 0,
        score_away: fixture.goals?.away ?? 0,
        state_hash: stateHash,
        data_quality: 'LOW',
        data_quality_score: quality.score,
        confidence: 'LOW',
        verdict: 'PRESKOCI',
        analysis_generated_at: new Date().toISOString(),
        data_last_updated: liveBundle.data_last_updated ?? null,
        source_snapshot: { reason: 'baseline_or_live_stats_missing' },
      },
      picks: empty,
      quality,
      whyNow: 'Nema dovoljno svezih podataka za pouzdanu LIVE procenu.',
      risk: 'DATA UNAVAILABLE',
    }
  }

  const probability = liveGoalProbability({
    minute,
    baselineGoalsPer90,
    totalShots,
    shotsOnTarget,
    redHome,
    redAway,
  })

  const currentGoals = numeric(fixture.goals?.home) + numeric(fixture.goals?.away)
  const targetLine = currentGoals + 0.5
  const prices = (liveBundle.odds || []).filter((o) =>
    o.market === 'Goals' &&
    String(o.selection).toLowerCase() === 'over' &&
    Number(o.line) === targetLine
  ).sort((a,b) => b.odds - a.odds)

  const best = prices[0]
  const minOdds = Number(settings.minOdds ?? 1.2)
  const minEdge = Number(settings.minEdgePP ?? 3)
  const minEv = Number(settings.minEvPct ?? 2)

  let pick
  if (!best || probability === null) {
    pick = {
      rank: 1, status: 'NO_QUALIFIED_BET', signalKey: 'NO_QUALIFIED_BET|1',
      market: 'Goals', selection: `Over ${targetLine}`, line: targetLine, bookmaker: null,
      odds: null, aiProbability: probability, impliedProbability: null, fairOdds: probability ? fairOdds(probability) : null,
      edgePP: null, evPct: null, confidence: 'LOW', stakeUnits: 0,
      why: 'Live price unavailable for the current state.', mainRisk: 'Price cannot be evaluated without current odds.'
    }
  } else {
    const implied = impliedProbability(best.odds)
    const edgePP = edgePercentagePoints(probability, best.odds)
    const evPct = expectedValuePercent(probability, best.odds)
    const qualified = best.odds >= minOdds && edgePP >= minEdge && evPct >= minEv && quality.label !== 'LOW'
    const confidence = quality.label === 'HIGH' && edgePP >= 6 ? 'HIGH' : quality.label !== 'LOW' && edgePP >= 3 ? 'MEDIUM' : 'LOW'
    pick = {
      rank: 1,
      status: qualified ? 'QUALIFIED' : 'CEKAJ',
      signalKey: best.signal_key,
      market: 'Goals',
      selection: `Over ${targetLine}`,
      line: targetLine,
      bookmaker: best.bookmaker,
      odds: best.odds,
      timestamp: best.timestamp,
      aiProbability: probability,
      impliedProbability: implied,
      fairOdds: fairOdds(probability),
      edgePP,
      evPct,
      confidence,
      stakeUnits: qualified ? (confidence === 'HIGH' ? 1.5 : 1) : 0,
      why: `LIVE model uses the pre-match goal baseline plus current shots/SOT tempo at minute ${minute}.`,
      mainRisk: redHome !== redAway
        ? 'A red card has materially changed match state; this signal is valid only for the current state.'
        : 'A goal, red card or major substitution can immediately invalidate this signal.',
    }
  }

  const picks = [pick]
  while (picks.length < 3) {
    const rank = picks.length + 1
    picks.push({
      rank, status: 'NO_QUALIFIED_BET', signalKey: `NO_QUALIFIED_BET|${rank}`,
      market: null, selection: null, line: null, bookmaker: null, odds: null,
      aiProbability: null, impliedProbability: null, fairOdds: null, edgePP: null,
      evPct: null, confidence: 'LOW', stakeUnits: 0,
      why: 'No additional live market passed the evidence and value thresholds.', mainRisk: null,
    })
  }

  const verdict = pick.status === 'QUALIFIED' ? 'IGRAJ' : pick.status === 'CEKAJ' ? 'CEKAJ' : 'PRESKOCI'
  const confidence = pick.confidence

  return {
    analysis: {
      fixture_id: fixture.fixture.id,
      mode: 'live',
      league_id: fixture.league?.id ?? null,
      league_name: fixture.league?.name ?? null,
      home_team_id: homeId ?? null,
      home_team_name: fixture.teams?.home?.name ?? null,
      away_team_id: awayId ?? null,
      away_team_name: fixture.teams?.away?.name ?? null,
      match_date: fixture.fixture?.date ?? null,
      match_status: fixture.fixture?.status?.short ?? null,
      minute,
      score_home: fixture.goals?.home ?? 0,
      score_away: fixture.goals?.away ?? 0,
      state_hash: stateHash,
      data_quality: quality.label,
      data_quality_score: quality.score,
      confidence,
      verdict,
      analysis_generated_at: new Date().toISOString(),
      data_last_updated: liveBundle.data_last_updated ?? null,
      source_snapshot: {
        baseline_goals_per_90: baselineGoalsPer90,
        total_shots: totalShots,
        shots_on_target: shotsOnTarget,
        red_home: redHome,
        red_away: redAway,
      },
    },
    picks,
    quality,
    whyNow: pick.why,
    risk: pick.mainRisk,
  }
}
