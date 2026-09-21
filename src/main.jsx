import React from 'react'
import ReactDOM from 'react-dom/client'
import { Activity, BarChart3, CircleUserRound, Clock3, Home, Radio, Target, TrendingUp, Trophy, Zap, ShieldCheck } from 'lucide-react'
import './styles.css'

const signals = [
  { league:'Premier League', minute:"58'", home:'Arsenal', away:'Chelsea', score:'0 : 1', tip:'GG - Oba daju gol', confidence:76, odds:'1.72', action:'IGRAJ' },
  { league:'Serie A', minute:"34'", home:'Inter', away:'Napoli', score:'2 : 0', tip:'Vise od 2.5 gola', confidence:68, odds:'1.85', action:'IGRAJ' },
  { league:'Bundesliga', minute:"81'", home:'Bayern', away:'Dortmund', score:'3 : 1', tip:'Vise od 4.5 gola', confidence:42, odds:'2.10', action:'PRESKOCI' }
]

function SignalCard({s}) {
  const good = s.action === 'IGRAJ'
  return (
    <div className="signal-card">
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
        <button className={good ? 'play' : 'skip'}>{good ? '▶ IGRAJ' : '✕ PRESKOCI'}</button>
      </div>
    </div>
  )
}

function App(){
  return (
    <div className="app-shell">
      <header>
        <div className="brand">
          <div className="logo"><Activity size={24}/></div>
          <div><div className="brand-title">AI <span>Score</span></div><div className="brand-sub">PAMETNIJI TIPOVI. VECI DOBICI.</div></div>
        </div>
        <div className="live-pill">● LIVE</div>
      </header>

      <main>
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
          <button className="hero-cta"><Zap size={20}/> IGRAJ <span>AI PREPORUKA</span></button>
        </section>

        <div className="tabs">
          <button className="active">LIVE</button><button>Danas</button><button>Kasnije</button><button>Svi sportovi⌄</button>
        </div>
        <div className="market-tabs">
          <button className="active">⚽ Golovi</button><button>1X2</button><button>GG</button><button>Korneri</button>
        </div>

        <section className="signals">
          <div className="list-heading"><span>🔥 Top LIVE signali</span><a>Prikazi sve ›</a></div>
          {signals.map((s,i)=><SignalCard s={s} key={i}/>)}
        </section>

        <section className="stats">
          <div><TrendingUp/><span>Win rate</span><b>73%</b><small>poslednjih 30 dana</small></div>
          <div><Target/><span>Pogodjeno</span><b>43 / 59</b><small>signala</small></div>
          <div><BarChart3/><span>Profit</span><b>+214.8€</b><small>demo prikaz</small></div>
        </section>

        <div className="quote">“ Statistika ne laze. Igraj pametno. ”</div>
      </main>

      <nav className="bottom-nav">
        <button className="active"><Home/><span>Pocetna</span></button>
        <button><Radio/><span>LIVE</span></button>
        <button><BarChart3/><span>Signali</span></button>
        <button><Clock3/><span>Istorija</span></button>
        <button><CircleUserRound/><span>Profil</span></button>
      </nav>
    </div>
  )
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />)