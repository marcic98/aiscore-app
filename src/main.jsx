import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Activity, BarChart3, Bell, Brain, ChevronLeft, ChevronRight, CircleUserRound,
  Clock3, CornerDownRight, Crosshair, Flame, Goal, Home, Radio, ShieldCheck,
  Sparkles, Target, TrendingUp, Trophy, Zap
} from 'lucide-react'
import './styles.css'

const featured = {
  id: 99, league: 'La Liga', minute: "72'", home: 'Real Madrid', away: 'Sevilla',
  score: '1 : 1', tip: 'Gol do kraja', market: 'Golovi', confidence: 82, odds: '1.55',
  action: 'IGRAJ', momentumHome: 68, momentumAway: 32,
  stats: [
    ['Sutevi','14 - 7'], ['U okvir','6 - 3'], ['Napadi','48 - 31'],
    ['Opasni napadi','22 - 12'], ['Korneri','7 - 2'], ['Posed','61% - 39%']
  ],
  reason: 'Real Madrid drzi visok pritisak poslednjih 10 minuta, ima vise suteva u okvir i tri uzastopna opasna napada.'
}

const demoSignals = [
  { id:1, league:'Premier League', minute:"58'", home:'Arsenal', away:'Chelsea', score:'0 : 1', tip:'GG - Oba daju gol', market:'GG', confidence:76, odds:'1.72', action:'IGRAJ' },
  { id:2, league:'Serie A', minute:"34'", home:'Inter', away:'Napoli', score:'2 : 0', tip:'Vise od 2.5 gola', market:'Golovi', confidence:68, odds:'1.85', action:'IGRAJ' },
  { id:3, league:'Bundesliga', minute:"81'", home:'Bayern', away:'Dortmund', score:'3 : 1', tip:'Vise od 4.5 gola', market:'Golovi', confidence:42, odds:'2.10', action:'PRESKOCI' },
  { id:4, league:'La Liga', minute:"66'", home:'Barcelona', away:'Villarreal', score:'1 : 1', tip:'Barcelona sledeci gol', market:'1X2', confidence:71, odds:'1.66', action:'IGRAJ' },
  { id:5, league:'Ligue 1', minute:"73'", home:'PSG', away:'Lyon', score:'2 : 2', tip:'Vise od 9.5 kornera', market:'Korneri', confidence:63, odds:'1.78', action:'CEKAJ' }
]

const history = [
  {match:'Milan - Roma', tip:'Vise od 1.5 gola', result:'DOBITAK', odds:'1.42'},
  {match:'Benfica - Porto', tip:'GG', result:'DOBITAK', odds:'1.68'},
  {match:'Ajax - PSV', tip:'Gol do kraja', result:'PROMASAJ', odds:'1.61'},
  {match:'Atletico - Valencia', tip:'1X', result:'DOBITAK', odds:'1.36'}
]

const initials = name => name.split(' ').map(x=>x[0]).join('').slice(0,3).toUpperCase()

function StatusBadge({action}) {
  const cls = action === 'IGRAJ' ? 'play' : action === 'CEKAJ' ? 'wait' : 'skip'
  return <span className={cls}>{action === 'IGRAJ' ? '▶ IGRAJ' : action === 'CEKAJ' ? '◷ CEKAJ' : '✕ PRESKOCI'}</span>
}

function SignalCard({s,onOpen}) {
  return (
    <button className="signal-card" onClick={() => onOpen?.(s)}>
      <div className="signal-top">
        <span>{s.league}</span><span>{s.minute}</span><span className="live-dot">● LIVE</span>
      </div>
      <div className="teams-row">
        <div className="team"><div className="badge">{initials(s.home)}</div><span>{s.home}</span></div>
        <div className="score">{s.score}</div>
        <div className="team"><div className="badge alt">{initials(s.away)}</div><span>{s.away}</span></div>
      </div>
      <div className="signal-bottom">
        <div className="tip-col"><small>PREDIKCIJA</small><strong>{s.tip}</strong></div>
        <div><small>POUZDANOST</small><strong className={s.confidence >= 60 ? 'green' : 'red'}>{s.confidence}%</strong></div>
        <div><small>KVOTA</small><strong>{s.odds}</strong></div>
        <StatusBadge action={s.action}/>
      </div>
    </button>
  )
}

