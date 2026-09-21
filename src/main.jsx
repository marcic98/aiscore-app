import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Activity, BarChart3, CircleUserRound, Clock3, Home, Radio, Target, TrendingUp, Trophy, Zap, ShieldCheck, ChevronRight } from 'lucide-react'
import './styles.css'

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

function SignalCard({s}) {
  const cls = s.action === 'IGRAJ' ? 'play' : s.action === 'CEKAJ' ? 'wait' : 'skip'
  return (
    <button className="signal-card" onClick={() => alert(`${s.home} - ${s.away}\n${s.tip}\nPouzdanost: ${s.confidence}%\nKvota: ${s.odds}`)}>
      <div className="signal-top">
        <span>{s.league}</span><span>{s.minute}</span><span className="live-dot">● LIVE</span>
      </div>
      <div className="teams-row">
        <div className="team"><div className="badge">{s.home[0]}</div><span>{s.home}</span></div>
        <div className="score">{s.score}</div>
        <div className="team"><div className="badge alt">{s.away[0]}</div><span>{s.away}</span></div>
      </div>
      <div className="signal-bottom">
        <div className="tip-col"><small>PREDIKCIJA</small><strong>{s.tip}</strong></div>
        <div><small>POUZDANOST</small><strong className={s.confidence >= 60 ? 'green' : 'red'}>{s.confidence}%</strong></div>
        <div><small>KVOTA</small><strong>{s.odds}</strong></div>
        <span className={cls}>{s.action === 'IGRAJ' ? '▶ IGRAJ' : s.action === 'CEKAJ' ? '◷ CEKAJ' : '✕ PRESKOCI'}</span>
      </div>
    </button>
  )
}

function HomeView({market,setMarket}) {
  const filtered = useMemo(() => market === 'Sve' ? demoSignals : demoSignals.filter(s => s.market === market), [market])
  return <>
    <section className="hero-card">
      <div className="section-title"><Trophy size={20}/> Najbolji signal trenutno <span className="confidence-pill"><ShieldCheck size={15}/> VISOKO POVERENJE</span></div>
      <div className="hero-match">
        <div className="match-left">
          <div className="meta">La Liga &nbsp; | &nbsp; 72' &nbsp; <span className="live-dot">● LIVE</span></div>
          <div className="hero-teams">
            <div className="hero-team"><div className="club">RM</div><span>Real Madrid</span></div>
            <div className="hero-score">1 : 1</div>
            <div className="hero-team"><div className="club orange">SEV</div><span>Sevilla</span></div>
          </div>
        </div>
        <div className="prediction-box">
          <small>PREDIKCIJA</small>
          <div className="prediction">Gol do kraja</div>
          <div className="numbers"><div><small>POUZDANOST</small><b>82%</b></div><div><small>KVOTA</small><strong>1.55</strong></div></div>
        </div>
      </div>
      <button className="hero-cta" onClick={() => alert('Demo signal: Gol do kraja | 82% | kvota 1.55')}><Zap size={20}/> IGRAJ <span>AI PREPORUKA</span></button>
    </section>

    <div className="tabs">
      <button className="active">LIVE</button><button>Danas</button><button>Kasnije</button><button>Svi sportovi⌄</button>
    </div>
    <div className="market-tabs">
      {['Sve','Golovi','1X2','GG','Korneri'].map(x => <button key={x} className={market===x?'active':''} onClick={() => setMarket(x)}>{x === 'Golovi' ? '⚽ ' : ''}{x}</button>)}
    </div>

    <section className="signals">
      <div className="list-heading"><span>🔥 Top LIVE signali</span><span className="muted">Demo podaci</span></div>
      {filtered.map(s => <SignalCard s={s} key={s.id}/>)}
      {!filtered.length && <div className="empty">Trenutno nema signala za ovaj filter.</div>}
    </section>

    <section className="stats">
      <div><TrendingUp/><span>Win rate</span><b>73%</b><small>demo</small></div>
      <div><Target/><span>Pogodjeno</span><b>43 / 59</b><small>demo signala</small></div>
      <div><BarChart3/><span>Profit</span><b>+214.8€</b><small>demo prikaz</small></div>
    </section>
    <div className="quote">“ Statistika ne laze. Igraj odgovorno. ”</div>
  </>
}

function LiveView() {
  return <section className="page-panel"><h2><Radio/> LIVE centar</h2><p className="muted">Svi demo signali na jednom mestu. Kasnije ovde povezujemo pravi sportski API.</p>{demoSignals.map(s=><SignalCard key={s.id} s={s}/>)}</section>
}
function SignalsView() {
  return <section className="page-panel"><h2><BarChart3/> Signali</h2><p className="muted">Sortirano po pouzdanosti.</p>{[...demoSignals].sort((a,b)=>b.confidence-a.confidence).map(s=><SignalCard key={s.id} s={s}/>)}</section>
}
function HistoryView() {
  return <section className="page-panel"><h2><Clock3/> Istorija</h2>{history.map((h,i)=><div className="history-row" key={i}><div><strong>{h.match}</strong><small>{h.tip} · {h.odds}</small></div><span className={h.result==='DOBITAK'?'won':'lost'}>{h.result}</span></div>)}</section>
}
function ProfileView() {
  return <section className="page-panel profile"><CircleUserRound size={54}/><h2>AI Score profil</h2><p className="muted">Aplikacija je spremna za povezivanje naloga, pravog API-ja i istorije korisnika.</p><div className="profile-card"><span>Status aplikacije</span><b>DEMO / UI READY</b><ChevronRight/></div></section>
}

function App(){
  const [view,setView] = useState('Pocetna')
  const [market,setMarket] = useState('Sve')
  return (
    <div className="app-shell">
      <header>
        <div className="brand">
          <div className="logo"><Activity size={24}/></div>
          <div><div className="brand-title">AI <span>Score</span></div><div className="brand-sub">LIVE ANALIZA I SIGNALI</div></div>
        </div>
        <div className="live-pill">● LIVE</div>
      </header>

      <main>
        {view==='Pocetna' && <HomeView market={market} setMarket={setMarket}/>}
        {view==='LIVE' && <LiveView/>}
        {view==='Signali' && <SignalsView/>}
        {view==='Istorija' && <HistoryView/>}
        {view==='Profil' && <ProfileView/>}
      </main>

      <nav className="bottom-nav">
        {[
          ['Pocetna',Home],['LIVE',Radio],['Signali',BarChart3],['Istorija',Clock3],['Profil',CircleUserRound]
        ].map(([name,Icon]) => <button key={name} className={view===name?'active':''} onClick={()=>setView(name)}><Icon/><span>{name}</span></button>)}
      </nav>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
