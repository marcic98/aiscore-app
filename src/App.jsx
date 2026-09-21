import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Brain, ChevronLeft, ChevronRight, Clock3, Home, Radio,
  RefreshCw, ShieldCheck, Target, Trophy
} from 'lucide-react'
import { buildPrematchAnalysis, buildLiveAnalysis } from './analysisService'
import {
  getToday, getPrematchBundle, getLiveBundle, saveAnalysis,
  getHistory, getOddsHistory, settleHistory
} from './dataClient'

const DEFAULT_SETTINGS = { minOdds: 1.2, minEdgePP: 3, minEvPct: 2 }
const FILTERS = ['SVE', 'IGRAJ', 'SAČEKAJ', 'PRESKOČI']

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
function fixtureStatus(f) { return f?.fixture?.status?.short || '-' }
function isLiveStatus(s) { return ['1H','HT','2H','ET','BT','P','INT','LIVE'].includes(s) }
function isFinishedStatus(s) { return ['FT','AET','PEN','CANC','PST','ABD','AWD','WO'].includes(s) }
function verdictClass(v) {
  if (v === 'IGRAJ' || v === 'WIN') return 'verdict-play'
  if (v === 'CEKAJ' || v === 'SAČEKAJ' || v === 'VOID') return 'verdict-wait'
  return 'verdict-skip'
}
function verdictLabel(v) {
  if (v === 'CEKAJ') return 'SAČEKAJ'
  return v || 'PRESKOČI'
}
function pickLabel(pick) {
  if (!pick?.market || pick?.status === 'NO_QUALIFIED_BET') return 'Nema kvalifikovanog tipa'
  const line = pick.line !== null && pick.line !== undefined && !String(pick.selection).includes(String(pick.line)) ? ` ${pick.line}` : ''
  return `${pick.market} · ${pick.selection || ''}${line}`
}

function Header() {
  return <header className="lite-header">
    <div className="brand">
      <div className="logo"><Activity size={23}/></div>
      <div>
        <div className="brand-title">AI <span>Score</span> <em>LITE</em></div>
        <div className="brand-sub">Samo mečevi koji vrede pažnje</div>
      </div>
    </div>
    <div className="engine-pill"><ShieldCheck size={14}/> AI FILTER</div>
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
  const pick = result?.picks?.find((p) => p.status === 'QUALIFIED') || result?.picks?.find((p) => p.status === 'CEKAJ') || null
  if (!result?.analysis) return <div className="mini-status neutral">ČEKA ANALIZU</div>
  const v = result.analysis.verdict
  return <div className="pick-summary">
    <span className={`mini-status ${verdictClass(v)}`}>{verdictLabel(v)}</span>
    <strong>{pickLabel(pick)}</strong>
    {pick?.odds ? <small>Kvota {fmtNum(pick.odds)} · AI {fmtPct(pick.aiProbability)} · Edge {Number(pick.edgePP || 0).toFixed(1)} pp</small> : <small>{result.analysis.data_quality || 'LOW'} DATA</small>}
  </div>
}

