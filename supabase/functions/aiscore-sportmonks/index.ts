import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BASE = "https://api.sportmonks.com/v3/football";
const ALLOWED_ORIGINS = [
  "https://marcic98-aiscore-app-pso9.bolt.host",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req), "Cache-Control": "no-store" },
  });
}

async function smFetch(path: string, extra: Record<string,string> = {}) {
  const token = Deno.env.get("SPORTMONKS_TOKEN");
  if (!token) throw new Error("SPORTMONKS_TOKEN_MISSING");
  const url = new URL(BASE + path);
  url.searchParams.set("api_token", token);
  Object.entries(extra).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e:any = new Error("SPORTMONKS_ERROR");
    e.status = res.status;
    e.details = body;
    throw e;
  }
  return body;
}

function currentScore(scores:any[] = []) {
  const out:any = { home: null, away: null };
  for (const s of scores) {
    if (s?.description !== "CURRENT") continue;
    const side = s?.score?.participant;
    if (side === "home" || side === "away") out[side] = Number(s?.score?.goals ?? 0);
  }
  return out;
}

function participant(f:any, side:string) {
  return (f?.participants || []).find((p:any) => p?.meta?.location === side) || null;
}

function mapStatus(f:any) {
  const name = String(f?.state?.name || "").toLowerCase();
  const dev = String(f?.state?.developer_name || "").toUpperCase();
  const periods = Array.isArray(f?.periods) ? f.periods : [];
  const active = periods.find((p:any) => p?.ticking === true) || [...periods].sort((a:any,b:any) => Number(b?.sort_order || 0)-Number(a?.sort_order || 0))[0];
  const elapsed = Number.isFinite(Number(active?.minutes)) ? Number(active.minutes) : null;
  const desc = String(active?.description || "").toUpperCase();
  if (dev.includes("FINISH") || name.includes("finished")) return { short:"FT", long:"Finished", elapsed:null };
  if (dev.includes("BREAK") || name.includes("half time") || desc.includes("HALFTIME")) return { short:"HT", long:f?.state?.name || "Half Time", elapsed:45 };
  if (dev.includes("INPLAY") || name.includes("inplay") || name.includes("live") || active?.ticking === true) {
    const short = desc.includes("2ND") || Number(active?.counts_from) >= 45 ? "2H" : "1H";
    return { short, long:f?.state?.name || "Live", elapsed };
  }
  if (dev.includes("POSTPON") || name.includes("postpon")) return { short:"PST", long:f?.state?.name || "Postponed", elapsed:null };
  if (dev.includes("CANCEL") || name.includes("cancel")) return { short:"CANC", long:f?.state?.name || "Cancelled", elapsed:null };
  return { short:"NS", long:f?.state?.name || "Not Started", elapsed:null };
}

function normalizeFixture(f:any) {
  const home = participant(f,"home");
  const away = participant(f,"away");
  const score = currentScore(f?.scores || []);
  return {
    fixture: {
      id: f?.id,
      date: f?.starting_at ? String(f.starting_at).replace(" ","T") + "Z" : null,
      status: mapStatus(f),
      referee: null,
    },
    league: {
      id: f?.league?.id ?? f?.league_id ?? null,
      name: f?.league?.name ?? "Unknown League",
      season: f?.season_id ?? null,
      round: f?.round_id ? String(f.round_id) : null,
    },
    teams: {
      home: { id: home?.id ?? null, name: home?.name ?? "Home", logo: home?.image_path ?? null },
      away: { id: away?.id ?? null, name: away?.name ?? "Away", logo: away?.image_path ?? null },
    },
    goals: { home: score.home, away: score.away },
    _sportmonks: { state_id:f?.state_id, last_processed_at:f?.last_processed_at, has_odds:f?.has_odds ?? false },
  };
}

