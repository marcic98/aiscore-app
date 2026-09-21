export const ENGINE_URL = 'https://pifmgezknskolgmbhygb.supabase.co/functions/v1/aiscore-engine'

async function request(action, { method = 'GET', params = {}, body = null } = {}) {
  const url = new URL(ENGINE_URL)
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
    throw error
  }
  return data
}

export const getToday = (date) => request('today', { params: { date, timezone: 'Europe/Belgrade' } })
export const getPrematchBundle = (fixture) => request('prematch_bundle', { params: { fixture } })
export const getLiveBundle = (fixture = null) => request('live_bundle', { params: fixture ? { fixture } : {} })
export const saveAnalysis = (analysis, picks) => request('save_analysis', { method: 'POST', body: { analysis, picks } })
export const getHistory = (limit = 100) => request('history', { params: { limit } })
export const getAnalytics = ({ days = null, mode = null, market = null, confidence = null, league = null } = {}) =>
  request('analytics', { params: { days, mode, market, confidence, league } })
export const getOddsHistory = (fixture) => request('odds_history', { params: { fixture } })
export const settleHistory = () => request('settle', { method: 'POST' })