function TodayScreen({ fixtures, analyses, loading, analyzing, progress, error, onRefresh, onOpen, filter, setFilter }) {
  const rows = useMemo(() => fixtures.map((fixture) => ({ fixture, result: analyses[fixture.fixture?.id]?.result || null })), [fixtures, analyses])
  const filtered = rows.filter(({ result }) => {
    if (filter === 'SVE') return true
    const v = verdictLabel(result?.analysis?.verdict)
    return v === filter
  })
  const plays = rows.filter((x) => x.result?.analysis?.verdict === 'IGRAJ').length
  const waits = rows.filter((x) => x.result?.analysis?.verdict === 'CEKAJ').length
  const skips = rows.filter((x) => x.result?.analysis?.verdict === 'PRESKOCI').length

  return <>
    <section className="lite-hero">
      <div>
        <small>DANAŠNJI AI PREGLED</small>
        <h1>{fixtures.length ? `${fixtures.length} mečeva pronađeno` : 'Tražim današnje mečeve'}</h1>
        <p>AI automatski filtrira dostupne utakmice. Ako nema dovoljno podataka ili value-a, meč ide na PRESKOČI.</p>
      </div>
      <button className="round-refresh" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? 'spin' : ''}/></button>
      {analyzing && <div className="lite-progress"><span style={{width:`${progress.total ? (progress.done/progress.total)*100 : 0}%`}}/></div>}
    </section>

    <ErrorBox error={error}/>

    <section className="summary-strip">
      <div><b>{plays}</b><span>IGRAJ</span></div>
      <div><b>{waits}</b><span>SAČEKAJ</span></div>
      <div><b>{skips}</b><span>PRESKOČI</span></div>
    </section>

    <div className="lite-filters">{FILTERS.map((x) => <button key={x} className={filter===x?'active':''} onClick={() => setFilter(x)}>{x}</button>)}</div>

    <section className="lite-list">
      <div className="lite-section-title"><Target size={18}/><span>Danas</span></div>
      {loading && !fixtures.length ? <Loading text="Učitavam utakmice..."/> : filtered.map(({fixture,result}) => {
        const live = isLiveStatus(fixtureStatus(fixture))
        return <button className="lite-match" key={fixture.fixture?.id} onClick={() => onOpen(fixture, live ? 'live' : 'prematch')}>
          <div className="lite-time">
            <strong>{live ? (fixture.fixture?.status?.elapsed ? `${fixture.fixture.status.elapsed}'` : 'LIVE') : new Date(fixture.fixture?.date).toLocaleTimeString('sr-RS',{hour:'2-digit',minute:'2-digit'})}</strong>
            <small>{fixture.league?.name}</small>
          </div>
          <div className="lite-teams">
            <span>{fixture.teams?.home?.name}</span>
            <span>{fixture.teams?.away?.name}</span>
            {live && <b>{fixture.goals?.home ?? 0} : {fixture.goals?.away ?? 0}</b>}
          </div>
          <PickSummary result={result}/>
          <ChevronRight size={18}/>
        </button>
      })}
      {!loading && !filtered.length && <div className="lite-empty"><span>Nema mečeva u ovom filteru.</span></div>}
    </section>
  </>
}

function LiveScreen({ fixtures, analyses, loading, error, onRefresh, onOpen }) {
  return <section className="lite-page">
    <div className="lite-page-head">
      <div><small>LIVE RADAR</small><h2>Utakmice uživo</h2><p>Osvežavanje je ručno da ne trošimo API bez potrebe.</p></div>
      <button className="round-refresh" onClick={onRefresh} disabled={loading}><RefreshCw className={loading?'spin':''}/></button>
    </div>
    <ErrorBox error={error}/>
    {loading && !fixtures.length ? <Loading text="Tražim LIVE utakmice..."/> : fixtures.map((fixture) => <button className="lite-match live" key={fixture.fixture?.id} onClick={() => onOpen(fixture,'live')}>
      <div className="lite-time"><strong>{fixture.fixture?.status?.elapsed ? `${fixture.fixture.status.elapsed}'` : 'LIVE'}</strong><small>{fixture.league?.name}</small></div>
      <div className="lite-teams"><span>{fixture.teams?.home?.name}</span><span>{fixture.teams?.away?.name}</span><b>{fixture.goals?.home ?? 0} : {fixture.goals?.away ?? 0}</b></div>
      <PickSummary result={analyses[fixture.fixture?.id]?.result}/>
      <ChevronRight size={18}/>
    </button>)}
    {!loading && !fixtures.length && <div className="lite-empty"><span>Trenutno nema dostupnih LIVE utakmica.</span></div>}
  </section>
}

function HistoryScreen({ history, loading, error, onRefresh }) {
  return <section className="lite-page">
    <div className="lite-page-head">
      <div><small>REZULTATI MODELA</small><h2>Istorija</h2><p>Čuvamo originalnu analizu, kvotu i rezultat.</p></div>
      <button className="round-refresh" onClick={onRefresh} disabled={loading}><RefreshCw className={loading?'spin':''}/></button>
    </div>
    <ErrorBox error={error}/>
    {history.map((a) => {
      const p = (a.aiscore_analysis_picks || []).find((x) => x.status === 'QUALIFIED')
      return <div className="history-lite" key={a.id}>
        <div><strong>{a.home_team_name} - {a.away_team_name}</strong><small>{new Date(a.analysis_generated_at).toLocaleString('sr-RS')}</small></div>
        <span className={`mini-status ${verdictClass(a.verdict)}`}>{verdictLabel(a.verdict)}</span>
        <p>{p ? `${p.market} · ${p.selection} · ${fmtNum(p.odds)}` : 'Bez kvalifikovanog tipa'}</p>
        {p?.result && <b className={verdictClass(p.result)}>{p.result}</b>}
      </div>
    })}
    {!loading && !history.length && <div className="lite-empty"><span>Istorija je prazna.</span></div>}
  </section>
}