function mapLineups(f:any) {
  const teams = new Map<number, any>();
  for (const row of f?.lineups || []) {
    if (!teams.has(row.team_id)) teams.set(row.team_id, { team: { id: row.team_id, name: null }, startXI: [], substitutes: [] });
    const entry = teams.get(row.team_id);
    const player = { player: { id: row.player_id, name: row.player_name || row?.player?.display_name || row?.player?.name || "Unknown" } };
    if (row.type_id === 11) entry.startXI.push(player);
    else if (row.type_id === 12) entry.substitutes.push(player);
  }
  for (const p of f?.participants || []) {
    if (teams.has(p.id)) teams.get(p.id).team.name = p.name;
  }
  return [...teams.values()];
}

function lineupMeta(f:any) {
  const meta = f?.metadata || [];
  for (const m of meta) {
    const dev = String(m?.type?.developer_name || m?.type?.code || "").toUpperCase().replaceAll("-","_");
    if (dev.includes("LINEUP_CONFIRMED")) {
      const v = m?.values;
      if (typeof v === "boolean") return v;
      if (typeof v === "object" && v !== null) {
        const candidate = v?.value ?? v?.confirmed ?? v?.lineup_confirmed;
        if (typeof candidate === "boolean") return candidate;
      }
      if (String(v).toLowerCase() === "true") return true;
      if (String(v).toLowerCase() === "false") return false;
    }
  }
  return null;
}

function mapOdds(rows:any[] = []) {
  const marketName = (r:any) => String(r?.market_description || r?.market?.name || "").trim();
  const out:any[] = [];
  for (const r of rows) {
    if (r?.stopped === true || r?.suspended === true) continue;
    const rawMarket = marketName(r).toLowerCase();
    const label = String(r?.label || r?.name || "").trim();
    const low = label.toLowerCase();
    let market:any = null, selection:any = null, line:any = null;

    if (rawMarket.includes("fulltime result") || rawMarket.includes("match winner") || rawMarket === "3-way result") {
      market = "1X2";
      if (["1","home"].includes(low) || low.includes("home")) selection = "Home";
      else if (["x","draw"].includes(low)) selection = "Draw";
      else if (["2","away"].includes(low) || low.includes("away")) selection = "Away";
    } else if (rawMarket.includes("double chance")) {
      market = "Double Chance";
      if (low.includes("1x") || low.includes("home/draw") || low.includes("home or draw")) selection = "Home/Draw";
      else if (low.includes("x2") || low.includes("draw/away") || low.includes("draw or away")) selection = "Draw/Away";
      else if (low.includes("12") || low.includes("home/away")) selection = "Home/Away";
    } else if (rawMarket.includes("draw no bet")) {
      market = "Draw No Bet";
      if (low.includes("home") || low === "1") selection = "Home";
      else if (low.includes("away") || low === "2") selection = "Away";
      line = 0;
    } else if (rawMarket.includes("both teams") || rawMarket.includes("btts")) {
      market = "BTTS";
      if (low.includes("yes")) selection = "Yes";
      else if (low.includes("no")) selection = "No";
    } else if (rawMarket.includes("total") || rawMarket.includes("over/under") || rawMarket.includes("match goals")) {
      market = "Goals";
      if (low.includes("over")) selection = "Over";
      else if (low.includes("under")) selection = "Under";
      const n = Number(r?.total ?? r?.handicap);
      if (Number.isFinite(n)) line = n;
      else {
        const nums = label.match(/[0-9]+(?:\.[0-9]+)?/g);
        if (nums?.length) line = Number(nums[nums.length - 1]);
      }
    }

    const odds = Number(r?.value ?? r?.dp3);
    if (!market || !selection || !Number.isFinite(odds) || odds <= 1) continue;
    const signal_key = [market,selection,line ?? ""].join("|");
    out.push({
      market, selection, line, odds, signal_key,
      bookmaker: r?.bookmaker?.name || (r?.bookmaker_id ? "Bookmaker " + r.bookmaker_id : null),
      bookmaker_id: r?.bookmaker_id ?? null,
      timestamp: r?.latest_bookmaker_update || r?.updated_at || null,
    });
  }
  const best = new Map<string,any>();
  for (const r of out) {
    const prev = best.get(r.signal_key);
    if (!prev || r.odds > prev.odds) best.set(r.signal_key,r);
  }
  return [...best.values()];
}

