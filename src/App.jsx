import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, Brain, ChevronLeft, ChevronRight, CircleUserRound,
  Clock3, Flame, Home, Radio, RefreshCw, ShieldCheck, Sparkles, Target,
  TrendingUp, Trophy, Zap
} from 'lucide-react'
import {
  buildPrematchAnalysis, buildLiveAnalysis
} from './analysisService'
import {
  getToday, getPrematchBundle, getLiveBundle, saveAnalysis,
  getHistory, getAnalytics, getOddsHistory, settleHistory
} from './dataClient'

const DEFAULT_SETTINGS = { minOdds: 1.2, minEdgePP: 3, minEvPct: 2 }
const FILTERS = ['ALL','IGRAJ','PRESKOCI','HIGH CONFIDENCE','VALUE','LIVE','UPCOMING']
const DETAIL_TABS = ['OVERVIEW','FORM','STATS','XG','GOALS','SHOTS','CORNERS','CARDS','LINEUPS','PLAYERS','H2H','ODDS','AI ANALYSIS']

function fmtPct(value, digits = 1) {
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
function fixtureStatus(f) {
  return f?.fixture?.status?.short || '-'
}
function isLiveStatus(s) {
  return ['1H','HT','2H','ET','BT','P','INT','LIVE'].includes(s)
}
function isFinishedStatus(s) {
  return ['FT','AET','PEN','CANC','PST','ABD','AWD','WO'].includes(s)
}
function staleLabel(timestamp, mode = 'prematch') {
  if (!timestamp) return 'DATA UNAVAILABLE'
  const age = Date.now() - new Date(timestamp).getTime()
  const threshold = mode === 'live' ? 90_000 : 30 * 60_000
  return age > threshold ? 'DATA DELAYED' : 'FRESH'
}
function badgeClass(value) {
  if (value === 'IGRAJ' || value === 'HIGH' || value === 'WIN') return 'good-badge'
  if (value === 'CEKAJ' || value === 'MEDIUM' || value === 'VOID') return 'wait-badge'
  return 'bad-badge'
}
function initials(name = '') {
  return name.split(' ').filter(Boolean).map((x) => x[0]).join('').slice(0,3).toUpperCase() || '?'
}
function pickLabel(pick) {
  if (pick?.status === 'NO_QUALIFIED_BET') return 'NO QUALIFIED BET'
  if (!pick?.market) return 'NO QUALIFIED BET'
  const line = pick.line !== null && pick.line !== undefined && !String(pick.selection).includes(String(pick.line)) ? ` ${pick.line}` : ''
  return `${pick.market} · ${pick.selection || ''}${line}`
}
function analysisKey(result) {
  return result?.analysis?.fixture_id
}

function Header() {
  return <header>
    <div className="brand">
      <div className="logo"><Activity size={24}/></div>
      <div><div className="brand-title">AI <span>Score</span></div><div className="brand-sub">PROFESSIONAL FOOTBALL ANALYSIS</div></div>
    </div>
    <div className="engine-pill"><ShieldCheck size={15}/> VALUE ENGINE</div>
  </header>
}

function LoadingBlock({ text = 'Analiziram podatke...' }) {
  return <div className="empty loading-block"><RefreshCw className="spin" size={18}/>{text}</div>
}

function ErrorBlock({ error }) {
  if (!error) return null
  return <div className="api-error"><strong>DATA UNAVAILABLE</strong><span>{String(error)}</span></div>
}

function PickCard({ pick, title }) {
  const qualified = pick?.status === 'QUALIFIED'
  return <div className={`pick-card ${qualified ? 'qualified' : ''}`}>
    <div className="pick-head">
      <strong>{title}</strong>
      <span className={badgeClass(qualified ? pick.confidence : 'LOW')}>{qualified ? pick.confidence : 'LOW'}</span>
    </div>
    {qualified || pick?.status === 'CEKAJ' ? <>
      <h3>{pickLabel(pick)}</h3>
      <div className="pick-metrics">
        <div><small>ODDS</small><b>{fmtNum(pick.odds)}</b></div>
        <div><small>AI %</small><b>{fmtPct(pick.aiProbability)}</b></div>
        <div><small>IMPLIED</small><b>{fmtPct(pick.impliedProbability)}</b></div>
        <div><small>FAIR ODDS</small><b>{fmtNum(pick.fairOdds)}</b></div>
        <div><small>EDGE</small><b>{Number.isFinite(Number(pick.edgePP)) ? `${pick.edgePP >= 0 ? '+' : ''}${Number(pick.edgePP).toFixed(1)} pp` : '—'}</b></div>
        <div><small>EV</small><b>{Number.isFinite(Number(pick.evPct)) ? `${pick.evPct >= 0 ? '+' : ''}${Number(pick.evPct).toFixed(1)}%` : '—'}</b></div>
      </div>
      <div className="explain-row"><small>WHY</small><p>{pick.why || '—'}</p></div>
      <div className="explain-row risk"><small>MAIN RISK</small><p>{pick.mainRisk || '—'}</p></div>
      <div className="stake-line">Stake suggestion: <strong>{pick.stakeUnits ?? 0}u</strong></div>
    </> : <div className="no-bet-slot"><strong>NO QUALIFIED BET</strong><span>{pick?.why || 'Nema dovoljno kvalitetnog value-a.'}</span></div>}
  </div>
}

function VerdictBox({ result }) {
  const a = result?.analysis
  if (!a) return null
  return <section className="verdict-box">
    <div>
      <small>AISCORE VERDICT</small>
      <strong className={badgeClass(a.verdict)}>{a.verdict}</strong>
    </div>
    <div><small>DATA QUALITY</small><b>{a.data_quality}</b><span>{Math.round(Number(a.data_quality_score || 0))}/100</span></div>
    <div><small>CONFIDENCE</small><b>{a.confidence}</b></div>
    <div><small>DATA</small><b>{staleLabel(a.data_last_updated, a.mode)}</b></div>
  </section>
}

function TodayScreen({ fixtures, analyses, loading, analyzing, progress, filter, setFilter, error, onLoad, onAnalyzeAll, onOpen, onCheat }) {
  const analyzedRows = useMemo(() => fixtures.map((fixture) => ({
    fixture,
    result: analyses[fixture.fixture?.id]?.result || null,
  })), [fixtures, analyses])

  const filtered = analyzedRows.filter(({ fixture, result }) => {
    const status = fixtureStatus(fixture)
    if (filter === 'ALL') return true
    if (filter === 'LIVE') return isLiveStatus(status)
    if (filter === 'UPCOMING') return ['NS','TBD'].includes(status)
    if (!result) return false
    if (filter === 'IGRAJ') return result.analysis.verdict === 'IGRAJ'
    if (filter === 'PRESKOCI') return result.analysis.verdict === 'PRESKOCI'
    if (filter === 'HIGH CONFIDENCE') return result.analysis.confidence === 'HIGH'
    if (filter === 'VALUE') return result.picks.some((p) => p.status === 'QUALIFIED' && Number(p.edgePP) >= 3)
    return true
  })

  const topPicks = Object.values(analyses)
    .map((x) => x.result)
    .flatMap((r) => r?.picks?.filter((p) => p.status === 'QUALIFIED').map((p) => ({ p, a: r.analysis })) || [])
    .sort((x,y) => (Number(y.p.edgePP) + Number(y.p.evPct)/3) - (Number(x.p.edgePP) + Number(x.p.evPct)/3))
    .slice(0,3)

  return <>
    <section className="hero-card premium">
      <div className="hero-kicker"><span><Sparkles size={14}/> TODAY'S PICKS</span><span className="confidence-pill"><ShieldCheck size={14}/> VALUE FIRST</span></div>
      <div className="section-title"><Trophy size={20}/> Današnja analiza</div>
      <p className="hero-copy">AIScore ne traži tip po svaku cenu. Bez dovoljno podataka ili value-a rezultat je PRESKOCI.</p>
      <div className="hero-actions">
        <button className="hero-cta compact" onClick={onAnalyzeAll} disabled={analyzing || !fixtures.length}><Brain size={19}/>{analyzing ? `ANALIZIRAM ${progress.done}/${progress.total}` : 'ANALIZIRAJ DANAS'}</button>
        <button className="secondary-btn" onClick={onLoad} disabled={loading}><RefreshCw size={16}/>{loading ? 'UCITAVAM' : 'OSVEZI MEC'}</button>
      </div>
      {analyzing && <div className="progress-track"><div style={{ width: `${progress.total ? (progress.done/progress.total)*100 : 0}%` }}/></div>}
    </section>

    <ErrorBlock error={error}/>

    {topPicks.length > 0 && <section className="top-day">
      <div className="list-heading"><span><Flame size={18}/> Statistički najzanimljivije</span><button className="text-btn" onClick={onCheat}>CHEAT SHEET</button></div>
      {topPicks.map(({ p,a }, i) => <div className="day-pick-mini" key={`${a.fixture_id}-${p.signalKey || p.signal_key}-${i}`}>
        <span>#{i+1}</span><div><strong>{a.home_team_name} - {a.away_team_name}</strong><small>{pickLabel(p)}</small></div>
        <div><b>{fmtNum(p.odds)}</b><small>{Number(p.edgePP).toFixed(1)} pp edge</small></div>
      </div>)}
    </section>}

    <div className="filter-strip">{FILTERS.map((x) => <button key={x} className={filter === x ? 'active' : ''} onClick={() => setFilter(x)}>{x}</button>)}</div>

    <section className="today-list">
      <div className="list-heading"><span><Target size={18}/> Današnje utakmice</span><span className="muted">{fixtures.length} mečeva</span></div>
      {loading && !fixtures.length ? <LoadingBlock text="Učitavam današnje utakmice..."/> : filtered.map(({ fixture, result }) => {
        const id = fixture.fixture?.id
        const status = fixtureStatus(fixture)
        return <button className="match-row" key={id} onClick={() => onOpen(fixture)}>
          <div className="match-time"><strong>{new Date(fixture.fixture?.date).toLocaleTimeString('sr-RS',{hour:'2-digit',minute:'2-digit'})}</strong><small>{status}</small></div>
          <div className="match-names"><strong>{fixture.teams?.home?.name}</strong><span>vs</span><strong>{fixture.teams?.away?.name}</strong><small>{fixture.league?.name}</small></div>
          <div className="match-verdict">{result ? <><span className={badgeClass(result.analysis.verdict)}>{result.analysis.verdict}</span><small>{result.analysis.data_quality} DATA</small></> : <><span className="neutral-badge">NIJE ANALIZIRANO</span><small>otvori meč</small></>}</div>
          <ChevronRight size={17}/>
        </button>
      })}
    </section>
  </>
}

function CheatSheet({ analyses, onOpenById }) {
  const rows = Object.values(analyses).flatMap(({ result }) => {
    const a = result?.analysis
    if (!a) return []
    const qualified = result.picks.filter((p) => p.status === 'QUALIFIED')
    if (!qualified.length) return [{ a, p: null }]
    return qualified.map((p) => ({ a, p }))
  })
  return <section className="page-panel wide-panel">
    <h2><BarChart3/> DAILY CHEAT SHEET</h2>
    <p className="muted">Samo trenutno analizirani mečevi. Kvota i timestamp ostaju vezani za trenutak analize.</p>
    <div className="cheat-table-wrap"><table className="cheat-table"><thead><tr>
      <th>MATCH</th><th>MARKET</th><th>PICK</th><th>ODDS</th><th>AI %</th><th>IMPLIED</th><th>EDGE</th><th>EV</th><th>CONF.</th><th>STATUS</th>
    </tr></thead><tbody>{rows.map(({a,p},i) => <tr key={`${a.fixture_id}-${i}`} onClick={() => onOpenById(a.fixture_id)}>
      <td>{a.home_team_name} - {a.away_team_name}</td>
      <td>{p?.market || '—'}</td><td>{p?.selection || 'NO QUALIFIED BET'}</td><td>{fmtNum(p?.odds)}</td>
      <td>{fmtPct(p?.aiProbability)}</td><td>{fmtPct(p?.impliedProbability)}</td>
      <td>{Number.isFinite(Number(p?.edgePP)) ? `${Number(p.edgePP).toFixed(1)} pp` : '—'}</td>
      <td>{Number.isFinite(Number(p?.evPct)) ? `${Number(p.evPct).toFixed(1)}%` : '—'}</td>
      <td>{p?.confidence || 'LOW'}</td><td><span className={badgeClass(a.verdict)}>{a.verdict}</span></td>
    </tr>)}</tbody></table></div>
    {!rows.length && <div className="empty">Prvo pokreni današnju analizu.</div>}
  </section>
}

function MatchDetail({ fixture, stored, mode = 'prematch', onBack, onAnalyze, analyzing }) {
  const [tab, setTab] = useState('OVERVIEW')
  const result = stored?.result
  const bundle = stored?.bundle
  const a = result?.analysis
  const picks = result?.picks || []
  const oddsHistory = stored?.oddsHistory || []
  const home = fixture?.teams?.home
  const away = fixture?.teams?.away

  const renderTab = () => {
    if (!bundle) return <div className="empty">Pokreni analizu da bi se učitali detaljni podaci.</div>
    if (tab === 'OVERVIEW') return <div className="detail-copy">
      <p><strong>Competition:</strong> {fixture.league?.name}</p>
      <p><strong>Date:</strong> {new Date(fixture.fixture?.date).toLocaleString('sr-RS')}</p>
      <p><strong>Status:</strong> {fixture.fixture?.status?.long || fixtureStatus(fixture)}</p>
      <p><strong>Table context:</strong> {result?.context?.home_rank ? `${home?.name} #${result.context.home_rank}` : '—'} · {result?.context?.away_rank ? `${away?.name} #${result.context.away_rank}` : '—'}</p>
      <p><strong>Rest:</strong> {Number.isFinite(result?.context?.home_days_rest) ? `${result.context.home_days_rest.toFixed(1)}d` : '—'} / {Number.isFinite(result?.context?.away_days_rest) ? `${result.context.away_days_rest.toFixed(1)}d` : '—'}</p>
      <p><strong>Referee:</strong> {result?.context?.referee || 'DATA UNAVAILABLE'} {result?.context?.referee ? '(referee averages unavailable)' : ''}</p>
      <p><strong>Analysis generated at:</strong> {a ? new Date(a.analysis_generated_at).toLocaleString('sr-RS') : '—'}</p>
      <p><strong>Data last updated:</strong> {a?.data_last_updated ? new Date(a.data_last_updated).toLocaleString('sr-RS') : 'DATA UNAVAILABLE'}</p>
    </div>
    if (tab === 'FORM') return <div className="two-col-detail">
      <FormBlock name={home?.name} summary={result?.homeRecent}/><FormBlock name={away?.name} summary={result?.awayRecent}/>
    </div>
    if (tab === 'STATS') return <div className="two-col-detail">
      <SeasonBlock name={home?.name} stats={result?.homeSeason}/><SeasonBlock name={away?.name} stats={result?.awaySeason}/>
    </div>
    if (tab === 'XG') return <Unavailable text="Current API integration does not provide verified xG/xGA. AIScore does not invent xG."/>
    if (tab === 'GOALS') return <div className="two-col-detail"><GoalBlock name={home?.name} recent={result?.homeRecent}/><GoalBlock name={away?.name} recent={result?.awayRecent}/></div>
    if (tab === 'SHOTS') return <Unavailable text={mode === 'live' && bundle.stats ? 'LIVE shots are included in current match statistics.' : 'Reliable aggregated prematch shots/SOT are not available in the current efficient API bundle.'}/>
    if (tab === 'CORNERS') return <Unavailable text={mode === 'live' ? 'LIVE corners are available when fixture statistics provide them.' : 'Prematch corner trend aggregation is unavailable without extra per-fixture calls.'}/>
    if (tab === 'CARDS') return <Unavailable text={mode === 'live' ? 'LIVE cards are included when fixture statistics provide them.' : 'Referee/card historical aggregates are not available in the current provider bundle.'}/>
    if (tab === 'LINEUPS') return <LineupsBlock lineups={bundle.lineups || []}/>
    if (tab === 'PLAYERS') return <PlayersBlock lineups={bundle.lineups || []}/>
    if (tab === 'H2H') return <H2HBlock fixtures={bundle.h2h || []}/>
    if (tab === 'ODDS') return <OddsBlock odds={bundle.odds || []} history={oddsHistory}/>
    if (tab === 'AI ANALYSIS') return <div className="detail-copy">
      <p><strong>Method:</strong> deterministic weighted recent/season goal model + Poisson probabilities.</p>
      <p><strong>Home expected goals:</strong> {fmtNum(result?.model?.lambdaHome)}</p>
      <p><strong>Away expected goals:</strong> {fmtNum(result?.model?.lambdaAway)}</p>
      <p><strong>Model total:</strong> {result?.model ? fmtNum(result.model.lambdaHome + result.model.lambdaAway) : 'DATA UNAVAILABLE'}</p>
      <p><strong>Lineup status:</strong> {result?.lineupStatus || 'UNCONFIRMED'}</p>
      <p className="muted">Tactical narratives, weather and referee tendencies are not fabricated when a verified structured source is unavailable.</p>
    </div>
    return null
  }

  return <section className="detail-view">
    <button className="back-btn" onClick={onBack}><ChevronLeft/> Nazad</button>
    <div className="match-stage">
      <div className="detail-meta"><span>{fixture.league?.name}</span><span>{fixtureStatus(fixture)}</span></div>
      <div className="detail-teams">
        <div className="detail-team"><div className="club big">{initials(home?.name)}</div><strong>{home?.name}</strong></div>
        <div className="detail-score"><b>{isLiveStatus(fixtureStatus(fixture)) ? `${fixture.goals?.home ?? 0} : ${fixture.goals?.away ?? 0}` : 'VS'}</b><span>{fixture.fixture?.status?.elapsed ? `${fixture.fixture.status.elapsed}'` : new Date(fixture.fixture?.date).toLocaleTimeString('sr-RS',{hour:'2-digit',minute:'2-digit'})}</span></div>
        <div className="detail-team"><div className="club orange big">{initials(away?.name)}</div><strong>{away?.name}</strong></div>
      </div>
    </div>

    {!result ? <button className="hero-cta" disabled={analyzing} onClick={() => onAnalyze(fixture)}><Brain size={19}/>{analyzing ? 'ANALIZIRAM...' : mode === 'live' ? 'POKRENI LIVE ANALIZU' : 'POKRENI PREMATCH ANALIZU'}</button> : <>
      <VerdictBox result={result}/>
      <div className="section-heading">TOP 3 ANALYSIS</div>
      {picks.slice(0,3).map((p,i) => <PickCard key={p.signalKey || p.signal_key || i} pick={p} title={i === 0 ? '#1 BEST BET' : i === 1 ? '#2 SECOND OPTION' : '#3 THIRD OPTION'}/>)}
    </>}

    <div className="detail-tabs">{DETAIL_TABS.map((x) => <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>{x}</button>)}</div>
    <div className="analysis-card detail-tab-content">{renderTab()}</div>
  </section>
}

function FormBlock({ name, summary }) {
  return <div className="metric-block"><strong>{name}</strong>
    <span>Sample: {summary?.sampleSize ?? 0}</span><span>GF avg: {fmtNum(summary?.gfAvg)}</span><span>GA avg: {fmtNum(summary?.gaAvg)}</span>
    <span>PPG: {fmtNum(summary?.pointsPerGame)}</span><span>BTTS: {fmtPct(summary?.bttsRate)}</span><span>Over 2.5: {fmtPct(summary?.over25Rate)}</span>
  </div>
}
function SeasonBlock({ name, stats }) {
  return <div className="metric-block"><strong>{name}</strong>
    <span>Home GF avg: {fmtNum(stats?.avgForHome)}</span><span>Away GF avg: {fmtNum(stats?.avgForAway)}</span>
    <span>Home GA avg: {fmtNum(stats?.avgAgainstHome)}</span><span>Away GA avg: {fmtNum(stats?.avgAgainstAway)}</span>
    <span>Form string: {stats?.form || 'DATA UNAVAILABLE'}</span>
  </div>
}
function GoalBlock({ name, recent }) {
  return <div className="metric-block"><strong>{name}</strong><span>GF avg: {fmtNum(recent?.gfAvg)}</span><span>GA avg: {fmtNum(recent?.gaAvg)}</span><span>Over 1.5: {fmtPct(recent?.over15Rate)}</span><span>Over 2.5: {fmtPct(recent?.over25Rate)}</span><span>Clean sheet: {fmtPct(recent?.cleanSheetRate)}</span><span>Failed to score: {fmtPct(recent?.failedToScoreRate)}</span></div>
}
function Unavailable({ text }) {
  return <div className="unavailable"><strong>DATA UNAVAILABLE</strong><p>{text}</p></div>
}
function LineupsBlock({ lineups }) {
  if (!lineups.length) return <Unavailable text="No confirmed lineup returned. AIScore will not display a projected lineup as confirmed."/>
  return <div>{lineups.map((x) => <div className="lineup-team" key={x.team?.id}><strong>CONFIRMED · {x.team?.name}</strong><div>{(x.startXI || []).map((p) => <span key={p.player?.id}>{p.player?.name}</span>)}</div></div>)}</div>
}
function PlayersBlock({ lineups }) {
  if (!lineups.length) return <Unavailable text="Player start probability is unavailable until a confirmed lineup exists. No player-prop confidence is generated."/>
  return <div>{lineups.map((x) => <div className="lineup-team" key={x.team?.id}><strong>{x.team?.name}</strong><small>Confirmed starters only</small><div>{(x.startXI || []).map((p) => <span key={p.player?.id}>{p.player?.name}</span>)}</div></div>)}</div>
}
function H2HBlock({ fixtures }) {
  if (!fixtures.length) return <Unavailable text="H2H unavailable."/>
  return <div>{fixtures.slice(0,10).map((f) => <div className="h2h-row" key={f.fixture?.id}><span>{new Date(f.fixture?.date).toLocaleDateString('sr-RS')}</span><strong>{f.teams?.home?.name} {f.goals?.home} : {f.goals?.away} {f.teams?.away?.name}</strong></div>)}</div>
}
function OddsBlock({ odds, history = [] }) {
  if (!odds.length) return <Unavailable text="Odds provider returned no supported current prices. Edge/EV are not fabricated."/>
  const movement = new Map(history.map((x) => [x.signal_key, x]))
  return <div>{odds.slice(0,30).map((o) => {
    const m = movement.get(o.signal_key)
    return <div className="odds-row odds-movement-row" key={o.signal_key}>
      <span>{o.market}</span><strong>{o.selection}{o.line !== null ? ` ${o.line}` : ''}</strong>
      <b>{fmtNum(o.odds)}</b><small>{o.bookmaker || 'bookmaker'}</small>
      <em>{m ? `Open ${fmtNum(m.opening_odds)} → Current ${fmtNum(m.current_odds)} · ${m.observations} obs.` : 'Opening snapshot unavailable'}</em>
    </div>
  })}</div>
}

function LiveScreen({ liveFixtures, liveLoading, liveError, onRefresh, onOpen }) {
  return <section className="page-panel">
    <div className="screen-head"><div><h2><Radio/> LIVE ANALYSIS</h2><p className="muted">Goal/red-card state changes create a new analysis identity.</p></div><button className="refresh-btn" onClick={onRefresh} disabled={liveLoading}><RefreshCw size={14}/>{liveLoading ? '...' : 'REFRESH'}</button></div>
    <ErrorBlock error={liveError}/>
    {liveLoading && !liveFixtures.length ? <LoadingBlock text="Učitavam LIVE mečeve..."/> : liveFixtures.map((f) => <button className="match-row" key={f.fixture?.id} onClick={() => onOpen(f)}>
      <div className="match-time"><strong>{f.fixture?.status?.elapsed ? `${f.fixture.status.elapsed}'` : fixtureStatus(f)}</strong><small>LIVE</small></div>
      <div className="match-names"><strong>{f.teams?.home?.name}</strong><span>{f.goals?.home ?? 0} : {f.goals?.away ?? 0}</span><strong>{f.teams?.away?.name}</strong><small>{f.league?.name}</small></div>
      <div className="match-verdict"><span className="neutral-badge">ANALIZIRAJ</span><small>current state</small></div><ChevronRight size={17}/>
    </button>)}
    {!liveLoading && !liveFixtures.length && !liveError && <div className="empty">Trenutno nema dostupnih LIVE utakmica.</div>}
  </section>
}

function SignalsScreen({ analyses, onOpenById }) {
  const rows = Object.values(analyses).flatMap(({ result }) => result?.picks?.filter((p) => p.status === 'QUALIFIED').map((p) => ({a:result.analysis,p})) || [])
    .sort((x,y) => Number(y.p.edgePP) - Number(x.p.edgePP))
  return <section className="page-panel"><h2><Flame/> VALUE SIGNALI</h2><p className="muted">Rangirano po value-u, ne po najmanjoj kvoti.</p>
    {rows.map(({a,p},i) => <button className="signal-value-row" key={`${a.fixture_id}-${i}`} onClick={() => onOpenById(a.fixture_id)}>
      <div><strong>{a.home_team_name} - {a.away_team_name}</strong><small>{pickLabel(p)}</small></div><div><b>{fmtNum(p.odds)}</b><span>AI {fmtPct(p.aiProbability)}</span><span>Edge {Number(p.edgePP).toFixed(1)} pp</span></div>
    </button>)}
    {!rows.length && <div className="empty">Nema kvalifikovanih value signala.</div>}
  </section>
}

function HistoryScreen({ history, loading, error, onRefresh, settling }) {
  return <section className="page-panel"><div className="screen-head"><div><h2><Clock3/> PICKS HISTORY</h2><p className="muted">Originalna kvota i analiza ostaju sačuvane.</p></div><button className="refresh-btn" onClick={onRefresh} disabled={loading || settling}><RefreshCw size={14}/>{settling ? 'SETTLE...' : 'REFRESH'}</button></div>
    <ErrorBlock error={error}/>
    {history.map((a) => <div className="history-analysis" key={a.id}>
      <div className="history-analysis-head"><div><strong>{a.home_team_name} - {a.away_team_name}</strong><small>{a.mode.toUpperCase()} · {new Date(a.analysis_generated_at).toLocaleString('sr-RS')}</small></div><span className={badgeClass(a.verdict)}>{a.verdict}</span></div>
      {(a.aiscore_analysis_picks || []).filter((p) => p.status === 'QUALIFIED').map((p) => {
        const review = p.aiscore_model_reviews?.[0]?.review
        return <div className="history-pick-wrap" key={p.id}>
          <div className="history-pick"><span>{p.market} · {p.selection}</span><b>{fmtNum(p.odds)}</b><strong className={badgeClass(p.result || 'PENDING')}>{p.result || 'PENDING'}</strong></div>
          {review?.notes?.length ? <div className="model-review"><small>MODEL REVIEW</small>{review.notes.map((n,i) => <span key={i}>{n}</span>)}</div> : null}
        </div>
      })}
    </div>)}
    {!loading && !history.length && <div className="empty">Istorija je prazna.</div>}
  </section>
}

function AnalyticsScreen({ analytics, loading, error, days, setDays, mode, setMode, marketFilter, setMarketFilter, confidenceFilter, setConfidenceFilter, leagueFilter, setLeagueFilter, onLoad, settings, setSettings }) {
  const cards = [
    ['Total Picks', analytics?.total_picks],['Wins', analytics?.wins],['Losses', analytics?.losses],['Voids', analytics?.voids],
    ['Win Rate', analytics?.win_rate !== null && analytics?.win_rate !== undefined ? fmtPct(analytics.win_rate) : '—'],
    ['Avg Odds', fmtNum(analytics?.average_odds)],['Avg Edge', analytics?.average_edge_pp != null ? `${Number(analytics.average_edge_pp).toFixed(1)} pp` : '—'],
    ['Avg EV', analytics?.average_ev_pct != null ? `${Number(analytics.average_ev_pct).toFixed(1)}%` : '—'],
    ['ROI', analytics?.roi != null ? fmtPct(analytics.roi) : '—'],['Units', analytics?.units != null ? Number(analytics.units).toFixed(2) : '—'],
    ['Avg CLV', analytics?.average_clv_pct != null ? `${Number(analytics.average_clv_pct).toFixed(1)}%` : '—'],
  ]
  return <section className="page-panel"><div className="screen-head"><div><h2><TrendingUp/> ANALYTICS</h2><p className="muted">Performance po stvarno sačuvanim i settlementovanim predlozima.</p></div><button className="refresh-btn" onClick={onLoad} disabled={loading}><RefreshCw size={14}/></button></div>
    <div className="analytics-filters">
      <select value={days} onChange={(e) => setDays(e.target.value)}><option value="7">7 DAYS</option><option value="30">30 DAYS</option><option value="90">90 DAYS</option><option value="">ALL TIME</option></select>
      <select value={mode} onChange={(e) => setMode(e.target.value)}><option value="">ALL MODES</option><option value="prematch">PREMATCH</option><option value="live">LIVE</option></select>
      <select value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}><option value="">ALL MARKETS</option><option>1X2</option><option>Double Chance</option><option>Draw No Bet</option><option>Goals</option><option>BTTS</option><option>Home Team Goals</option><option>Away Team Goals</option></select>
      <select value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value)}><option value="">ALL CONFIDENCE</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select>
      <input value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)} placeholder="League exact name"/>
    </div>
    <ErrorBlock error={error}/>
    <div className="analytics-grid">{cards.map(([label,value]) => <div key={label}><small>{label}</small><b>{value ?? '—'}</b></div>)}</div>
    <div className="analysis-card"><div className="analysis-title"><BarChart3/> By Market</div>{Object.entries(analytics?.by_market || {}).map(([market,v]) => <div className="analytics-row" key={market}><span>{market}</span><b>{v.wins}W / {v.losses}L / {v.voids}V</b></div>)}</div>
    <div className="analysis-card"><div className="analysis-title"><Trophy/> By League</div>{Object.entries(analytics?.by_league || {}).map(([league,v]) => <div className="analytics-row" key={league}><span>{league}</span><b>{v.wins}W / {v.losses}L / {v.voids}V</b></div>)}</div>
    <div className="analysis-card"><div className="analysis-title"><ShieldCheck/> By Confidence</div>{Object.entries(analytics?.by_confidence || {}).map(([conf,v]) => <div className="analytics-row" key={conf}><span>{conf}</span><b>{v.wins}W / {v.losses}L / {v.voids}V</b></div>)}</div>
    <div className="analysis-card settings-box"><div className="analysis-title"><CircleUserRound/> Model Settings</div>
      <label><span>Minimal odds</span><input type="number" step="0.05" min="1.01" value={settings.minOdds} onChange={(e) => setSettings((s) => ({...s,minOdds:Number(e.target.value)||1.2}))}/></label>
      <label><span>Minimal edge (pp)</span><input type="number" step="0.5" min="0" value={settings.minEdgePP} onChange={(e) => setSettings((s) => ({...s,minEdgePP:Number(e.target.value)||0}))}/></label>
      <label><span>Minimal EV (%)</span><input type="number" step="0.5" min="0" value={settings.minEvPct} onChange={(e) => setSettings((s) => ({...s,minEvPct:Number(e.target.value)||0}))}/></label>
    </div>
  </section>
}

