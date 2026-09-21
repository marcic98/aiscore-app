import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Brain, ChevronLeft, ChevronRight, Clock3, Home,
  RefreshCw, ShieldCheck, Target, Trophy
} from 'lucide-react'
import { buildPrematchAnalysis } from './analysisService'
import {
  getToday, getPrematchBundle, saveAnalysis, getHistory
} from './dataClient'

const SETTINGS = { minProbability: 0.67 }
const FILTERS = ['SVE', 'IGRAJ', 'PRESKOČI']

function fmtPct(value, digits = 0) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(digits)}%` : '—'
}
function fmtNum(value, digits = 2) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—'
}
function localDateKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}
function verdictClass(v) {
  if (v === 'IGRAJ' || v === 'WIN') return 'verdict-play'
  return 'verdict-skip'
}
function pickLabel(pick) {
  if (!pick?.market || pick?.status === 'NO_QUALIFIED_BET') return 'Nema dovoljno jakog signala'
  const line = pick.line !== null && pick.line !== undefined ? ` ${pick.line}` : ''
  return `${pick.market} · ${pick.selection || ''}${line}`
}

function Header() {
  return <header className="lite-header">
    <div className="brand">
      <div className="logo"><Activity size={23}/></div>
      <div>
        <div className="brand-title">AI <span>Score</span> <em>PREMATCH</em></div>
        <div className="brand-sub">Bez API kljuceva · Bez LIVE-a</div>
      </div>
    </div>
    <div className="engine-pill"><ShieldCheck size={14}/> PUBLIC DATA</div>
  </header>
}

function Loading({ text }) {
  return <div className="lite-empty"><RefreshCw className="spin" size={18}/><span>{text}</span></div>
}
function ErrorBox({ error }) {
  if (!error) return null
  return <div className="lite-error"><strong>DATA UNAVAILABLE</strong><span>{String(error)}</span></div>
}

function PickSummary({ result }) {
  if (!result?.analysis) return <div className="mini-status neutral">CEKA ANALIZU</div>
  const pick = result.picks?.find((p) => p.status === 'QUALIFIED')
  return <div className="pick-summary">
    <span className={`mini-status ${verdictClass(result.analysis.verdict)}`}>{result.analysis.verdict}</span>
    <strong>{pickLabel(pick)}</strong>
    {pick ? <small>AI {fmtPct(pick.aiProbability)} · bez kvote/value potvrde</small> : <small>{result.analysis.data_quality} DATA</small>}
  </div>
}

function TodayScreen({ fixtures, analyses, loading, analyzing, progress, error, onRefresh, onOpen, filter, setFilter }) {
  const rows = useMemo(() => fixtures.map((fixture) => ({
    fixture,
    result: analyses[fixture.fixture?.id]?.result || null
  })), [fixtures, analyses])

  const filtered = rows.filter(({ result }) => filter === 'SVE' || result?.analysis?.verdict === filter)
  const plays = rows.filter((x) => x.result?.analysis?.verdict === 'IGRAJ').length
  const skips = rows.filter((x) => x.result?.analysis?.verdict === 'PRESKOCI').length

  return <>
    <section className="lite-hero">
      <div>
        <small>DANASNJI PREMATCH PREGLED</small>
        <h1>{fixtures.length ? `${fixtures.length} meceva pronadjeno` : 'Trazim danasnje meceve'}</h1>
        <p>Raspored dolazi iz javnih izvora bez API kljuca. AI koristi samo proverljive prethodne rezultate. Ako nema dovoljno podataka, rezultat je PRESKOCI.</p>
      </div>
      <button className="round-refresh" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? 'spin' : ''}/></button>
      {analyzing && <div className="lite-progress"><span style={{width:`${progress.total ? (progress.done/progress.total)*100 : 0}%`}}/></div>}
    </section>

    <ErrorBox error={error}/>

    <section className="summary-strip two">
      <div><b>{plays}</b><span>IGRAJ</span></div>
      <div><b>{skips}</b><span>PRESKOCI</span></div>
    </section>

    <div className="lite-filters">{FILTERS.map((x) => <button key={x} className={filter===x?'active':''} onClick={() => setFilter(x)}>{x}</button>)}</div>

    <section className="lite-list">
      <div className="lite-section-title"><Target size={18}/><span>Danas</span></div>
      {loading && !fixtures.length ? <Loading text="Ucitavam javni raspored..."/> : filtered.map(({fixture,result}) => (
        <button className="lite-match" key={fixture.fixture?.id} onClick={() => onOpen(fixture)}>
          <div className="lite-time">
            <strong>{new Date(fixture.fixture?.date).toLocaleTimeString('sr-RS',{hour:'2-digit',minute:'2-digit'})}</strong>
            <small>{fixture.league?.name}</small>
          </div>
          <div className="lite-teams">
            <span>{fixture.teams?.home?.name}</span>
            <span>{fixture.teams?.away?.name}</span>
          </div>
          <PickSummary result={result}/>
          <ChevronRight size={18}/>
        </button>
      ))}
      {!loading && !filtered.length && <div className="lite-empty"><span>Nema dostupnih prematch meceva u ovom filteru.</span></div>}
    </section>
  </>
}

function HistoryScreen({ history, loading, error, onRefresh }) {
  return <section className="lite-page">
    <div className="lite-page-head">
      <div><small>SACUVANE ANALIZE</small><h2>Istorija</h2><p>Cuva se originalni prematch signal. Bez placenog feeda nema automatskog value/CLV pracenja.</p></div>
      <button className="round-refresh" onClick={onRefresh} disabled={loading}><RefreshCw className={loading?'spin':''}/></button>
    </div>
    <ErrorBox error={error}/>
    {history.filter((a)=>a.mode==='prematch').map((a) => {
      const p = (a.aiscore_analysis_picks || []).find((x) => x.status === 'QUALIFIED')
      return <div className="history-lite" key={a.id}>
        <div><strong>{a.home_team_name} - {a.away_team_name}</strong><small>{new Date(a.analysis_generated_at).toLocaleString('sr-RS')}</small></div>
        <span className={`mini-status ${verdictClass(a.verdict)}`}>{a.verdict}</span>
        <p>{p ? `${p.market} · ${p.selection}${p.line != null ? ` ${p.line}` : ''} · AI ${fmtPct(p.ai_probability)}` : 'Bez kvalifikovanog signala'}</p>
      </div>
    })}
    {!loading && !history.length && <div className="lite-empty"><span>Istorija je prazna.</span></div>}
  </section>
}

function DetailScreen({ fixture, stored, loading, onBack, onAnalyze }) {
  const result = stored?.result
  const pick = result?.picks?.find((p) => p.status === 'QUALIFIED')
  const verdict = result?.analysis?.verdict

  return <section className="detail-lite">
    <button className="back-btn" onClick={onBack}><ChevronLeft/> Nazad</button>
    <div className="detail-lite-card">
      <small>{fixture.league?.name}</small>
      <div className="detail-lite-teams">
        <strong>{fixture.teams?.home?.name}</strong><b>VS</b><strong>{fixture.teams?.away?.name}</strong>
      </div>
      <span>{new Date(fixture.fixture?.date).toLocaleString('sr-RS')}</span>
    </div>

    {!result ? <button className="analyze-big" onClick={onAnalyze} disabled={loading}><Brain/>{loading ? 'ANALIZIRAM...' : 'ANALIZIRAJ MEC'}</button> : <>
      <div className={`big-verdict ${verdictClass(verdict)}`}>
        <small>AISCORE ODLUKA</small>
        <strong>{verdict}</strong>
        <span>{result.analysis.data_quality} DATA · Confidence {result.analysis.confidence}</span>
      </div>

      <div className="lite-pick-card">
        <div className="lite-section-title"><Trophy size={18}/><span>Najbolja statisticka opcija</span></div>
        <h3>{pickLabel(pick)}</h3>
        {pick ? <div className="metric-grid public-metrics">
          <div><small>AI PROCENA</small><b>{fmtPct(pick.aiProbability)}</b></div>
          <div><small>FAIR ODDS</small><b>{fmtNum(pick.fairOdds)}</b></div>
          <div><small>KVOTA</small><b>—</b></div>
          <div><small>VALUE</small><b>NIJE PROVEREN</b></div>
        </div> : <p>Nema dovoljno podataka za signal koji prelazi nas prag.</p>}
        <div className="reason-box"><small>ZASTO</small><p>{pick?.why || 'Model nema dovoljno kvalitetnih podataka za preporuku.'}</p></div>
        <div className="reason-box risk"><small>VAZNO</small><p>Bez trenutne kvote aplikacija ne tvrdi da je opklada value. Ona samo izdvaja statisticki najverovatniji prematch scenario.</p></div>
      </div>

      <div className="lite-pick-card compact-info">
        <div><span>Forma domacina</span><b>{result.homeRecent?.sampleSize || 0} meceva · GF {fmtNum(result.homeRecent?.gfAvg)}</b></div>
        <div><span>Forma gosta</span><b>{result.awayRecent?.sampleSize || 0} meceva · GF {fmtNum(result.awayRecent?.gfAvg)}</b></div>
        <div><span>Model golova</span><b>{result.model ? fmtNum((result.model.lambdaHome||0)+(result.model.lambdaAway||0)) : '—'}</b></div>
        <div><span>Izvor</span><b>PUBLIC · NO KEY</b></div>
      </div>
    </>}
  </section>
}

export default function App() {
  const [view, setView] = useState('DANAS')
  const [fixtures, setFixtures] = useState([])
  const [analyses, setAnalyses] = useState({})
  const [selected, setSelected] = useState(null)
  const [loadingToday, setLoadingToday] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [todayError, setTodayError] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [progress, setProgress] = useState({done:0,total:0})
  const [filter, setFilter] = useState('SVE')
  const autoRan = useRef(false)

  useEffect(() => { loadToday() }, [])
  useEffect(() => { if (view === 'ISTORIJA') refreshHistory() }, [view])

  useEffect(() => {
    if (!fixtures.length || autoRan.current || analyzing) return
    autoRan.current = true
    analyzeAvailable(fixtures)
  }, [fixtures])

  async function loadToday() {
    if (loadingToday) return
    setLoadingToday(true); setTodayError('')
    try {
      const data = await getToday(localDateKey())
      setFixtures(data.data || [])
      autoRan.current = false
    } catch (e) {
      setTodayError(e.message || 'Ne mogu da ucitam javni raspored.')
    } finally { setLoadingToday(false) }
  }

  async function analyzePrematch(fixture) {
    const id = fixture?.fixture?.id
    const league = fixture?.provider_meta?.league_slug || fixture?.league?.code
    if (!id || !league) return null
    const bundle = await getPrematchBundle(id, league, localDateKey())
    const result = buildPrematchAnalysis(bundle, SETTINGS)
    await saveAnalysis(result.analysis, result.picks).catch(() => null)
    const stored = { bundle, result }
    setAnalyses((prev) => ({ ...prev, [id]: stored }))
    return stored
  }

  async function analyzeAvailable(source = fixtures) {
    const candidates = source.slice(0,12)
    if (!candidates.length || analyzing) return
    setAnalyzing(true); setProgress({done:0,total:candidates.length})
    for (let i=0;i<candidates.length;i++) {
      const fixture = candidates[i]
      if (!analyses[fixture.fixture?.id]) {
        try { await analyzePrematch(fixture) } catch {}
      }
      setProgress({done:i+1,total:candidates.length})
    }
    setAnalyzing(false)
  }

  async function openMatch(fixture) {
    setSelected(fixture)
    const id = fixture.fixture?.id
    if (!analyses[id]) {
      setAnalyzing(true)
      try { await analyzePrematch(fixture) } catch (e) { setTodayError(e.message) }
      finally { setAnalyzing(false) }
    }
  }

  async function refreshHistory() {
    setHistoryLoading(true); setHistoryError('')
    try {
      const data = await getHistory(100)
      setHistory(data.data || [])
    } catch (e) { setHistoryError(e.message) }
    finally { setHistoryLoading(false) }
  }

  const selectedStored = selected ? analyses[selected.fixture?.id] : null

  return <div className="app-shell lite-shell">
    <Header/>
    <main>
      {selected ? <DetailScreen fixture={selected} stored={selectedStored} loading={analyzing} onBack={() => setSelected(null)} onAnalyze={() => analyzePrematch(selected)}/> : <>
        {view === 'DANAS' && <TodayScreen fixtures={fixtures} analyses={analyses} loading={loadingToday} analyzing={analyzing} progress={progress} error={todayError} onRefresh={loadToday} onOpen={openMatch} filter={filter} setFilter={setFilter}/>}
        {view === 'ISTORIJA' && <HistoryScreen history={history} loading={historyLoading} error={historyError} onRefresh={refreshHistory}/>}
      </>}
    </main>

    {!selected && <nav className="bottom-nav lite-nav two-tabs">
      {[
        ['DANAS',Home],['ISTORIJA',Clock3]
      ].map(([name,Icon]) => <button key={name} className={view===name?'active':''} onClick={() => setView(name)}><Icon/><span>{name}</span></button>)}
    </nav>}
  </div>
}