function DetailScreen({ fixture, stored, mode, loading, onBack, onAnalyze }) {
  const result = stored?.result
  const pick = result?.picks?.find((p) => p.status === 'QUALIFIED') || result?.picks?.find((p) => p.status === 'CEKAJ')
  const verdict = result?.analysis?.verdict
  return <section className="detail-lite">
    <button className="back-btn" onClick={onBack}><ChevronLeft/> Nazad</button>
    <div className="detail-lite-card">
      <small>{fixture.league?.name}</small>
      <div className="detail-lite-teams">
        <strong>{fixture.teams?.home?.name}</strong>
        <b>{mode==='live' ? `${fixture.goals?.home ?? 0} : ${fixture.goals?.away ?? 0}` : 'VS'}</b>
        <strong>{fixture.teams?.away?.name}</strong>
      </div>
      <span>{mode==='live' && fixture.fixture?.status?.elapsed ? `${fixture.fixture.status.elapsed}'` : new Date(fixture.fixture?.date).toLocaleString('sr-RS')}</span>
    </div>

    {!result ? <button className="analyze-big" onClick={onAnalyze} disabled={loading}><Brain/>{loading ? 'ANALIZIRAM...' : 'ANALIZIRAJ MEČ'}</button> : <>
      <div className={`big-verdict ${verdictClass(verdict)}`}>
        <small>AISCORE ODLUKA</small>
        <strong>{verdictLabel(verdict)}</strong>
        <span>{result.analysis.data_quality} DATA · Confidence {result.analysis.confidence}</span>
      </div>

      <div className="lite-pick-card">
        <div className="lite-section-title"><Trophy size={18}/><span>Najbolja opcija</span></div>
        <h3>{pickLabel(pick)}</h3>
        {pick?.odds ? <div className="metric-grid">
          <div><small>KVOTA</small><b>{fmtNum(pick.odds)}</b></div>
          <div><small>AI</small><b>{fmtPct(pick.aiProbability)}</b></div>
          <div><small>EDGE</small><b>{Number(pick.edgePP || 0).toFixed(1)} pp</b></div>
          <div><small>EV</small><b>{Number(pick.evPct || 0).toFixed(1)}%</b></div>
        </div> : <p>Nema dovoljno podataka ili tržišta za kvalifikovan predlog.</p>}
        <div className="reason-box"><small>ZAŠTO</small><p>{pick?.why || 'Model nije našao dovoljno jak signal.'}</p></div>
        {pick?.mainRisk && <div className="reason-box risk"><small>RIZIK</small><p>{pick.mainRisk}</p></div>}
      </div>

      <div className="lite-pick-card compact-info">
        <div><span>Forma domaćina</span><b>{result.homeRecent?.sampleSize || 0} mečeva · GF {fmtNum(result.homeRecent?.gfAvg)}</b></div>
        <div><span>Forma gosta</span><b>{result.awayRecent?.sampleSize || 0} mečeva · GF {fmtNum(result.awayRecent?.gfAvg)}</b></div>
        <div><span>Model golova</span><b>{result.model ? fmtNum((result.model.lambdaHome||0)+(result.model.lambdaAway||0)) : '—'}</b></div>
        <div><span>Sastavi</span><b>{result.lineupStatus || 'UNAVAILABLE'}</b></div>
      </div>
    </>}
  </section>
}