export default function App() {
  const [view, setView] = useState('Pocetna')
  const [fixtures, setFixtures] = useState([])
  const [analyses, setAnalyses] = useState({})
  const [selected, setSelected] = useState(null)
  const [selectedMode, setSelectedMode] = useState('prematch')
  const [todayLoading, setTodayLoading] = useState(false)
  const [todayError, setTodayError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({done:0,total:0})
  const [filter, setFilter] = useState('ALL')
  const [liveFixtures, setLiveFixtures] = useState([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [settling, setSettling] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')
  const [days, setDays] = useState('30')
  const [modeFilter, setModeFilter] = useState('')
  const [marketFilter, setMarketFilter] = useState('')
  const [confidenceFilter, setConfidenceFilter] = useState('')
  const [leagueFilter, setLeagueFilter] = useState('')
  const [settings, setSettings] = useState(() => {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('aiscore-settings') || '{}') } }
    catch { return DEFAULT_SETTINGS }
  })

  useEffect(() => { localStorage.setItem('aiscore-settings', JSON.stringify(settings)) }, [settings])
  useEffect(() => { loadToday() }, [])
  useEffect(() => { if (view === 'Istorija') refreshHistory(); if (view === 'Analitika') loadAnalytics() }, [view])

  async function loadToday() {
    if (todayLoading) return
    setTodayLoading(true); setTodayError('')
    try {
      const data = await getToday(localDateKey())
      setFixtures(data.data || [])
    } catch (e) {
      setTodayError(e.message === 'API_FOOTBALL_KEY nije podesen na backendu'
        ? 'Sports API key nije konfigurisan na backendu. UI i engine su spremni, ali stvarni podaci ne mogu da se učitaju.'
        : e.message)
    } finally { setTodayLoading(false) }
  }

  async function analyzePrematch(fixture) {
    const id = fixture?.fixture?.id
    if (!id) return null
    const bundle = await getPrematchBundle(id)
    const result = buildPrematchAnalysis(bundle, settings)
    await saveAnalysis(result.analysis, result.picks)
    const movement = await getOddsHistory(id).catch(() => ({ data: [] }))
    const stored = { bundle, result, oddsHistory: movement.data || [] }
    setAnalyses((prev) => ({ ...prev, [id]: stored }))
    return stored
  }

  async function analyzeToday() {
    if (analyzing) return
    const candidates = fixtures.filter((f) => !isFinishedStatus(fixtureStatus(f))).slice(0,8)
    setAnalyzing(true); setProgress({done:0,total:candidates.length}); setTodayError('')
    for (let i = 0; i < candidates.length; i += 1) {
      try { await analyzePrematch(candidates[i]) }
      catch (e) { setTodayError((prev) => prev || `Neki mečevi nisu analizirani: ${e.message}`) }
      setProgress({done:i+1,total:candidates.length})
    }
    setAnalyzing(false)
  }

  async function openPrematch(fixture) {
    setSelectedMode('prematch'); setSelected(fixture)
    if (!analyses[fixture.fixture?.id]) {
      setAnalyzing(true)
      try { await analyzePrematch(fixture) } catch (e) { setTodayError(e.message) }
      finally { setAnalyzing(false) }
    }
  }

  function openById(id) {
    const fixture = fixtures.find((f) => f.fixture?.id === Number(id))
    if (fixture) openPrematch(fixture)
  }

  async function refreshLive() {
    if (liveLoading) return
    setLiveLoading(true); setLiveError('')
    try {
      const data = await getLiveBundle()
      setLiveFixtures(data.data || [])
    } catch (e) { setLiveError(e.message) }
    finally { setLiveLoading(false) }
  }

  async function openLive(fixture) {
    const id = fixture.fixture?.id
    setSelectedMode('live'); setSelected(fixture); setAnalyzing(true); setLiveError('')
    try {
      const [liveBundle, prematchBundle] = await Promise.all([getLiveBundle(id), getPrematchBundle(id)])
      const baseline = buildPrematchAnalysis(prematchBundle, settings)
      const liveResult = buildLiveAnalysis(liveBundle, baseline, settings)
      await saveAnalysis(liveResult.analysis, liveResult.picks)
      const movement = await getOddsHistory(id).catch(() => ({ data: [] }))
      setAnalyses((prev) => ({ ...prev, [id]: { bundle: { ...prematchBundle, ...liveBundle, odds: liveBundle.odds, lineups: liveBundle.lineups }, oddsHistory: movement.data || [], result: { ...liveResult, model: baseline.model, homeRecent: baseline.homeRecent, awayRecent: baseline.awayRecent, homeSeason: baseline.homeSeason, awaySeason: baseline.awaySeason, lineupStatus: liveBundle.lineups?.length ? 'CONFIRMED' : baseline.lineupStatus, context: baseline.context } } }))
      setSelected(liveBundle.fixture || fixture)
    } catch (e) { setLiveError(e.message) }
    finally { setAnalyzing(false) }
  }

  async function refreshHistory() {
    setHistoryLoading(true); setHistoryError(''); setSettling(true)
    try {
      await settleHistory().catch(() => null)
      const data = await getHistory(100)
      setHistory(data.data || [])
    } catch (e) { setHistoryError(e.message) }
    finally { setHistoryLoading(false); setSettling(false) }
  }

  async function loadAnalytics() {
    setAnalyticsLoading(true); setAnalyticsError('')
    try { setAnalytics(await getAnalytics({ days: days || null, mode: modeFilter || null, market: marketFilter || null, confidence: confidenceFilter || null, league: leagueFilter || null })) }
    catch (e) { setAnalyticsError(e.message) }
    finally { setAnalyticsLoading(false) }
  }
  useEffect(() => { if (view === 'Analitika') loadAnalytics() }, [days, modeFilter, marketFilter, confidenceFilter, leagueFilter])

  const selectedStored = selected ? analyses[selected.fixture?.id] : null

  return <div className="app-shell">
    <Header/>
    <main>
      {selected ? <MatchDetail fixture={selected} stored={selectedStored} mode={selectedMode} onBack={() => setSelected(null)} onAnalyze={selectedMode === 'live' ? openLive : analyzePrematch} analyzing={analyzing}/> : <>
        {view === 'Pocetna' && <TodayScreen fixtures={fixtures} analyses={analyses} loading={todayLoading} analyzing={analyzing} progress={progress} filter={filter} setFilter={setFilter} error={todayError} onLoad={loadToday} onAnalyzeAll={analyzeToday} onOpen={openPrematch} onCheat={() => setView('Cheat')}/>}
        {view === 'LIVE' && <LiveScreen liveFixtures={liveFixtures} liveLoading={liveLoading} liveError={liveError} onRefresh={refreshLive} onOpen={openLive}/>}
        {view === 'Signali' && <SignalsScreen analyses={analyses} onOpenById={openById}/>}
        {view === 'Cheat' && <CheatSheet analyses={analyses} onOpenById={openById}/>}
        {view === 'Istorija' && <HistoryScreen history={history} loading={historyLoading} error={historyError} onRefresh={refreshHistory} settling={settling}/>}
        {view === 'Analitika' && <AnalyticsScreen analytics={analytics} loading={analyticsLoading} error={analyticsError} days={days} setDays={setDays} mode={modeFilter} setMode={setModeFilter} marketFilter={marketFilter} setMarketFilter={setMarketFilter} confidenceFilter={confidenceFilter} setConfidenceFilter={setConfidenceFilter} leagueFilter={leagueFilter} setLeagueFilter={setLeagueFilter} onLoad={loadAnalytics} settings={settings} setSettings={setSettings}/>}
      </>}
    </main>

    {!selected && <nav className="bottom-nav">
      {[
        ['Pocetna',Home],['LIVE',Radio],['Signali',Flame],['Istorija',Clock3],['Analitika',BarChart3]
      ].map(([name,Icon]) => <button key={name} className={view === name || (name === 'Signali' && view === 'Cheat') ? 'active' : ''} onClick={() => setView(name)}><Icon/><span>{name}</span></button>)}
    </nav>}
  </div>
}
