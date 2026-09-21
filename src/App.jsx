import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, BarChart3, Brain, ChevronLeft, ChevronRight, Clock3, Home,
  RefreshCw, Radio, ShieldCheck, Target, Trophy
} from 'lucide-react'
import { buildPrematchAnalysis, buildLiveAnalysis } from './analysisService'
import {
  getToday, getPrematchBundle, getLiveFixtures, getLiveBundle, saveAnalysis,
  getHistory, getAnalytics, settleHistory
} from './dataClient'

const SETTINGS = { minProbability: 0.67, minOdds: 1.20, minEdgePP: 3, minEvPct: 2 }
const TODAY_FILTERS = ['ALL','IGRAJ','PRESKOCI','HIGH CONFIDENCE','VALUE','UPCOMING']
const DETAIL_TABS = ['OVERVIEW','FORM','STATS','XG','GOALS','SHOTS','CORNERS','CARDS','LINEUPS','PLAYERS','H2H','ODDS','AI ANALYSIS']

function fmtPct(value, digits = 1) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(digits)}%` : '—'
}
function fmtPP(value, digits = 1) {
  return Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(digits)} pp` : '—'
}
function fmtEv(value, digits = 1) {
  return Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(digits)}%` : '—'
}
function fmtNum(value, digits = 2) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—'
}
function localDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function verdictClass(v) {
  if (v === 'IGRAJ' || v === 'WIN' || v === 'HIGH') return 'verdict-play'
  if (v === 'CEKAJ' || v === 'MEDIUM' || v === 'VOID') return 'verdict-wait'
  return 'verdict-skip'
}
function pickLabel(pick) {
  if (!pick?.market || pick?.status === 'NO_QUALIFIED_BET') return 'NO QUALIFIED BET'
  const line = pick.line !== null && pick.line !== undefined ? ` ${pick.line}` : ''
  return `${pick.market} · ${pick.selection || ''}${line}`
}
function isFresh(iso, seconds=120) {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() <= seconds * 1000
}
function providerName(bundle) {
  return bundle?.provider || bundle?.fixture?._public_source?.source || 'AIScore engine'
}

function Header() {
  return <header className="lite-header">
    <div className="brand">
      <div className="logo"><Activity size={23}/></div>
      <div>
        <div className="brand-title">AI <span>Score</span> <em>PRO</em></div>
        <div className="brand-sub">Prematch · Live · Value · History</div>
      </div>
    </div>
    <div className="engine-pill"><ShieldCheck size={14}/> DATA FIRST</div>
  </header>
}
function Loading({ text }) {
  return <div className="lite-empty"><RefreshCw className="spin" size={18}/><span>{text}</span></div>
}
function ErrorBox({ error }) {
  if (!error) return null
  return <div className="lite-error"><strong>DATA UNAVAILABLE</strong><span>{String(error)}</span></div>
}
function StatusPill({ value }) {
  return <span className={`mini-status ${verdictClass(value)}`}>{value || '—'}</span>
}
function PickSummary({ result }) {
  if (!result?.analysis) return <div className="mini-status neutral">CEKA ANALIZU</div>
  const pick = result.picks?.find((p) => p.status === 'QUALIFIED')
  return <div className="pick-summary">
    <StatusPill value={result.analysis.verdict}/>
    <strong>{pickLabel(pick)}</strong>
    {pick
      ? <small>AI {fmtPct(pick.aiProbability)} · Edge {fmtPP(pick.edgePP)}</small>
      : <small>{result.analysis.data_quality} DATA</small>}
  </div>
}

function PickCard({ pick, title }) {
  const qualified = pick?.status === 'QUALIFIED'
  return <article className={`pro-pick ${qualified ? 'qualified' : 'empty'}`}>
    <div className="pro-pick-head"><b>{title}</b><StatusPill value={qualified ? pick.confidence : 'PRESKOCI'}/></div>
    <h3>{pickLabel(pick)}</h3>
    <div className="metric-grid">
      <div><small>ODDS</small><b>{fmtNum(pick?.odds)}</b></div>
      <div><small>AI %</small><b>{fmtPct(pick?.aiProbability)}</b></div>
      <div><small>IMPLIED</small><b>{fmtPct(pick?.impliedProbability)}</b></div>
      <div><small>EDGE</small><b>{fmtPP(pick?.edgePP)}</b></div>
      <div><small>EV</small><b>{fmtEv(pick?.evPct)}</b></div>
      <div><small>FAIR ODDS</small><b>{fmtNum(pick?.fairOdds)}</b></div>
      <div><small>STAKE</small><b>{Number.isFinite(Number(pick?.stakeUnits)) ? `${pick.stakeUnits}u` : '0u'}</b></div>
      <div><small>BOOKMAKER</small><b>{pick?.bookmaker || '—'}</b></div>
    </div>
    <div className="reason-box"><small>WHY</small><p>{pick?.why || 'Nijedna opcija nije prosla kriterijume.'}</p></div>
    {pick?.mainRisk && <div className="reason-box risk"><small>MAIN RISK</small><p>{pick.mainRisk}</p></div>}
  </article>
}

function TodayScreen({ fixtures, analyses, loading, analyzing, progress, error, onRefresh, onOpen, filter, setFilter }) {
  const rows = useMemo(() => fixtures.map((fixture) => ({ fixture, result: analyses[fixture.fixture?.id]?.result || null })), [fixtures, analyses])
  const filtered = rows.filter(({ fixture, result }) => {
    if (filter === 'ALL') return true
    if (filter === 'IGRAJ' || filter === 'PRESKOCI') return result?.analysis?.verdict === filter
    if (filter === 'HIGH CONFIDENCE') return result?.analysis?.confidence === 'HIGH'
    if (filter === 'VALUE') return result?.picks?.some(p => p.status === 'QUALIFIED' && Number(p.edgePP) > 0 && Number(p.evPct) > 0)
    if (filter === 'UPCOMING') return fixture?.fixture?.status?.short === 'NS'
    return true
  })
  const qualified = rows.flatMap(x => x.result?.picks || []).filter(p => p.status === 'QUALIFIED')
    .sort((a,b) => (Number(b.edgePP)||0) - (Number(a.edgePP)||0)).slice(0,5)

  return <>
    <section className="lite-hero">
      <div><small>TODAY'S PICKS</small><h1>{fixtures.length ? `${fixtures.length} meceva` : 'Ucitavam danasnje meceve'}</h1>
        <p>Svaki mec prolazi kroz kvalitet podataka, deterministic probability model i proveru cene. Ako nema dovoljnog edge-a ili podataka: PRESKOCI.</p></div>
      <button className="round-refresh" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? 'spin' : ''}/></button>
      {analyzing && <div className="lite-progress"><span style={{width:`${progress.total ? (progress.done/progress.total)*100 : 0}%`}}/></div>}
    </section>
    <ErrorBox error={error}/>
    {!!qualified.length && <section className="daily-best">
      <div className="lite-section-title"><Trophy size={18}/><span>Najzanimljivije value opcije</span></div>
      {qualified.map((p,i)=><div className="cheat-row" key={p.signalKey+i}><b>#{i+1}</b><span>{pickLabel(p)}</span><span>{fmtNum(p.odds)}</span><span>{fmtPP(p.edgePP)}</span></div>)}
    </section>}
    <div className="lite-filters">{TODAY_FILTERS.map((x)=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{x}</button>)}</div>
    <section className="lite-list">
      <div className="lite-section-title"><Target size={18}/><span>Danas</span></div>
      {loading && !fixtures.length ? <Loading text="Ucitavam raspored..."/> : filtered.map(({fixture,result}) => (
        <button className="lite-match" key={fixture.fixture?.id} onClick={()=>onOpen(fixture)}>
          <div className="lite-time"><strong>{new Date(fixture.fixture?.date).toLocaleTimeString('sr-RS',{hour:'2-digit',minute:'2-digit'})}</strong><small>{fixture.league?.name}</small></div>
          <div className="lite-teams"><span>{fixture.teams?.home?.name}</span><span>{fixture.teams?.away?.name}</span></div>
          <PickSummary result={result}/><ChevronRight size={18}/>
        </button>
      ))}
      {!loading && !filtered.length && <div className="lite-empty">Nema meceva u ovom filteru.</div>}
    </section>
    <section className="cheat-sheet">
      <div className="lite-section-title"><BarChart3 size={18}/><span>DAILY CHEAT SHEET</span></div>
      <div className="cheat-head"><span>MATCH</span><span>PICK</span><span>ODDS</span><span>AI</span><span>EDGE</span><span>STATUS</span></div>
      {rows.map(({fixture,result})=>{
        const p=result?.picks?.find(x=>x.status==='QUALIFIED')
        return <button key={fixture.fixture?.id} className="cheat-grid" onClick={()=>onOpen(fixture)}>
          <span>{fixture.teams?.home?.name} - {fixture.teams?.away?.name}</span><span>{pickLabel(p)}</span>
          <span>{fmtNum(p?.odds)}</span><span>{fmtPct(p?.aiProbability)}</span><span>{fmtPP(p?.edgePP)}</span><span>{result?.analysis?.verdict || '—'}</span>
        </button>
      })}
    </section>
  </>
}

function DetailScreen({ fixture, stored, loading, onBack, onAnalyze }) {
  const [tab,setTab]=useState('OVERVIEW')
  const result=stored?.result
  const bundle=stored?.bundle
  const verdict=result?.analysis?.verdict
  const picks=result?.picks || []
  const fresh=isFresh(result?.analysis?.data_last_updated, 900)
  return <section className="detail-lite">
    <button className="back-btn" onClick={onBack}><ChevronLeft/> Nazad</button>
    <div className="detail-lite-card">
      <small>{fixture.league?.name}</small><div className="detail-lite-teams"><strong>{fixture.teams?.home?.name}</strong><b>VS</b><strong>{fixture.teams?.away?.name}</strong></div>
      <span>{new Date(fixture.fixture?.date).toLocaleString('sr-RS')} · {fixture.fixture?.status?.short}</span>
    </div>
    {!result ? <button className="analyze-big" onClick={onAnalyze} disabled={loading}><Brain/>{loading?'ANALIZIRAM...':'ANALIZIRAJ MEC'}</button> : <>
      <div className={`big-verdict ${verdictClass(verdict)}`}><small>AISCORE VERDICT</small><strong>{verdict}</strong>
        <span>{result.analysis.data_quality} DATA · {result.analysis.data_quality_score}/100 · Confidence {result.analysis.confidence}</span>
      </div>
      <div className="freshness"><span>ANALYSIS GENERATED AT: {new Date(result.analysis.analysis_generated_at).toLocaleString('sr-RS')}</span>
        <span>DATA LAST UPDATED: {result.analysis.data_last_updated ? new Date(result.analysis.data_last_updated).toLocaleString('sr-RS') : '—'} {!fresh && ' · DATA DELAYED'}</span>
        <span>SOURCE: {providerName(bundle)}</span></div>
      <div className="top3"><PickCard title="#1 BEST BET" pick={picks[0]}/><PickCard title="#2 SECOND OPTION" pick={picks[1]}/><PickCard title="#3 THIRD OPTION" pick={picks[2]}/></div>
      <div className="detail-tabs">{DETAIL_TABS.map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div>
      <section className="tab-panel">
        {tab==='OVERVIEW' && <div className="compact-info">
          <div><span>Data quality</span><b>{result.analysis.data_quality} ({result.analysis.data_quality_score}/100)</b></div>
          <div><span>Lineup status</span><b>{result.lineupStatus || 'UNAVAILABLE'}</b></div>
          <div><span>Model</span><b>{result.model?.method || 'UNAVAILABLE'}</b></div>
          <div><span>Expected goals</span><b>{result.model ? `${fmtNum(result.model.lambdaHome)} - ${fmtNum(result.model.lambdaAway)}` : 'UNAVAILABLE'}</b></div>
        </div>}
        {tab==='FORM' && <div className="compact-info"><div><span>Home recent</span><b>{result.homeRecent?.sampleSize||0} · GF {fmtNum(result.homeRecent?.gfAvg)} · GA {fmtNum(result.homeRecent?.gaAvg)}</b></div><div><span>Away recent</span><b>{result.awayRecent?.sampleSize||0} · GF {fmtNum(result.awayRecent?.gfAvg)} · GA {fmtNum(result.awayRecent?.gaAvg)}</b></div></div>}
        {tab==='STATS' && <pre>{JSON.stringify({home:result.homeSeason,away:result.awaySeason,context:result.context},null,2)}</pre>}
        {tab==='XG' && <Unavailable available={bundle?.availability?.xg}/>}
        {tab==='GOALS' && <pre>{JSON.stringify({homeRecent:result.homeRecent,awayRecent:result.awayRecent,model:result.model},null,2)}</pre>}
        {tab==='SHOTS' && <Unavailable available={bundle?.availability?.shots}/>}
        {tab==='CORNERS' && <Unavailable available={bundle?.availability?.corners}/>}
        {tab==='CARDS' && <Unavailable available={bundle?.availability?.cards}/>}
        {tab==='LINEUPS' && <pre>{bundle?.lineups?.length ? JSON.stringify(bundle.lineups,null,2) : 'DATA UNAVAILABLE'}</pre>}
        {tab==='PLAYERS' && <Unavailable available={bundle?.availability?.players}/>}
        {tab==='H2H' && <pre>{bundle?.h2h?.length ? JSON.stringify(bundle.h2h.slice(0,10),null,2) : 'DATA UNAVAILABLE'}</pre>}
        {tab==='ODDS' && <pre>{bundle?.odds?.length ? JSON.stringify(bundle.odds,null,2) : 'DATA UNAVAILABLE'}</pre>}
        {tab==='AI ANALYSIS' && <pre>{JSON.stringify(result.analysis.source_snapshot,null,2)}</pre>}
      </section>
    </>}
  </section>
}
function Unavailable({available}) { return <div className="lite-empty">{available ? 'Podatak postoji u provideru, ali nije normalizovan za ovaj prikaz.' : 'DATA UNAVAILABLE'}</div> }

function LiveScreen() {
  const [matches,setMatches]=useState([]), [error,setError]=useState(''), [loading,setLoading]=useState(false)
  const [signals,setSignals]=useState({})
  async function refresh(){
    setLoading(true); setError('')
    try {
      const data=await getLiveFixtures(); setMatches(data.data||[])
      for (const fixture of (data.data||[]).slice(0,20)) {
        try {
          const live=await getLiveBundle(fixture.fixture?.id)
          const prematch=await getPrematchBundle(fixture.fixture?.id, fixture.league?.id, localDateKey()).catch(()=>null)
          const base=prematch ? buildPrematchAnalysis(prematch,SETTINGS) : null
          const res=buildLiveAnalysis(live,base,SETTINGS)
          await saveAnalysis(res.analysis,res.picks).catch(()=>null)
          setSignals(prev=>({...prev,[fixture.fixture?.id]:res}))
        } catch {}
      }
    } catch(e){setError(e.message||'LIVE DATA UNAVAILABLE')}
    finally{setLoading(false)}
  }
  useEffect(()=>{refresh(); const id=setInterval(refresh,60000); return()=>clearInterval(id)},[])
  return <section className="lite-page"><div className="lite-page-head"><div><small>LIVE ANALYSIS</small><h2>Live signali</h2><p>Goal/red-card/state promene prave novi state hash; zastareli signal se ne koristi kao novi.</p></div><button className="round-refresh" onClick={refresh}><RefreshCw className={loading?'spin':''}/></button></div>
    <ErrorBox error={error}/>{loading&&!matches.length&&<Loading text="Ucitavam LIVE meceve..."/>}
    {matches.map(m=>{const s=signals[m.fixture?.id]; const p=s?.picks?.[0]; return <div className="live-card" key={m.fixture?.id}>
      <div><strong>{m.teams?.home?.name} - {m.teams?.away?.name}</strong><small>{m.fixture?.status?.elapsed || '—'}' · {m.goals?.home ?? 0}:{m.goals?.away ?? 0}</small></div>
      <StatusPill value={s?.analysis?.verdict || 'CEKAJ'}/><b>{pickLabel(p)}</b>
      <span>Odds {fmtNum(p?.odds)} · AI {fmtPct(p?.aiProbability)} · Edge {fmtPP(p?.edgePP)}</span>
      <small>{s?.whyNow || 'Cekam dovoljno live podataka.'}</small>
    </div>})}
    {!loading&&!matches.length&&!error&&<div className="lite-empty">Nema dostupnih LIVE meceva.</div>}
  </section>
}

function HistoryScreen({history,loading,error,onRefresh}) {
  return <section className="lite-page"><div className="lite-page-head"><div><small>PICKS HISTORY</small><h2>Istorija</h2><p>Originalna kvota i signal ostaju sacuvani; rezultat se dopisuje kao WIN/LOSS/VOID.</p></div><button className="round-refresh" onClick={onRefresh}><RefreshCw className={loading?'spin':''}/></button></div>
    <ErrorBox error={error}/>
    {history.map(a=><div className="history-lite" key={a.id}><div><strong>{a.home_team_name} - {a.away_team_name}</strong><small>{a.mode?.toUpperCase()} · {new Date(a.analysis_generated_at).toLocaleString('sr-RS')}</small></div><StatusPill value={a.verdict}/>
      {(a.aiscore_analysis_picks||[]).map(p=><p key={p.id}>{p.pick_rank}. {p.market} · {p.selection}{p.line!=null?` ${p.line}`:''} · {p.odds||'—'} · {p.result||'OPEN'} · CLV {p.clv_pct!=null?`${Number(p.clv_pct).toFixed(1)}%`:'—'}</p>)}</div>)}
    {!loading&&!history.length&&<div className="lite-empty">Istorija je prazna.</div>}
  </section>
}

function AnalyticsScreen() {
  const [data,setData]=useState(null),[days,setDays]=useState(30),[error,setError]=useState('')
  useEffect(()=>{getAnalytics({days}).then(setData).catch(e=>setError(e.message))},[days])
  return <section className="lite-page"><div className="lite-page-head"><div><small>PERFORMANCE</small><h2>Analytics</h2><p>ROI, units, edge, EV i CLV se racunaju samo iz sacuvanih stvarnih signala.</p></div></div><ErrorBox error={error}/>
    <div className="lite-filters">{[7,30,90,0].map(x=><button key={x} className={days===x?'active':''} onClick={()=>setDays(x)}>{x?x+' DAYS':'ALL TIME'}</button>)}</div>
    {data&&<><div className="analytics-grid">
      <div><small>Total Picks</small><b>{data.total_picks}</b></div><div><small>Wins</small><b>{data.wins}</b></div><div><small>Losses</small><b>{data.losses}</b></div><div><small>Voids</small><b>{data.voids}</b></div>
      <div><small>Win Rate</small><b>{fmtPct(data.win_rate)}</b></div><div><small>Avg Odds</small><b>{fmtNum(data.average_odds)}</b></div><div><small>Avg Edge</small><b>{fmtPP(data.average_edge_pp)}</b></div><div><small>Avg EV</small><b>{fmtEv(data.average_ev_pct)}</b></div>
      <div><small>ROI</small><b>{fmtPct(data.roi)}</b></div><div><small>Units</small><b>{fmtNum(data.units)}</b></div><div><small>Avg CLV</small><b>{data.average_clv_pct==null?'—':`${Number(data.average_clv_pct).toFixed(1)}%`}</b></div>
    </div><pre>{JSON.stringify({by_market:data.by_market,by_confidence:data.by_confidence,by_league:data.by_league},null,2)}</pre></>}
  </section>
}

export default function App() {
  const [view,setView]=useState('DANAS'),[fixtures,setFixtures]=useState([]),[analyses,setAnalyses]=useState({})
  const [selected,setSelected]=useState(null),[loadingToday,setLoadingToday]=useState(false),[analyzing,setAnalyzing]=useState(false)
  const [todayError,setTodayError]=useState(''),[history,setHistory]=useState([]),[historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState('')
  const [progress,setProgress]=useState({done:0,total:0}),[filter,setFilter]=useState('ALL')
  const autoRan=useRef(false)
  useEffect(()=>{loadToday()},[])
  useEffect(()=>{if(view==='ISTORIJA')refreshHistory()},[view])
  useEffect(()=>{if(!fixtures.length||autoRan.current||analyzing)return; autoRan.current=true; analyzeAvailable(fixtures)},[fixtures])

  async function loadToday(){
    if(loadingToday)return
    setLoadingToday(true);setTodayError('')
    try{const data=await getToday(localDateKey());setFixtures(data.data||[]);autoRan.current=false}
    catch(e){setTodayError(e.message||'Ne mogu da ucitam raspored.')}
    finally{setLoadingToday(false)}
  }
  async function analyzePrematch(fixture){
    const id=fixture?.fixture?.id
    const league=fixture?.provider_meta?.league_slug||fixture?.league?.code||fixture?.league?.id
    if(!id)return null
    const bundle=await getPrematchBundle(id,league,localDateKey())
    const result=buildPrematchAnalysis(bundle,SETTINGS)
    await saveAnalysis(result.analysis,result.picks).catch(()=>null)
    const stored={bundle,result};setAnalyses(prev=>({...prev,[id]:stored}));return stored
  }
  async function analyzeAvailable(source=fixtures){
    if(!source.length||analyzing)return
    setAnalyzing(true);setProgress({done:0,total:source.length})
    for(let i=0;i<source.length;i++){
      const fixture=source[i]
      if(!analyses[fixture.fixture?.id]){try{await analyzePrematch(fixture)}catch{}}
      setProgress({done:i+1,total:source.length})
    }
    setAnalyzing(false)
  }
  async function openMatch(fixture){setSelected(fixture);const id=fixture.fixture?.id;if(!analyses[id]){setAnalyzing(true);try{await analyzePrematch(fixture)}catch(e){setTodayError(e.message)}finally{setAnalyzing(false)}}}
  async function refreshHistory(){setHistoryLoading(true);setHistoryError('');try{await settleHistory().catch(()=>null);const data=await getHistory(200);setHistory(data.data||[])}catch(e){setHistoryError(e.message)}finally{setHistoryLoading(false)}}
  const selectedStored=selected?analyses[selected.fixture?.id]:null

  return <div className="app-shell lite-shell"><Header/><main>
    {selected ? <DetailScreen fixture={selected} stored={selectedStored} loading={analyzing} onBack={()=>setSelected(null)} onAnalyze={()=>analyzePrematch(selected)}/> : <>
      {view==='DANAS'&&<TodayScreen fixtures={fixtures} analyses={analyses} loading={loadingToday} analyzing={analyzing} progress={progress} error={todayError} onRefresh={loadToday} onOpen={openMatch} filter={filter} setFilter={setFilter}/>}
      {view==='LIVE'&&<LiveScreen/>}
      {view==='ISTORIJA'&&<HistoryScreen history={history} loading={historyLoading} error={historyError} onRefresh={refreshHistory}/>}
      {view==='ANALITIKA'&&<AnalyticsScreen/>}
    </>}
  </main>
  {!selected&&<nav className="bottom-nav lite-nav pro-tabs">{[['DANAS',Home],['LIVE',Radio],['ISTORIJA',Clock3],['ANALITIKA',BarChart3]].map(([name,Icon])=><button key={name} className={view===name?'active':''} onClick={()=>setView(name)}><Icon/><span>{name}</span></button>)}</nav>}
  </div>
}