function HomeView({market,setMarket,onOpen}) {
  const filtered = useMemo(() => market === 'Sve' ? demoSignals : demoSignals.filter(s => s.market === market), [market])
  return <>
    <section className="hero-card premium">
      <div className="hero-kicker"><span><Sparkles size={14}/> AI SIGNAL</span><span className="confidence-pill"><ShieldCheck size={14}/> VISOKO POVERENJE</span></div>
      <div className="section-title"><Trophy size={20}/> Najbolji signal trenutno</div>
      <div className="hero-match">
        <div className="match-left">
          <div className="meta">La Liga &nbsp; • &nbsp; {featured.minute} &nbsp; <span className="live-dot">● LIVE</span></div>
          <div className="hero-teams">
            <div className="hero-team"><div className="club">RM</div><span>Real Madrid</span></div>
            <div className="hero-score">{featured.score}<small>{featured.minute}</small></div>
            <div className="hero-team"><div className="club orange">SEV</div><span>Sevilla</span></div>
          </div>
        </div>
        <div className="prediction-box">
          <small>PREDIKCIJA</small>
          <div className="prediction">Gol do kraja</div>
          <div className="numbers"><div><small>POUZDANOST</small><b>82%</b></div><div><small>KVOTA</small><strong>1.55</strong></div></div>
        </div>
      </div>
      <button className="hero-cta" onClick={() => onOpen(featured)}><Zap size={20}/> OTVORI ANALIZU <ChevronRight size={18}/></button>
    </section>

    <div className="refresh-strip"><span><span className="pulse"/> LIVE podaci</span><span>Osvezeno pre 8 s</span></div>

    <div className="tabs">
      <button className="active">LIVE</button><button>Danas</button><button>Kasnije</button><button>Svi sportovi⌄</button>
    </div>
    <div className="market-tabs">
      {['Sve','Golovi','1X2','GG','Korneri'].map(x => <button key={x} className={market===x?'active':''} onClick={() => setMarket(x)}>{x === 'Golovi' ? '⚽ ' : ''}{x}</button>)}
    </div>

    <section className="signals">
      <div className="list-heading"><span><Flame size={18}/> Top LIVE signali</span><span className="muted">Demo podaci</span></div>
      {filtered.map(s => <SignalCard s={s} key={s.id} onOpen={onOpen}/>)}
      {!filtered.length && <div className="empty">Trenutno nema signala za ovaj filter.</div>}
    </section>

    <section className="stats">
      <div><TrendingUp/><span>Win rate</span><b>73%</b><small>demo</small></div>
      <div><Target/><span>Pogodjeno</span><b>43 / 59</b><small>demo signala</small></div>
      <div><BarChart3/><span>Profit</span><b>+214.8€</b><small>demo prikaz</small></div>
    </section>
  </>
}

function DetailView({match,onBack}) {
  const momentum = Math.max(52, match.confidence - 5)
  const m = match.id === featured.id ? featured : {
    ...match,
    momentumHome: momentum,
    momentumAway: 100 - momentum,
    stats:[['Sutevi','12 - 8'],['U okvir','5 - 3'],['Napadi','41 - 35'],['Opasni napadi','18 - 14'],['Korneri','6 - 4'],['Posed','56% - 44%']],
    reason: match.home + ' trenutno ima bolji ritam i vise opasnih ulazaka u zavrsnu trecinu. Signal ostaje aktivan dok se intenzitet ne promeni.'
  }
  const icons = [Target, Crosshair, Activity, Flame, CornerDownRight, Goal]
  return <section className="detail-view">
    <button className="back-btn" onClick={onBack}><ChevronLeft/> Nazad</button>

    <div className="match-stage">
      <div className="detail-meta"><span>{m.league}</span><span className="live-dot">● LIVE</span></div>
      <div className="detail-teams">
        <div className="detail-team"><div className="club big">{initials(m.home)}</div><strong>{m.home}</strong></div>
        <div className="detail-score"><b>{m.score}</b><span>{m.minute}</span></div>
        <div className="detail-team"><div className="club orange big">{initials(m.away)}</div><strong>{m.away}</strong></div>
      </div>
    </div>

    <div className="ai-signal-box">
      <div className="signal-head"><Brain/><strong>Najbolji signal trenutno</strong><span><ShieldCheck/> Visoko poverenje</span></div>
      <div className="signal-main">
        <div><small>PREDIKCIJA</small><h2>{m.tip}</h2><p>AI procena na osnovu trenutnog toka utakmice.</p></div>
        <div className="signal-kpis"><div><small>VEROVATNOCA</small><b>{m.confidence}%</b></div><div><small>KVOTA</small><strong>{m.odds}</strong></div></div>
      </div>
      <StatusBadge action={m.action}/>
    </div>

    <div className="analysis-card">
      <div className="analysis-title"><TrendingUp/> Momentum <span>Trenutna dominacija</span></div>
      <div className="momentum-labels"><b>{m.home} <em>{m.momentumHome}%</em></b><b>{m.away} <em>{m.momentumAway}%</em></b></div>
      <div className="momentum-track"><div style={{width:m.momentumHome+'%'}}/></div>
    </div>

    <div className="analysis-card">
      <div className="analysis-title"><BarChart3/> Statistika utakmice <span className="live-data"><span className="pulse"/> Uzivo podaci</span></div>
      <div className="stat-grid">{m.stats.map(([label,val],i)=>{ const Icon=icons[i]; return <div className="stat-tile" key={label}><span><Icon/></span><small>{label}</small><b>{val}</b></div> })}</div>
    </div>

    <div className="analysis-card reason-card">
      <div className="analysis-title"><Brain/> Zasto AI bira ovaj signal</div>
      <p>{m.reason}</p>
    </div>
  </section>
}

