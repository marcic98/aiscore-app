export const API_URL = 'https://pifmgezknskolgmbhygb.supabase.co/functions/v1/aiscore-football'
export const MAX_AUTO_SCAN = 5

export function asNumber(value) {
  if (value === null || value === undefined || value === '-') return 0
  if (typeof value === 'string') return Number(value.replace('%', '')) || 0
  return Number(value) || 0
}

export function initials(name = '') {
  return name.split(' ').filter(Boolean).map((x) => x[0]).join('').slice(0, 3).toUpperCase() || '?'
}

export function normalizeStats(teamBlock) {
  const result = {}
  for (const row of teamBlock?.statistics || []) result[row.type] = row.value ?? '-'
  return result
}

export function hasUsefulStats(data) {
  if (!Array.isArray(data) || data.length < 2) return false
  const useful = new Set(['Ball Possession', 'Shots on Goal', 'Total Shots', 'Corner Kicks'])
  return data.flatMap((team) => team?.statistics || [])
    .some((s) => useful.has(s?.type) && s?.value !== null && s?.value !== undefined)
}

function collectOddsNodes(value, path = [], out = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectOddsNodes(item, path, out))
    return out
  }
  if (!value || typeof value !== 'object') return out

  const label = [value.name, value.bet, value.title, value.value, value.label, value.handicap]
    .filter((x) => x !== undefined && x !== null).join(' ')
  const odd = Number(value.odd ?? value.odds ?? value.price)
  if (label && Number.isFinite(odd)) out.push({ label, odd, raw: value, path: path.join(' > ') })

  Object.entries(value).forEach(([key, child]) => {
    if (child && typeof child === 'object') collectOddsNodes(child, [...path, key], out)
  })
  return out
}

function parseLine(text) {
  const match = String(text).match(/(?:over|under)\s*([0-9]+(?:\.[0-9]+)?)/i)
  if (match) return Number(match[1])
  const nums = String(text).match(/[0-9]+(?:\.[0-9]+)?/g)
  return nums?.length ? Number(nums[nums.length - 1]) : null
}

export function chooseLiveOdd(oddsData, side, currentGoals, minOdds) {
  if (!side) return null
  const wanted = side.toLowerCase()

  return collectOddsNodes(oddsData)
    .map((node) => {
      const text = `${node.label} ${node.path}`.toLowerCase()
      if (!text.includes(wanted)) return null
      if (!(text.includes('goal') || text.includes('total') || text.includes('over') || text.includes('under'))) return null
      const line = parseLine(node.label)
      if (node.odd < minOdds || node.odd > 3.5) return null
      if (line !== null && line < currentGoals - 0.5) return null

      let score = node.odd <= 1.95 ? 4 : 2
      if (node.raw?.main === true || node.raw?.main === 'true') score += 2
      if (node.raw?.suspended === true || node.raw?.blocked === true) score -= 10
      if (line !== null) score += Math.max(0, 3 - Math.abs(line - (currentGoals + 0.5)))
      return { label: node.label, odd: node.odd, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.odd - b.odd)[0] || null
}

export function analyzeMatch(match, stats) {
  if (!hasUsefulStats(stats)) {
    return { confidence: 0, market: 'Golovi', tip: 'Nema dovoljno LIVE statistike', reasons: ['Nema dovoljno statistike za pouzdan signal.'], side: null, momentumHome: 50, momentumAway: 50 }
  }

  const home = normalizeStats(stats[0])
  const away = normalizeStats(stats[1])
  const minute = asNumber(match?.fixture?.status?.elapsed)
  const shots = asNumber(home['Total Shots']) + asNumber(away['Total Shots'])
  const sot = asNumber(home['Shots on Goal']) + asNumber(away['Shots on Goal'])
  const corners = asNumber(home['Corner Kicks']) + asNumber(away['Corner Kicks'])
  const possessionGap = Math.abs(asNumber(home['Ball Possession']) - asNumber(away['Ball Possession']))
  const homePressure = asNumber(home['Total Shots']) * 0.45 + asNumber(home['Shots on Goal']) * 1.3 + asNumber(home['Corner Kicks']) * 0.3
  const awayPressure = asNumber(away['Total Shots']) * 0.45 + asNumber(away['Shots on Goal']) * 1.3 + asNumber(away['Corner Kicks']) * 0.3
  const totalPressure = Math.max(1, homePressure + awayPressure)
  const momentumHome = Math.round(homePressure / totalPressure * 100)
  const momentumAway = 100 - momentumHome

  if (minute < 25 || minute > 86) {
    return { confidence: 0, market: 'Golovi', tip: 'Nije dobar trenutak za ulaz', reasons: ['Meč je van intervala 25-86 min.'], side: null, momentumHome, momentumAway }
  }

  let score = 0
  const reasons = []
  if (minute >= 50 && minute <= 82) score += 1
  if (shots >= 12) { score += 3; reasons.push(`Visok tempo: ${shots} suteva`) }
  else if (shots >= 8) { score += 2; reasons.push(`${shots} ukupno suteva`) }
  if (sot >= 5) { score += 3; reasons.push(`${sot} suteva u okvir`) }
  else if (sot >= 3) score += 1
  if (corners >= 6) { score += 1; reasons.push(`${corners} kornera`) }
  if (possessionGap >= 20 && shots >= 8) score += 1

  if (score >= 6) {
    return {
      confidence: Math.min(86, 58 + score * 3),
      market: 'Golovi',
      tip: 'Gol do kraja',
      reasons: reasons.slice(0, 3),
      side: 'over',
      momentumHome,
      momentumAway,
    }
  }

  return { confidence: 0, market: 'Golovi', tip: 'Nema dovoljno jakog signala', reasons: ['Statistika trenutno nije dovoljno jaka za ulaz.'], side: null, momentumHome, momentumAway }
}

export function toSignal(match, analysis, oddPick, minConfidence) {
  const minute = match?.fixture?.status?.elapsed
  const odds = oddPick?.odd ? oddPick.odd.toFixed(2) : null
  const action = analysis.confidence >= minConfidence && odds ? 'IGRAJ' : analysis.confidence >= minConfidence ? 'CEKAJ' : 'PRESKOCI'

  return {
    id: match.fixture?.id,
    league: match.league?.name || '-',
    minute: minute ? `${minute}'` : match.fixture?.status?.short || 'LIVE',
    home: match.teams?.home?.name || '-',
    away: match.teams?.away?.name || '-',
    score: `${match.goals?.home ?? 0} : ${match.goals?.away ?? 0}`,
    tip: oddPick?.label || analysis.tip,
    market: analysis.market,
    confidence: analysis.confidence,
    odds: odds || '—',
    action,
    reasons: analysis.reasons,
    momentumHome: analysis.momentumHome,
    momentumAway: analysis.momentumAway,
    raw: match,
  }
}

export async function api(action, fixture) {
  const url = new URL(API_URL)
  url.searchParams.set('action', action)
  if (fixture) url.searchParams.set('fixture', String(fixture))

  const response = await fetch(url.toString(), { cache: 'no-store' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Ne mogu da ucitam podatke')
  return body
}
