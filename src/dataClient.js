export const ENGINE_URL = 'https://pifmgezknskolgmbhygb.supabase.co/functions/v1/aiscore-engine'
export const PUBLIC_FOOTBALL_URL = 'https://pifmgezknskolgmbhygb.supabase.co/functions/v1/aiscore-public-football'
export const PUBLIC_ESPN_URL = 'https://pifmgezknskolgmbhygb.supabase.co/functions/v1/aiscore-public'

async function request(action, { method = 'GET', params = {}, body = null, baseUrl = ENGINE_URL } = {}) {
  const url = new URL(baseUrl)
  url.searchParams.set('action', action)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value))
  })

  const response = await fetch(url.toString(), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'AIScore API error')
    error.details = data.details
    error.status = response.status
    error.baseUrl = baseUrl
    throw error
  }
  return data
}

async function firstAvailable(action, candidates, options = {}) {
  const errors = []
  for (const baseUrl of candidates) {
    try {
      return await request(action, { ...options, baseUrl })
    } catch (error) {
      errors.push({ baseUrl, message: error?.message || String(error) })
    }
  }
  const error = new Error('DATA UNAVAILABLE')
  error.details = errors
  throw error
}

export const getToday = (date) =>
  firstAvailable('today', [ENGINE_URL, PUBLIC_FOOTBALL_URL, PUBLIC_ESPN_URL], { params: { date } })

export const getPrematchBundle = (fixture, league, date) =>
  firstAvailable('prematch_bundle', [ENGINE_URL, PUBLIC_FOOTBALL_URL, PUBLIC_ESPN_URL], {
    params: { fixture, league, date },
  })

export const getLiveFixtures = () => request('live_bundle', { baseUrl: ENGINE_URL })
export const getLiveBundle = (fixture) => request('live_bundle', { baseUrl: ENGINE_URL, params: { fixture } })
export const saveAnalysis = (analysis, picks) => request('save_analysis', { method: 'POST', body: { analysis, picks } })
export const getHistory = (limit = 200) => request('history', { params: { limit } })
export const getAnalytics = ({ days = null, mode = null, market = null, confidence = null, league = null } = {}) =>
  request('analytics', { params: { days, mode, market, confidence, league } })
export const getOddsHistory = (fixture) => request('odds_history', { params: { fixture } })
export const settleHistory = () => request('settle', { method: 'POST' })
