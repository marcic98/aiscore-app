import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, Bell, Brain, ChevronLeft, ChevronRight, CircleUserRound,
  Clock3, Flame, Home, Radio, RefreshCw, ShieldCheck, Sparkles, Target,
  TrendingUp, Trophy, Zap
} from 'lucide-react'
import {
  MAX_AUTO_SCAN, analyzeMatch, api, asNumber, chooseLiveOdd, initials,
  normalizeStats, toSignal
} from './liveCore'

const DEFAULT_SETTINGS = { minOdds: 1.2, minConfidence: 70 }

function StatusBadge({ action }) {
  const cls = action === 'IGRAJ' ? 'play' : action === 'CEKAJ' ? 'wait' : 'skip'
  return <span className={cls}>{action === 'IGRAJ' ? '▶ IGRAJ' : action === 'CEKAJ' ? '◷ CEKAJ' : '✕ PRESKOCI'}</span>
}

function SignalCard({ signal, onOpen }) {
  return (
    <button className="signal-card" onClick={() => onOpen(signal)}>
      <div className="signal-top">
        <span>{signal.league}</span><span>{signal.minute}</span><span className="live-dot">● LIVE</span>
      </div>
      <div className="teams-row">
        <div className="team"><div className="badge">{initials(signal.home)}</div><span>{signal.home}</span></div>
        <div className="score">{signal.score}</div>
        <div className="team"><div className="badge alt">{initials(signal.away)}</div><span>{signal.away}</span></div>
      </div>
      <div className="signal-bottom">
        <div className="tip-col"><small>PREDIKCIJA</small><strong>{signal.tip}</strong></div>
        <div><small>POUZDANOST</small><strong className={signal.confidence >= 70 ? 'green' : 'red'}>{signal.confidence}%</strong></div>
        <div><small>KVOTA</small><strong>{signal.odds}</strong></div>
        <StatusBadge action={signal.action}/>
      </div>
    </button>
  )
}

function HomeView({ signals, matches, loading, error, lastUpdated, credits, scanned, market, setMarket, onRefresh, onOpen }) {
  const shown = useMemo(
    () => market === 'Sve' ? signals : signals.filter((s) => s.market === market),
    [market, signals]
  )
  const top = [...signals].sort((a, b) => {
    if (a.action === 'IGRAJ' && b.action !== 'IGRAJ') return -1
    if (b.action === 'IGRAJ' && a.action !== 'IGRAJ') return 1
    return b.confidence - a.confidence
  })[0]

  return <>
    <section className="hero-card premium">
      <div className="hero-kicker">
        <span><Sparkles size={14}/> AI SIGNAL</span>
        <span className="confidence-pill"><ShieldCheck size={14}/> LIVE ANALIZA</span>
      </div>
      <div className="section-title"><Trophy size={20}/> {top ? 'Najbolji signal trenutno' : 'Spremno za LIVE skeniranje'}</div>

      {top ? <>
        <div className="hero-match">
          <div className="match-left">
            <div className="meta">{top.league} · {top.minute} · <span className="live-dot">● LIVE</span></div>
            <div className="hero-teams">
              <div className="hero-team"><div className="club">{initials(top.home)}</div><span>{top.home}</span></div>
              <div className="hero-score">{top.score}<small>{top.minute}</small></div>
              <div className="hero-team"><div className="club orange">{initials(top.away)}</div><span>{top.away}</span></div>
            </div>
          </div>
          <div className="prediction-box">
            <small>PREDIKCIJA</small><div className="prediction">{top.tip}</div>
            <div className="numbers">
              <div><small>POUZDANOST</small><b>{top.confidence}%</b></div>
              <div><small>KVOTA</small><strong>{top.odds}</strong></div>
            </div>
          </div>
        </div>
        <button className="hero-cta" onClick={() => onOpen(top)}><Zap size={20}/> OTVORI ANALIZU <ChevronRight size={18}/></button>
      </> : <div className="empty hero-empty">Pritisni OSVEZI LIVE da aplikacija ucita utakmice i potrazi signal.</div>}
    </section>

    <div className="refresh-strip">
      <span><span className={loading ? 'pulse busy' : 'pulse'}/> {loading ? 'Skeniram...' : 'LIVE podaci'}</span>
      <button className="refresh-btn" onClick={onRefresh} disabled={loading}><RefreshCw size={13}/>{loading ? 'CEKAJ' : 'OSVEZI LIVE'}</button>
    </div>
    <div className="live-meta">
      <span>{lastUpdated ? `Osvezeno ${lastUpdated}` : 'Nije jos osvezeno'}</span>
      <span>{credits !== null ? `${credits} zahteva preostalo` : ''}</span>
    </div>

    {error && <div className="api-error">{error}</div>}

    <div className="tabs">
      <button className="active">LIVE</button><button disabled>Danas</button><button disabled>Kasnije</button><button disabled>Svi sportovi</button>
    </div>
    <div className="market-tabs">
      {['Sve', 'Golovi'].map((x) => <button key={x} className={market === x ? 'active' : ''} onClick={() => setMarket(x)}>{x === 'Golovi' ? '⚽ ' : ''}{x}</button>)}
    </div>

    <section className="signals">
      <div className="list-heading">
        <span><Flame size={18}/> Top LIVE signali</span>
        <span className="muted">{signals.length ? `${signals.length} pronadjeno` : 'bez forsiranja'}</span>
      </div>
      {shown.length
        ? shown.map((signal) => <SignalCard key={signal.id} signal={signal} onOpen={onOpen}/>)
        : <div className="empty">{matches.length ? 'Nema dovoljno jakog signala za ovaj refresh.' : 'Osvezi LIVE da ucitas trenutne meceve.'}</div>}
    </section>

    <section className="stats">
      <div><Radio/><span>LIVE mecevi</span><b>{matches.length}</b><small>trenutno</small></div>
      <div><Target/><span>Analizirano</span><b>{scanned}</b><small>ovaj refresh</small></div>
      <div><BarChart3/><span>IGRAJ</span><b>{signals.filter((s) => s.action === 'IGRAJ').length}</b><small>sa kvotom</small></div>
    </section>
  </>
}