function LiveView({onOpen}) {
  return <section className="page-panel"><h2><Radio/> LIVE centar</h2><p className="muted">Svi demo signali na jednom mestu.</p>{demoSignals.map(s=><SignalCard key={s.id} s={s} onOpen={onOpen}/>)}</section>
}
function SignalsView({onOpen}) {
  return <section className="page-panel"><h2><BarChart3/> Signali</h2><p className="muted">Sortirano po pouzdanosti.</p>{[...demoSignals].sort((a,b)=>b.confidence-a.confidence).map(s=><SignalCard key={s.id} s={s} onOpen={onOpen}/>)}</section>
}
function HistoryView() {
  return <section className="page-panel"><h2><Clock3/> Istorija</h2><div className="history-summary"><span>Ukupno</span><b>3 / 4 pogodjeno</b><strong>+2.14 uloga</strong></div>{history.map((h,i)=><div className="history-row" key={i}><div><strong>{h.match}</strong><small>{h.tip} · {h.odds}</small></div><span className={h.result==='DOBITAK'?'won':'lost'}>{h.result}</span></div>)}</section>
}
function ProfileView() {
  return <section className="page-panel profile"><CircleUserRound size={54}/><h2>AI Score profil</h2><p className="muted">Podesavanja signala i naloga.</p><div className="profile-card"><span>Minimalna kvota</span><b>1.20</b><ChevronRight/></div><div className="profile-card"><span>Minimalna pouzdanost</span><b>65%</b><ChevronRight/></div><div className="profile-card"><span>Obavestenja</span><b>UKLJUCENA</b><Bell/></div></section>
}

function App(){
  const [view,setView] = useState('Pocetna')
  const [market,setMarket] = useState('Sve')
  const [selected,setSelected] = useState(null)
  const openMatch = m => setSelected(m)
  const switchView = name => { setSelected(null); setView(name) }

  return (
    <div className="app-shell">
      <header>
        <div className="brand">
          <div className="logo"><Activity size={24}/></div>
          <div><div className="brand-title">AI <span>Score</span></div><div className="brand-sub">VISE OD PREDIKCIJE</div></div>
        </div>
        <button className="bell-btn"><Bell size={19}/><span/></button>
      </header>

      <main>
        {selected ? <DetailView match={selected} onBack={()=>setSelected(null)}/> : <>
          {view==='Pocetna' && <HomeView market={market} setMarket={setMarket} onOpen={openMatch}/>}
          {view==='LIVE' && <LiveView onOpen={openMatch}/>}
          {view==='Signali' && <SignalsView onOpen={openMatch}/>}
          {view==='Istorija' && <HistoryView/>}
          {view==='Profil' && <ProfileView/>}
        </>}
      </main>

      {!selected && <nav className="bottom-nav">
        {[
          ['Pocetna',Home],['LIVE',Radio],['Signali',BarChart3],['Istorija',Clock3],['Profil',CircleUserRound]
        ].map(([name,Icon]) => <button key={name} className={view===name?'active':''} onClick={()=>switchView(name)}><Icon/><span>{name}</span></button>)}
      </nav>}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
