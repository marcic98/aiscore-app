import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const LEAGUES = [
  ["eng.1","Premier League"],["eng.2","Championship"],["esp.1","La Liga"],["esp.2","LaLiga 2"],
  ["ita.1","Serie A"],["ger.1","Bundesliga"],["fra.1","Ligue 1"],["ned.1","Eredivisie"],
  ["por.1","Primeira Liga"],["bel.1","Belgian Pro League"],["tur.1","Turkish Super Lig"],["sco.1","Scottish Premiership"],
  ["uefa.champions","UEFA Champions League"],["uefa.europa","UEFA Europa League"],["uefa.europa.conf","UEFA Conference League"],
  ["usa.1","MLS"],["mex.1","Liga MX"],["bra.1","Brazil Serie A"],["arg.1","Argentina Primera"],
  ["jpn.1","J1 League"],["aus.1","A-League"]
];

const ALLOWED = ["https://marcic98-aiscore-app-pso9.bolt.host","http://localhost:5173","http://127.0.0.1:5173"];

function headers(req:Request){
  const origin=req.headers.get("origin")||"";
  return {
    "content-type":"application/json",
    "Access-Control-Allow-Origin":ALLOWED.includes(origin)?origin:ALLOWED[0],
    "Access-Control-Allow-Headers":"content-type",
    "Access-Control-Allow-Methods":"GET,OPTIONS",
    "Vary":"Origin","Cache-Control":"public, max-age=120"
  };
}
function send(req:Request,body:any,status=200){return new Response(JSON.stringify(body),{status,headers:headers(req)})}
async function getJson(url:string){
  const r=await fetch(url,{headers:{"accept":"application/json","user-agent":"Mozilla/5.0"}});
  if(!r.ok) throw new Error("PUBLIC_SOURCE_"+r.status);
  return r.json();
}
function ymd(date:string){return date.replaceAll("-","")}
function statusOf(e:any){
  const s=e?.status?.type;
  if(s?.completed) return "FT";
  if(s?.state==="in") return "LIVE";
  if(s?.state==="pre") return "NS";
  return String(s?.shortDetail||"NS").toUpperCase();
}
function normEvent(e:any,slug:string,leagueName:string){
  const c=e?.competitions?.[0];
  const comps=c?.competitors||[];
  const home=comps.find((x:any)=>x?.homeAway==="home");
  const away=comps.find((x:any)=>x?.homeAway==="away");
  const odds=(c?.odds||[]).map((o:any)=>({
    market:"1X2",selection:null,line:null,odds:null,bookmaker:o?.provider?.name||null,raw:o
  }));
  return {
    fixture:{id:Number(e?.id),date:e?.date||null,status:{short:statusOf(e),long:e?.status?.type?.description||null,elapsed:null},referee:null},
    league:{id:slug,name:leagueName,season:null,round:null},
    teams:{
      home:{id:Number(home?.team?.id),name:home?.team?.displayName||home?.team?.name||"Home",logo:home?.team?.logo||null},
      away:{id:Number(away?.team?.id),name:away?.team?.displayName||away?.team?.name||"Away",logo:away?.team?.logo||null}
    },
    goals:{
      home:home?.score?.value!==undefined?Number(home.score.value):null,
      away:away?.score?.value!==undefined?Number(away.score.value):null
    },
    provider_meta:{league_slug:slug,event_id:String(e?.id),odds}
  };
}
async function leagueToday(slug:string,name:string,date:string){
  try{
    const u=`${BASE}/${slug}/scoreboard?dates=${ymd(date)}&limit=100`;
    const j=await getJson(u);
    return (j?.events||[]).map((e:any)=>normEvent(e,slug,name));
  }catch{return []}
}
async function teamRecent(slug:string,teamId:number,season:number){
  try{
    const u=`${BASE}/${slug}/teams/${teamId}/schedule?season=${season}`;
    const j=await getJson(u);
    return (j?.events||[])
      .map((e:any)=>normEvent(e,slug,j?.team?.displayName||slug))
      .filter((x:any)=>x.fixture.status.short==="FT")
      .sort((a:any,b:any)=>new Date(b.fixture.date).getTime()-new Date(a.fixture.date).getTime())
      .slice(0,10);
  }catch{return []}
}
function findEvent(events:any[],fixtureId:number){return events.find((x:any)=>Number(x.fixture?.id)===Number(fixtureId))||null}
function parseSeason(date:string){const d=new Date(date||Date.now()); return d.getUTCFullYear()}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:headers(req)});
  const u=new URL(req.url); const action=u.searchParams.get("action")||"today";
  try{
    if(action==="today"){
      const date=u.searchParams.get("date")||new Date().toISOString().slice(0,10);
      const groups=await Promise.all(LEAGUES.map(([slug,name])=>leagueToday(slug,name,date)));
      const all=groups.flat().filter((x:any)=>x.fixture.status.short==="NS");
      const seen=new Set<string>(); const data=[];
      for(const f of all){const k=String(f.fixture.id); if(!seen.has(k)){seen.add(k);data.push(f)}}
      data.sort((a:any,b:any)=>new Date(a.fixture.date).getTime()-new Date(b.fixture.date).getTime());
      return send(req,{data,provider:"public-web",generated_at:new Date().toISOString(),coverage:"best-effort public fixtures; no API key"});
    }
    if(action==="prematch_bundle"){
      const fixtureId=Number(u.searchParams.get("fixture"));
      const league=String(u.searchParams.get("league")||"");
      const date=String(u.searchParams.get("date")||new Date().toISOString().slice(0,10));
      const pair=LEAGUES.find(([s])=>s===league);
      if(!fixtureId||!pair) return send(req,{error:"Fixture context missing"},400);
      const todays=await leagueToday(pair[0],pair[1],date);
      const fixture=findEvent(todays,fixtureId);
      if(!fixture) return send(req,{error:"Fixture not found in public source"},404);
      const season=parseSeason(fixture.fixture.date);
      const [homeRecent,awayRecent]=await Promise.all([
        teamRecent(pair[0],fixture.teams.home.id,season),
        teamRecent(pair[0],fixture.teams.away.id,season)
      ]);
      return send(req,{
        fixture,home_recent:homeRecent,away_recent:awayRecent,
        home_team_stats:null,away_team_stats:null,h2h:[],injuries:[],lineups:[],projected_lineup:null,standings:[],odds:[],
        availability:{
          fixture:true,home_recent:homeRecent.length>0,away_recent:awayRecent.length>0,
          home_team_stats:false,away_team_stats:false,h2h:false,injuries:false,lineups:false,
          projected_lineup:false,standings:false,odds:false,xg:false,weather:false,referee_stats:false
        },
        lineup_confirmed:null,provider:"public-web",analysis_generated_at:new Date().toISOString(),
        data_last_updated:new Date().toISOString()
      });
    }
    return send(req,{error:"Unknown action"},404);
  }catch(e){return send(req,{error:"Public football source unavailable",details:String(e)},502)}
});