function DetailView({ signal, stats, loadingStats, loadStats, onBack }) {
  useEffect(() => { if (!stats) loadStats(signal) }, [signal.id])
  const home = normalizeStats(stats?.[0])
  const away = normalizeStats(stats?.[1])
  const rows = [
    ['Sutevi', home['Total Shots'], away['Total Shots']],
    ['U okvir', home['Shots on Goal'], away['Shots on Goal']],
    ['Posed', home['Ball Possession'], away['Ball Possession']],
    ['Korneri', home['Corner Kicks'], away['Corner Kicks']],
    ['Zuti kartoni', home['Yellow Cards'], away['Yellow Cards']],
    ['Crveni kartoni', home['Red Cards'], away['Red Cards']],
  ]

  return <section className="detail-view">
    <button className="back-btn" onClick={onBack}><ChevronLeft/> Nazad</button>
    <div className="match-stage">
      <div className="detail-meta"><span>{signal.league}</span><span className="live-dot">● LIVE</span></div>
      <div className="detail-teams">
        <div className="detail-team"><div className="club big">{initials(signal.home)}</div><strong>{signal.home}</strong></div>
        <div className="detail-score"><b>{signal.score}</b><span>{signal.minute}</span></div>
        <div className="detail-team"><div className="club orange big">{initials(signal.away)}</div><strong>{signal.away}</strong></div>
      </div>
    </div>

    <div className="ai-signal-box">
      <div className="signal-head"><Brain/><strong>LIVE signal</strong><span><ShieldCheck/> {signal.action}</span></div>
      <div className="signal-main">
        <div><small>PREDIKCIJA</small><h2>{signal.tip}</h2><p>{signal.reasons?.join(' · ')}</p></div>
        <div className="signal-kpis">
          <div><small>POUZDANOST</small><b>{signal.confidence}%</b></div>
          <div><small>KVOTA</small><strong>{signal.odds}</strong></div>
        </div>
      </div>
      <StatusBadge action={signal.action}/>
    </div>

    <div className="analysis-card">
      <div className="analysis-title"><TrendingUp/> Momentum <span>iz LIVE statistike</span></div>
      <div className="momentum-labels">
        <b>{signal.home}<em>{signal.momentumHome}%</em></b>
        <b>{signal.away}<em>{signal.momentumAway}%</em></b>
      </div>
      <div className="momentum-track"><div style={{ width: `${signal.momentumHome}%` }}/></div>
    </div>

    <div className="analysis-card">
      <div className="analysis-title"><BarChart3/> Statistika utakmice <span>LIVE</span></div>
      {loadingStats ? <div className="empty">Ucitavam statistiku...</div> : (
        <div className="stat-grid">{rows.map(([label, h, a]) => (
          <div className="stat-tile" key={label}><span><Activity/></span><small>{label}</small><b>{h ?? '-'} - {a ?? '-'}</b></div>
        ))}</div>
      )}
    </div>

    <div className="analysis-card reason-card">
      <div className="analysis-title"><Brain/> Zasto je signal prikazan</div>
      <p>{signal.reasons?.length ? signal.reasons.join('. ') + '.' : 'Nema dovoljno jakog statistickog razloga za ulaz.'}</p>
    </div>
  </section>
}

function LiveView({ matches, signals, onOpen }) {
  const signalMap = new Map(signals.map((s) => [s.id, s]))
  const rows = matches.map((match) => signalMap.get(match.fixture?.id) || ({
    id: match.fixture?.id,
    league: match.league?.name || '-',
    minute: match.fixture?.status?.elapsed ? `${match.fixture.status.elapsed}'` : match.fixture?.status?.short || 'LIVE',
    home: match.teams?.home?.name || '-',
    away: match.teams?.away?.name || '-',
    score: `${match.goals?.home ?? 0} : ${match.goals?.away ?? 0}`,
    tip: 'Nije medju top signalima',
    market: 'Golovi',
    confidence: 0,
    odds: '—',
    action: 'PRESKOCI',
    reasons: ['Nije izabran za automatski signal.'],
    momentumHome: 50,
    momentumAway: 50,
    raw: match,
  }))

  return <section className="page-panel">
    <h2><Radio/> LIVE centar</h2><p className="muted">Svi trenutno dostupni LIVE mecevi.</p>
    {rows.length ? rows.map((signal) => <SignalCard key={signal.id} signal={signal} onOpen={onOpen}/>) : <div className="empty">Prvo osvezi LIVE na Pocetnoj.</div>}
  </section>
}

function SignalsView({ signals, onOpen }) {
  return <section className="page-panel">
    <h2><BarChart3/> Signali</h2><p className="muted">Samo signali dobijeni iz trenutnih LIVE podataka.</p>
    {signals.length ? [...signals].sort((a, b) => b.confidence - a.confidence).map((s) => <SignalCard key={s.id} signal={s} onOpen={onOpen}/>) : <div className="empty">Nema aktivnih signala.</div>}
  </section>
}

function HistoryView({ history }) {
  return <section className="page-panel">
    <h2><Clock3/> Istorija skeniranja</h2><p className="muted">Poslednji signali pronadjeni na ovom telefonu.</p>
    {history.length ? history.map((h, i) => <div className="history-row" key={`${h.id}-${i}`}>
      <div><strong>{h.home} - {h.away}</strong><small>{h.tip} · {h.odds} · {h.savedAt}</small></div>
      <span className={h.action === 'IGRAJ' ? 'won' : 'muted'}>{h.action}</span>
    </div>) : <div className="empty">Istorija je prazna.</div>}
  </section>
}

function ProfileView({ settings, setSettings }) {
  return <section className="page-panel profile">
    <CircleUserRound size={54}/><h2>AI Score podesavanja</h2><p className="muted">Pragovi se cuvaju na ovom uredjaju.</p>
    <label className="profile-card setting-card">
      <span>Minimalna kvota</span>
      <input type="number" min="1.01" max="5" step="0.05" value={settings.minOdds} onChange={(e) => setSettings((s) => ({ ...s, minOdds: Math.max(1.01, Number(e.target.value) || 1.2) }))}/>
    </label>
    <label className="profile-card setting-card">
      <span>Minimalna pouzdanost</span>
      <input type="number" min="50" max="95" step="1" value={settings.minConfidence} onChange={(e) => setSettings((s) => ({ ...s, minConfidence: Math.max(50, Math.min(95, Number(e.target.value) || 70)) }))}/>
    </label>
    <div className="profile-card"><span>Osvezavanje</span><b>RUCNO</b><RefreshCw/></div>
  </section>
}