export default function App() {
  const [view, setView] = useState('DANAS')
  const [fixtures, setFixtures] = useState([])
  const [liveFixtures, setLiveFixtures] = useState([])
  const [analyses, setAnalyses] = useState({})
  const [selected, setSelected] = useState(null)
  const [selectedMode, setSelectedMode] = useState('prematch')
  const [loadingToday, setLoadingToday] = useState(false)
  const [loadingLive, setLoadingLive] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [todayError, setTodayError] = useState('')
  const [liveError, setLiveError] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [progress, setProgress] = useState({done:0,total:0})
  const [filter, setFilter] = useState('SVE')
  const autoRan = useRef(false)
  const settings = DEFAULT_SETTINGS

  useEffect(() => { loadToday() }, [])
  useEffect(() => {
    if (view === 'LIVE' && !liveFixtures.length) refreshLive()
    if (view === 'ISTORIJA') refreshHistory()
  }, [view])

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
      setTodayError(e.message || 'Ne mogu da učitam današnje utakmice.')
    } finally { setLoadingToday(false) }
  }

  async function analyzePrematch(fixture) {
    const id = fixture?.fixture?.id
    if (!id) return null
    const bundle = await getPrematchBundle(id)
    const result = buildPrematchAnalysis(bundle, settings)
    await saveAnalysis(result.analysis, result.picks).catch(() => null)
    const movement = await getOddsHistory(id).catch(() => ({ data: [] }))
    const stored = { bundle, result, oddsHistory: movement.data || [] }
    setAnalyses((prev) => ({ ...prev, [id]: stored }))
    return stored
  }

  async function analyzeAvailable(source = fixtures) {
    const candidates = source.filter((f) => !isFinishedStatus(fixtureStatus(f))).slice(0,8)
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

  async function refreshLive() {
    if (loadingLive) return
    setLoadingLive(true); setLiveError('')
    try {
      const data = await getLiveBundle()
      setLiveFixtures(data.data || [])
    } catch (e) { setLiveError(e.message || 'LIVE podaci nisu dostupni.') }
    finally { setLoadingLive(false) }
  }

  async function openMatch(fixture, mode='prematch') {
    setSelected(fixture); setSelectedMode(mode)
    const id = fixture.fixture?.id
    if (mode === 'live') {
      setAnalyzing(true)
      try {
        const [liveBundle,prematchBundle] = await Promise.all([getLiveBundle(id),getPrematchBundle(id)])
        const baseline = buildPrematchAnalysis(prematchBundle, settings)
        const liveResult = buildLiveAnalysis(liveBundle, baseline, settings)
        await saveAnalysis(liveResult.analysis, liveResult.picks).catch(() => null)
        setAnalyses((prev) => ({...prev,[id]:{
          bundle:{...prematchBundle,...liveBundle},
          result:{...liveResult,model:baseline.model,homeRecent:baseline.homeRecent,awayRecent:baseline.awayRecent,lineupStatus:baseline.lineupStatus}
        }}))
        if (liveBundle.fixture) setSelected(liveBundle.fixture)
      } catch (e) { setLiveError(e.message) }
      finally { setAnalyzing(false) }
    } else if (!analyses[id]) {
      setAnalyzing(true)
      try { await analyzePrematch(fixture) } catch (e) { setTodayError(e.message) }
      finally { setAnalyzing(false) }
    }
  }

  async function refreshHistory() {
    setHistoryLoading(true); setHistoryError('')
    try {
      await settleHistory().catch(() => null)
      const data = await getHistory(100)
      setHistory(data.data || [])
    } catch (e) { setHistoryError(e.message) }
    finally { setHistoryLoading(false) }
  }

  const selectedStored = selected ? analyses[selected.fixture?.id] : null

  return <div className="app-shell lite-shell">
    <Header/>
    <main>
      {selected ? <DetailScreen fixture={selected} stored={selectedStored} mode={selectedMode} loading={analyzing} onBack={() => setSelected(null)} onAnalyze={() => openMatch(selected,selectedMode)}/> : <>
        {view === 'DANAS' && <TodayScreen fixtures={fixtures} analyses={analyses} loading={loadingToday} analyzing={analyzing} progress={progress} error={todayError} onRefresh={loadToday} onOpen={openMatch} filter={filter} setFilter={setFilter}/>}
        {view === 'LIVE' && <LiveScreen fixtures={liveFixtures} analyses={analyses} loading={loadingLive} error={liveError} onRefresh={refreshLive} onOpen={openMatch}/>}
        {view === 'ISTORIJA' && <HistoryScreen history={history} loading={historyLoading} error={historyError} onRefresh={refreshHistory}/>}
      </>}
    </main>

    {!selected && <nav className="bottom-nav lite-nav">
      {[
        ['DANAS',Home],['LIVE',Radio],['ISTORIJA',Clock3]
      ].map(([name,Icon]) => <button key={name} className={view===name?'active':''} onClick={() => setView(name)}><Icon/><span>{name}</span></button>)}
    </nav>}
  </div>
}