function statName(row:any) {
  const dev = String(row?.type?.developer_name || row?.type?.name || row?.type?.code || "").toUpperCase();
  if (dev.includes("BALL_POSSESSION") || dev === "POSSESSION") return "Ball Possession";
  if (dev.includes("SHOTS_ON_TARGET") || dev.includes("SHOTS_ON_GOAL")) return "Shots on Goal";
  if (dev === "SHOTS" || dev.includes("TOTAL_SHOTS")) return "Total Shots";
  if (dev.includes("CORNERS")) return "Corner Kicks";
  if (dev.includes("YELLOW")) return "Yellow Cards";
  if (dev.includes("RED")) return "Red Cards";
  return null;
}

function statValue(row:any) {
  const v = row?.data?.value ?? row?.value;
  if (typeof v === "number" || typeof v === "string") return v;
  if (v && typeof v === "object") return v?.total ?? v?.value ?? null;
  return null;
}

function mapStats(f:any) {
  const participants = f?.participants || [];
  const grouped = new Map<number,any[]>();
  for (const row of f?.statistics || []) {
    if (!grouped.has(row.participant_id)) grouped.set(row.participant_id,[]);
    const name = statName(row);
    if (name) grouped.get(row.participant_id).push({ type:name, value:statValue(row) });
  }
  return participants.map((p:any) => ({
    team:{ id:p.id, name:p.name },
    statistics:grouped.get(p.id) || [],
  }));
}

function daysAgo(n:number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0,10);
}
function todayUtc() { return new Date().toISOString().slice(0,10); }

async function getRecent(teamId:number) {
  if (!teamId) return [];
  const body = await smFetch("/fixtures/between/" + daysAgo(240) + "/" + todayUtc() + "/" + teamId, {
    include:"participants;scores;league;state;periods",
    order:"desc", per_page:"10",
  });
  return (body?.data || []).map(normalizeFixture);
}

async function getOdds(fixtureId:number, live=false) {
  try {
    const path = live ? "/odds/inplay/fixtures/" + fixtureId : "/odds/pre-match/fixtures/" + fixtureId;
    const body = await smFetch(path, { include:"market;bookmaker", per_page:"50" });
    return mapOdds(body?.data || []);
  } catch {
    return [];
  }
}