export default function App() {
  const [view, setView] = useState('Pocetna')
  const [market, setMarket] = useState('Sve')
  const [selected, setSelected] = useState(null)
  const [matches, setMatches] = useState([])
  const [signals, setSignals] = useState([])
  const [statsMap, setStatsMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingStats, setLoadingStats] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [credits, setCredits] = useState(null)
  const [scanned, setScanned] = useState(0)
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('aiscore-history') || '[]') } catch { return [] } })
  const [settings, setSettings] = useState(() => { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('aiscore-settings') || '{}') } } catch { return DEFAULT_SETTINGS } })

  useEffect(() => { localStorage.setItem('aiscore-settings', JSON.stringify(settings)) }, [settings])

  async function getStats(match) {
    const id = match?.fixture?.id
    if (!id) return []
    if (statsMap[id]) return statsMap[id]
    const result = await api('stats', id)
    if (result.credits_remaining !== null && result.credits_remaining !== undefined) setCredits(result.credits_remaining)
    const data = result.data || []
    setStatsMap((prev) => ({ ...prev, [id]: data }))
    return data
  }

  async function getOdds(id) {
    try {
      const result = await api('odds', id)
      if (result.credits_remaining !== null && result.credits_remaining !== undefined) setCredits(result.credits_remaining)
      return result.data || []
    } catch {
      return []
    }
  }

  async function refreshLive() {
    if (loading) return
    setLoading(true); setError(''); setSignals([]); setScanned(0)

    try {
      const live = await api('live')
      const list = live.data || []
      setMatches(list)
      if (live.credits_remaining !== null && live.credits_remaining !== undefined) setCredits(live.credits_remaining)

      const candidates = list
        .filter((m) => { const minute = asNumber(m.fixture?.status?.elapsed); return minute >= 25 && minute <= 86 })
        .sort((a, b) => asNumber(b.fixture?.status?.elapsed) - asNumber(a.fixture?.status?.elapsed))
        .slice(0, MAX_AUTO_SCAN)

      const found = []
      for (const match of candidates) {
        try {
          const stats = await getStats(match)
          const analysis = analyzeMatch(match, stats)
          setScanned((n) => n + 1)
          if (analysis.confidence < settings.minConfidence) continue

          let oddPick = null
          if (analysis.side) {
            const odds = await getOdds(match.fixture?.id)
            oddPick = chooseLiveOdd(
              odds,
              analysis.side,
              asNumber(match.goals?.home) + asNumber(match.goals?.away),
              settings.minOdds
            )
          }

          const signal = toSignal(match, analysis, oddPick, settings.minConfidence)
          if (signal.action !== 'PRESKOCI') found.push(signal)
        } catch {
          setScanned((n) => n + 1)
        }
      }

      found.sort((a, b) => b.confidence - a.confidence)
      setSignals(found)
      const time = new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })
      setLastUpdated(time)

      if (found.length) {
        const saved = found.map((s) => ({ ...s, raw: undefined, savedAt: time }))
        const next = [...saved, ...history].slice(0, 30)
        setHistory(next)
        localStorage.setItem('aiscore-history', JSON.stringify(next))
      }
    } catch (e) {
      setError(e.message === 'API_FOOTBALL_KEY nije podesen na backendu'
        ? 'LIVE API jos nije aktiviran. Potrebno je jednom dodati API_FOOTBALL_KEY na backend.'
        : e.message || 'Ne mogu da ucitam LIVE podatke.')
    } finally {
      setLoading(false)
    }
  }

  async function loadDetailStats(signal) {
    if (!signal?.id || statsMap[signal.id]) return
    setLoadingStats(true)
    try {
      const match = signal.raw || matches.find((m) => m.fixture?.id === signal.id)
      if (match) await getStats(match)
    } finally {
      setLoadingStats(false)
    }
  }

  const switchView = (name) => { setSelected(null); setView(name) }

  return (
    <div className="app-shell">
      <header>
        <div className="brand">
          <div className="logo"><Activity size={24}/></div>
          <div><div className="brand-title">AI <span>Score</span></div><div className="brand-sub">VISE OD PREDIKCIJE</div></div>
        </div>
        <button className="bell-btn" onClick={refreshLive} aria-label="Osvezi LIVE"><Bell size={19}/><span/></button>
      </header>

      <main>
        {selected
          ? <DetailView signal={selected} stats={statsMap[selected.id]} loadingStats={loadingStats} loadStats={loadDetailStats} onBack={() => setSelected(null)}/>
          : <>
            {view === 'Pocetna' && <HomeView signals={signals} matches={matches} loading={loading} error={error} lastUpdated={lastUpdated} credits={credits} scanned={scanned} market={market} setMarket={setMarket} onRefresh={refreshLive} onOpen={setSelected}/>}
            {view === 'LIVE' && <LiveView matches={matches} signals={signals} onOpen={setSelected}/>}
            {view === 'Signali' && <SignalsView signals={signals} onOpen={setSelected}/>}
            {view === 'Istorija' && <HistoryView history={history}/>}
            {view === 'Profil' && <ProfileView settings={settings} setSettings={setSettings}/>}
          </>}
      </main>

      {!selected && <nav className="bottom-nav">
        {[['Pocetna', Home], ['LIVE', Radio], ['Signali', BarChart3], ['Istorija', Clock3], ['Profil', CircleUserRound]].map(([name, Icon]) => (
          <button key={name} className={view === name ? 'active' : ''} onClick={() => switchView(name)}><Icon/><span>{name}</span></button>
        ))}
      </nav>}
    </div>
  )
}