Deno.serve(async (req:Request) => {
  if (req.method === "OPTIONS") return new Response(null,{headers:cors(req)});
  if (req.method !== "GET") return json(req,{error:"Method not allowed"},405);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "health";

  try {
    if (action === "health") {
      const body = await smFetch("/fixtures/date/" + todayUtc(), {
        include:"participants;league;state;scores;periods",
        per_page:"1",
      });
      return json(req,{
        ok:true,
        provider:"Sportmonks Football API v3",
        token_configured:true,
        accessible_fixtures_sample:Array.isArray(body?.data) ? body.data.length : 0,
        checked_at:new Date().toISOString(),
      });
    }

    if (action === "today") {
      const date = url.searchParams.get("date") || todayUtc();
      const body = await smFetch("/fixtures/date/" + date, {
        include:"participants;league;state;scores;periods",
        per_page:"50",
      });
      return json(req,{
        data:(body?.data || []).map(normalizeFixture),
        generated_at:new Date().toISOString(),
        data_last_updated:new Date().toISOString(),
        provider:"sportmonks",
      });
    }

    if (action === "live_bundle" && !url.searchParams.get("fixture")) {
      const body = await smFetch("/livescores/inplay", {
        include:"participants;league;state;scores;periods",
      });
      return json(req,{
        data:(body?.data || []).map(normalizeFixture),
        data_last_updated:new Date().toISOString(),
        provider:"sportmonks",
      });
    }

    const fixtureId = Number(url.searchParams.get("fixture"));
    if (!Number.isFinite(fixtureId)) return json(req,{error:"Nedostaje fixture id"},400);

    if (action === "prematch_bundle") {
      const body = await smFetch("/fixtures/" + fixtureId, {
        include:"participants;league;state;scores;periods;lineups;metadata.type;sidelined.sideline",
      });
      const raw = body?.data;
      if (!raw) return json(req,{error:"Fixture not found"},404);
      const f = normalizeFixture(raw);
      const homeId = f?.teams?.home?.id;
      const awayId = f?.teams?.away?.id;

      const settled = await Promise.allSettled([
        getRecent(homeId),
        getRecent(awayId),
        smFetch("/fixtures/head-to-head/" + homeId + "/" + awayId,{include:"participants;scores;league;state;periods",per_page:"10"}),
        getOdds(fixtureId,false),
      ]);
      const val=(i:number, fallback:any)=>settled[i]?.status==="fulfilled" ? (settled[i] as PromiseFulfilledResult<any>).value : fallback;
      const confirmed = lineupMeta(raw);

      return json(req,{
        fixture:f,
        home_recent:val(0,[]),
        away_recent:val(1,[]),
        home_team_stats:null,
        away_team_stats:null,
        h2h:(val(2,{data:[]})?.data || []).map(normalizeFixture),
        injuries:raw?.sidelined || [],
        lineups:mapLineups(raw),
        projected_lineup:confirmed === false ? mapLineups(raw) : null,
        standings:[],
        odds:val(3,[]),
        availability:{
          fixture:true,
          home_recent:val(0,[]).length > 0,
          away_recent:val(1,[]).length > 0,
          home_team_stats:false,
          away_team_stats:false,
          h2h:(val(2,{data:[]})?.data || []).length > 0,
          injuries:Array.isArray(raw?.sidelined),
          lineups:confirmed === true && mapLineups(raw).length >= 2,
          projected_lineup:confirmed === false && mapLineups(raw).length >= 2,
          standings:false,
          odds:val(3,[]).length > 0,
          xg:Array.isArray(raw?.xGFixture) && raw.xGFixture.length > 0,
          weather:false,
          referee_stats:false,
        },
        lineup_confirmed:confirmed,
        provider:"sportmonks",
        analysis_generated_at:new Date().toISOString(),
        data_last_updated:raw?.last_processed_at || new Date().toISOString(),
      });
    }

    if (action === "live_bundle") {
      const body = await smFetch("/fixtures/" + fixtureId,{
        include:"participants;league;state;scores;periods;lineups;metadata.type;statistics.type;events",
      });
      const raw=body?.data;
      if (!raw) return json(req,{error:"Fixture not found"},404);
      const odds=await getOdds(fixtureId,true);
      return json(req,{
        fixture:normalizeFixture(raw),
        stats:mapStats(raw),
        events:raw?.events || [],
        lineups:mapLineups(raw),
        odds,
        availability:{
          fixture:true,
          stats:Array.isArray(raw?.statistics) && raw.statistics.length>0,
          events:Array.isArray(raw?.events),
          lineups:mapLineups(raw).length>=2,
          live_odds:odds.length>0,
          xg:Array.isArray(raw?.xGFixture) && raw.xGFixture.length>0,
          dangerous_attacks:Array.isArray(raw?.pressure) && raw.pressure.length>0,
        },
        provider:"sportmonks",
        analysis_generated_at:new Date().toISOString(),
        data_last_updated:raw?.last_processed_at || new Date().toISOString(),
      });
    }

    return json(req,{error:"Unknown action"},404);
  } catch (error) {
    const message=String((error as Error)?.message || error);
    if (message==="SPORTMONKS_TOKEN_MISSING") return json(req,{error:"SPORTMONKS_TOKEN nije podesen na backendu"},503);
    return json(req,{
      error:"Sportmonks backend error",
      details:(error as any)?.details || message,
    },Number((error as any)?.status || 500));
  }
});
