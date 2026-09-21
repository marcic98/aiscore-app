import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const API_BASE = "https://v3.football.api-sports.io";
const ALLOWED_ORIGINS = [
  "https://marcic98-aiscore-app-pso9.bolt.host",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const CACHE_TTL = {
  today: 300,
  fixture: 60,
  recent: 1800,
  teamStats: 21600,
  h2h: 21600,
  injuries: 900,
  lineups: 300,
  standings: 1800,
  prematchOdds: 300,
  liveStats: 20,
  events: 15,
  liveOdds: 20,
};

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req), ...extra },
  });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_ADMIN_MISSING");
  return createClient(url, key);
}

async function getApiKey() {
  const envKey = Deno.env.get("API_FOOTBALL_KEY");
  if (envKey) return envKey;

  const admin = adminClient();
  const { data, error } = await admin
    .from("aiscore_private_settings")
    .select("secret_value")
    .eq("id", "api_football_key")
    .maybeSingle();

  if (error) throw new Error("BACKEND_SECRET_LOOKUP_FAILED");
  return data?.secret_value || null;
}

function hashKey(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function cachedApi(path: string, ttlSeconds: number) {
  const admin = adminClient();
  const cacheKey = "api:" + hashKey(path);
  const now = new Date();

  const { data: cached } = await admin
    .from("aiscore_api_cache")
    .select("payload,expires_at,source_updated_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached?.payload && cached?.expires_at && new Date(cached.expires_at) > now) {
    return {
      body: cached.payload,
      cached: true,
      fetchedAt: cached.source_updated_at || now.toISOString(),
      remaining: null,
    };
  }

  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("API_FOOTBALL_KEY_MISSING");

  const response = await fetch(API_BASE + path, {
    headers: { "x-apisports-key": apiKey },
  });
  const body = await response.json();
  const remaining = response.headers.get("x-ratelimit-requests-remaining");

  const errors = body?.errors;
  const hasErrors = Array.isArray(errors)
    ? errors.length > 0
    : errors && typeof errors === "object" && Object.keys(errors).length > 0;

  if (!response.ok || hasErrors) {
    const err: any = new Error("API_FOOTBALL_ERROR");
    err.status = response.status || 502;
    err.details = errors || body;
    throw err;
  }

  const fetchedAt = new Date().toISOString();
  await admin.from("aiscore_api_cache").upsert({
    cache_key: cacheKey,
    payload: body,
    source_updated_at: fetchedAt,
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    updated_at: fetchedAt,
  });

  return { body, cached: false, fetchedAt, remaining: remaining ? Number(remaining) : null };
}

function priorityScore(name = "") {
  const leagues = [
    "Premier League","La Liga","Champions League","Europa League","Serie A","Bundesliga",
    "Ligue 1","Eredivisie","Primeira Liga","Liga Portugal","Saudi Pro League",
    "Super Liga","SuperLiga","Jupiler Pro League","Pro League"
  ];
  const n = String(name).toLowerCase();
  const idx = leagues.findIndex((x) => n.includes(x.toLowerCase()));
  return idx < 0 ? 0 : leagues.length - idx;
}

function normalizeOdds(apiResponse: any[] = []) {
  const best = new Map<string, any>();
  const marketName = (name = "") => {
    const n = name.toLowerCase();
    if (n.includes("match winner") || n === "winner" || n.includes("1x2")) return "1X2";
    if (n.includes("double chance")) return "Double Chance";
    if (n.includes("draw no bet")) return "Draw No Bet";
    if (n.includes("both teams") || n.includes("btts")) return "BTTS";
    if ((n.includes("home") || n.includes("team 1")) && n.includes("total")) return "Home Team Goals";
    if ((n.includes("away") || n.includes("team 2")) && n.includes("total")) return "Away Team Goals";
    if (n.includes("goals over/under") || n.includes("over/under") || n === "goals") return "Goals";
    return null;
  };
  const selectionInfo = (market: string, rawValue = "") => {
    const value = String(rawValue).trim();
    const low = value.toLowerCase();
    if (market === "1X2") {
      if (["home","1"].includes(low)) return { selection: "Home", line: null };
      if (["draw","x"].includes(low)) return { selection: "Draw", line: null };
      if (["away","2"].includes(low)) return { selection: "Away", line: null };
    }
    if (market === "Double Chance") {
      if (["home/draw","1x","home or draw"].includes(low)) return { selection: "Home/Draw", line: null };
      if (["draw/away","x2","draw or away"].includes(low)) return { selection: "Draw/Away", line: null };
      if (["home/away","12","home or away"].includes(low)) return { selection: "Home/Away", line: null };
    }
    if (market === "Draw No Bet") {
      if (low.includes("home") || low === "1") return { selection: "Home", line: 0 };
      if (low.includes("away") || low === "2") return { selection: "Away", line: 0 };
    }
    if (market === "BTTS") {
      if (low === "yes") return { selection: "Yes", line: null };
      if (low === "no") return { selection: "No", line: null };
    }
    if (["Goals","Home Team Goals","Away Team Goals"].includes(market)) {
      const side = low.includes("over") ? "Over" : low.includes("under") ? "Under" : null;
      const nums = value.match(/[0-9]+(?:\.[0-9]+)?/g);
      const line = nums?.length ? Number(nums[nums.length - 1]) : null;
      if (side && Number.isFinite(line) && Math.abs((line as number) % 1 - 0.5) < 1e-9) return { selection: side, line };
    }
    return null;
  };

  for (const item of apiResponse || []) {
    const ts = item?.update || item?.fixture?.timestamp || null;
    for (const bookmaker of item?.bookmakers || []) {
      for (const bet of bookmaker?.bets || []) {
        const market = marketName(bet?.name || bet?.bet || "");
        if (!market) continue;
        for (const value of bet?.values || []) {
          const info = selectionInfo(market, value?.value);
          const odds = Number(value?.odd);
          if (!info || !Number.isFinite(odds) || odds <= 1) continue;
          const key = [market, info.selection, info.line ?? ""].join("|");
          const candidate = {
            market,
            selection: info.selection,
            line: info.line,
            odds,
            bookmaker: bookmaker?.name || null,
            bookmaker_id: bookmaker?.id || null,
            timestamp: ts,
            signal_key: key,
          };
          const prev = best.get(key);
          if (!prev || candidate.odds > prev.odds) best.set(key, candidate);
        }
      }
    }
  }
  return [...best.values()];
}

async function saveOddsHistory(fixtureId: number, normalizedOdds: any[]) {
  if (!fixtureId || !normalizedOdds.length) return;
  const admin = adminClient();
  const rows = normalizedOdds.map((o) => ({
    fixture_id: fixtureId,
    signal_key: o.signal_key,
    bookmaker: o.bookmaker,
    odds: o.odds,
    captured_at: o.timestamp || new Date().toISOString(),
  }));
  await admin.from("aiscore_odds_history").insert(rows);
}

async function today(req: Request, url: URL) {
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);
  const timezone = url.searchParams.get("timezone") || "Europe/Belgrade";
  const result = await cachedApi(
    "/fixtures?date=" + encodeURIComponent(date) + "&timezone=" + encodeURIComponent(timezone),
    CACHE_TTL.today
  );
  const fixtures = (result.body?.response || []).sort((a: any,b: any) => {
    const p = priorityScore(b?.league?.name) - priorityScore(a?.league?.name);
    if (p) return p;
    return new Date(a?.fixture?.date || 0).getTime() - new Date(b?.fixture?.date || 0).getTime();
  });
  return json(req, {
    data: fixtures,
    generated_at: new Date().toISOString(),
    data_last_updated: result.fetchedAt,
    cached: result.cached,
    credits_remaining: result.remaining,
  });
}

async function prematchBundle(req: Request, url: URL) {
  const fixtureId = Number(url.searchParams.get("fixture"));
  if (!Number.isFinite(fixtureId)) return json(req, { error: "Nedostaje fixture id" }, 400);

  const fixtureRes = await cachedApi("/fixtures?id=" + fixtureId, CACHE_TTL.fixture);
  const fixture = fixtureRes.body?.response?.[0];
  if (!fixture) return json(req, { error: "Fixture not found" }, 404);

  const homeId = fixture?.teams?.home?.id;
  const awayId = fixture?.teams?.away?.id;
  const leagueId = fixture?.league?.id;
  const season = fixture?.league?.season;

  const calls = await Promise.allSettled([
    cachedApi("/fixtures?team=" + homeId + "&last=10&status=FT", CACHE_TTL.recent),
    cachedApi("/fixtures?team=" + awayId + "&last=10&status=FT", CACHE_TTL.recent),
    cachedApi("/teams/statistics?league=" + leagueId + "&season=" + season + "&team=" + homeId, CACHE_TTL.teamStats),
    cachedApi("/teams/statistics?league=" + leagueId + "&season=" + season + "&team=" + awayId, CACHE_TTL.teamStats),
    cachedApi("/fixtures/headtohead?h2h=" + homeId + "-" + awayId + "&last=10", CACHE_TTL.h2h),
    cachedApi("/injuries?fixture=" + fixtureId, CACHE_TTL.injuries),
    cachedApi("/fixtures/lineups?fixture=" + fixtureId, CACHE_TTL.lineups),
    cachedApi("/standings?league=" + leagueId + "&season=" + season, CACHE_TTL.standings),
    cachedApi("/odds?fixture=" + fixtureId, CACHE_TTL.prematchOdds),
  ]);

  const value = (i: number) => calls[i].status === "fulfilled" ? (calls[i] as PromiseFulfilledResult<any>).value : null;
  const homeRecent = value(0)?.body?.response || [];
  const awayRecent = value(1)?.body?.response || [];
  const homeTeamStats = value(2)?.body?.response || null;
  const awayTeamStats = value(3)?.body?.response || null;
  const h2h = value(4)?.body?.response || [];
  const injuries = value(5)?.body?.response || [];
  const lineups = value(6)?.body?.response || [];
  const standings = value(7)?.body?.response || [];
  const oddsRaw = value(8)?.body?.response || [];
  const odds = normalizeOdds(oddsRaw);
  await saveOddsHistory(fixtureId, odds);

  const timestamps = calls
    .filter((x) => x.status === "fulfilled")
    .map((x: any) => x.value?.fetchedAt)
    .filter(Boolean)
    .sort();
  const latest = timestamps[timestamps.length - 1] || fixtureRes.fetchedAt;

  return json(req, {
    fixture,
    home_recent: homeRecent,
    away_recent: awayRecent,
    home_team_stats: homeTeamStats,
    away_team_stats: awayTeamStats,
    h2h,
    injuries,
    lineups,
    standings,
    odds,
    availability: {
      fixture: true,
      home_recent: !!homeRecent.length,
      away_recent: !!awayRecent.length,
      home_team_stats: !!homeTeamStats,
      away_team_stats: !!awayTeamStats,
      h2h: !!h2h.length,
      injuries: calls[5].status === "fulfilled",
      lineups: calls[6].status === "fulfilled" && !!lineups.length,
      standings: calls[7].status === "fulfilled" && !!standings.length,
      odds: calls[8].status === "fulfilled" && !!odds.length,
      xg: false,
      weather: false,
      referee_stats: false,
      projected_lineup: false,
    },
    analysis_generated_at: new Date().toISOString(),
    data_last_updated: latest,
  });
}

async function liveBundle(req: Request, url: URL) {
  const fixtureId = Number(url.searchParams.get("fixture"));
  if (!Number.isFinite(fixtureId)) {
    const live = await cachedApi("/fixtures?live=all", CACHE_TTL.fixture);
    return json(req, {
      data: live.body?.response || [],
      data_last_updated: live.fetchedAt,
      credits_remaining: live.remaining,
    });
  }

  const calls = await Promise.allSettled([
    cachedApi("/fixtures?id=" + fixtureId, CACHE_TTL.fixture),
    cachedApi("/fixtures/statistics?fixture=" + fixtureId, CACHE_TTL.liveStats),
    cachedApi("/fixtures/events?fixture=" + fixtureId, CACHE_TTL.events),
    cachedApi("/fixtures/lineups?fixture=" + fixtureId, CACHE_TTL.lineups),
    cachedApi("/odds/live?fixture=" + fixtureId, CACHE_TTL.liveOdds),
  ]);
  const value = (i: number) => calls[i].status === "fulfilled" ? (calls[i] as PromiseFulfilledResult<any>).value : null;
  const fixture = value(0)?.body?.response?.[0] || null;
  const stats = value(1)?.body?.response || [];
  const events = value(2)?.body?.response || [];
  const lineups = value(3)?.body?.response || [];
  const oddsRaw = value(4)?.body?.response || [];
  const odds = normalizeOdds(oddsRaw);
  if (fixture?.fixture?.id) await saveOddsHistory(fixture.fixture.id, odds);

  const timestamps = calls
    .filter((x) => x.status === "fulfilled")
    .map((x: any) => x.value?.fetchedAt)
    .filter(Boolean)
    .sort();

  return json(req, {
    fixture,
    stats,
    events,
    lineups,
    odds,
    availability: {
      fixture: !!fixture,
      stats: calls[1].status === "fulfilled" && !!stats.length,
      events: calls[2].status === "fulfilled",
      lineups: calls[3].status === "fulfilled" && !!lineups.length,
      live_odds: calls[4].status === "fulfilled" && !!odds.length,
      xg: false,
      dangerous_attacks: false,
    },
    analysis_generated_at: new Date().toISOString(),
    data_last_updated: timestamps[timestamps.length - 1] || new Date().toISOString(),
  });
}

async function saveAnalysis(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.analysis || !Array.isArray(body?.picks)) return json(req, { error: "Invalid analysis payload" }, 400);
  const a = body.analysis;
  const admin = adminClient();

  const analysisRow = {
    fixture_id: a.fixture_id,
    mode: a.mode,
    league_id: a.league_id ?? null,
    league_name: a.league_name ?? null,
    home_team_id: a.home_team_id ?? null,
    home_team_name: a.home_team_name ?? null,
    away_team_id: a.away_team_id ?? null,
    away_team_name: a.away_team_name ?? null,
    match_date: a.match_date ?? null,
    match_status: a.match_status ?? null,
    minute: a.minute ?? null,
    score_home: a.score_home ?? null,
    score_away: a.score_away ?? null,
    state_hash: String(a.state_hash),
    data_quality: a.data_quality,
    data_quality_score: a.data_quality_score,
    confidence: a.confidence,
    verdict: a.verdict,
    analysis_generated_at: a.analysis_generated_at || new Date().toISOString(),
    data_last_updated: a.data_last_updated || null,
    source_snapshot: a.source_snapshot || {},
  };

  const { data: analysis, error } = await admin
    .from("aiscore_analyses")
    .upsert(analysisRow, { onConflict: "fixture_id,mode,state_hash" })
    .select("*")
    .single();
  if (error) return json(req, { error: "Cannot save analysis", details: error.message }, 500);

  const picks = body.picks.slice(0,3).map((p: any, idx: number) => ({
    analysis_id: analysis.id,
    pick_rank: p.rank || idx + 1,
    signal_key: p.signal_key || p.signalKey || ("NO_QUALIFIED_BET|" + (idx + 1)),
    market: p.market || "NO QUALIFIED BET",
    selection: p.selection || "NO QUALIFIED BET",
    line: p.line ?? null,
    bookmaker: p.bookmaker ?? null,
    odds: p.odds ?? null,
    odds_timestamp: p.timestamp || p.odds_timestamp || null,
    ai_probability: p.ai_probability ?? p.aiProbability ?? null,
    implied_probability: p.implied_probability ?? p.impliedProbability ?? null,
    fair_odds: p.fair_odds ?? p.fairOdds ?? null,
    edge_pp: p.edge_pp ?? p.edgePP ?? null,
    ev_pct: p.ev_pct ?? p.evPct ?? null,
    confidence: p.confidence || "LOW",
    stake_units: p.stake_units ?? p.stakeUnits ?? 0,
    status: p.status || "NO_QUALIFIED_BET",
    why: p.why ?? null,
    main_risk: p.main_risk ?? p.mainRisk ?? null,
  }));

  await admin.from("aiscore_analysis_picks").delete().eq("analysis_id", analysis.id);
  const { error: pickError } = await admin.from("aiscore_analysis_picks").insert(picks);
  if (pickError) return json(req, { error: "Cannot save picks", details: pickError.message }, 500);

  return json(req, { analysis_id: analysis.id, saved: true });
}

async function history(req: Request, url: URL) {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const admin = adminClient();
  const { data, error } = await admin
    .from("aiscore_analyses")
    .select("*,aiscore_analysis_picks(*)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return json(req, { error: "Cannot load history", details: error.message }, 500);
  return json(req, { data: data || [] });
}

async function analytics(req: Request, url: URL) {
  const days = url.searchParams.get("days");
  const mode = url.searchParams.get("mode");
  const market = url.searchParams.get("market");
  const confidence = url.searchParams.get("confidence");
  const league = url.searchParams.get("league");
  const admin = adminClient();

  let query = admin
    .from("aiscore_analysis_picks")
    .select("*,aiscore_analyses!inner(mode,league_name,match_date)")
    .not("status", "eq", "NO_QUALIFIED_BET");

  if (days && Number(days) > 0) {
    const since = new Date(Date.now() - Number(days) * 86400000).toISOString();
    query = query.gte("created_at", since);
  }
  if (mode === "prematch" || mode === "live") query = query.eq("aiscore_analyses.mode", mode);
  if (market) query = query.eq("market", market);
  if (confidence) query = query.eq("confidence", confidence);
  if (league) query = query.eq("aiscore_analyses.league_name", league);

  const { data, error } = await query;
  if (error) return json(req, { error: "Cannot load analytics", details: error.message }, 500);

  const picks = data || [];
  const settled = picks.filter((p: any) => ["WIN","LOSS","VOID"].includes(p.result));
  const wins = settled.filter((p: any) => p.result === "WIN").length;
  const losses = settled.filter((p: any) => p.result === "LOSS").length;
  const voids = settled.filter((p: any) => p.result === "VOID").length;
  const risked = settled.reduce((s: number,p: any) => s + Number(p.stake_units || 0), 0);
  const profit = settled.reduce((s: number,p: any) => {
    const stake = Number(p.stake_units || 0);
    if (p.result === "WIN") return s + stake * (Number(p.odds || 1) - 1);
    if (p.result === "LOSS") return s - stake;
    return s;
  }, 0);

  const avg = (field: string) => {
    const vals = picks.map((p: any) => Number(p[field])).filter(Number.isFinite);
    return vals.length ? vals.reduce((a: number,b: number) => a + b, 0) / vals.length : null;
  };

  const group = (field: string) => {
    const map: Record<string,any> = {};
    for (const p of settled) {
      const key = String(p[field] ?? "Other");
      if (!map[key]) map[key] = { total:0,wins:0,losses:0,voids:0 };
      map[key].total++;
      if (p.result === "WIN") map[key].wins++;
      if (p.result === "LOSS") map[key].losses++;
      if (p.result === "VOID") map[key].voids++;
    }
    return map;
  };

  const byLeague: Record<string,any> = {};
  for (const p of settled) {
    const key = String(p.aiscore_analyses?.league_name || "Other");
    if (!byLeague[key]) byLeague[key] = { total:0,wins:0,losses:0,voids:0 };
    byLeague[key].total++;
    if (p.result === "WIN") byLeague[key].wins++;
    if (p.result === "LOSS") byLeague[key].losses++;
    if (p.result === "VOID") byLeague[key].voids++;
  }

  return json(req, {
    total_picks: picks.length,
    settled: settled.length,
    wins, losses, voids,
    win_rate: wins + losses ? wins / (wins + losses) : null,
    average_odds: avg("odds"),
    average_edge_pp: avg("edge_pp"),
    average_ev_pct: avg("ev_pct"),
    units: profit,
    roi: risked ? profit / risked : null,
    average_clv_pct: avg("clv_pct"),
    by_market: group("market"),
    by_confidence: group("confidence"),
    by_league: byLeague,
  });
}

async function oddsHistory(req: Request, url: URL) {
  const fixtureId = Number(url.searchParams.get("fixture"));
  if (!Number.isFinite(fixtureId)) return json(req, { error: "Nedostaje fixture id" }, 400);
  const admin = adminClient();
  const { data, error } = await admin
    .from("aiscore_odds_history")
    .select("signal_key,bookmaker,odds,captured_at")
    .eq("fixture_id", fixtureId)
    .order("captured_at", { ascending: true })
    .limit(1000);
  if (error) return json(req, { error: "Cannot load odds history", details: error.message }, 500);

  const grouped: Record<string, any> = {};
  for (const row of data || []) {
    if (!grouped[row.signal_key]) grouped[row.signal_key] = {
      signal_key: row.signal_key,
      opening_odds: Number(row.odds),
      opening_at: row.captured_at,
      opening_bookmaker: row.bookmaker,
      current_odds: Number(row.odds),
      current_at: row.captured_at,
      current_bookmaker: row.bookmaker,
      observations: 0,
    };
    grouped[row.signal_key].current_odds = Number(row.odds);
    grouped[row.signal_key].current_at = row.captured_at;
    grouped[row.signal_key].current_bookmaker = row.bookmaker;
    grouped[row.signal_key].observations++;
  }
  return json(req, { data: Object.values(grouped) });
}

function settleOne(p: any, fixture: any) {
  const short = fixture?.fixture?.status?.short;
  if (!["FT","AET","PEN"].includes(short)) return null;
  const home = Number(fixture?.goals?.home);
  const away = Number(fixture?.goals?.away);
  if (![home,away].every(Number.isFinite)) return null;
  const total = home + away;
  const market = String(p.market || "");
  const selection = String(p.selection || "").toLowerCase();
  const line = Number(p.line);

  if (market === "1X2") {
    const result = home > away ? "home" : home < away ? "away" : "draw";
    return result === selection ? "WIN" : "LOSS";
  }
  if (market === "Double Chance") {
    if (selection === "home/draw") return home >= away ? "WIN" : "LOSS";
    if (selection === "draw/away") return away >= home ? "WIN" : "LOSS";
    if (selection === "home/away") return home !== away ? "WIN" : "LOSS";
  }
  if (market === "Draw No Bet") {
    if (home === away) return "VOID";
    if (selection === "home") return home > away ? "WIN" : "LOSS";
    if (selection === "away") return away > home ? "WIN" : "LOSS";
  }
  if (market === "BTTS") {
    const yes = home > 0 && away > 0;
    if (selection === "yes") return yes ? "WIN" : "LOSS";
    if (selection === "no") return !yes ? "WIN" : "LOSS";
  }
  if (market === "Goals" && Number.isFinite(line)) {
    if (selection === "over") return total > line ? "WIN" : total === line ? "VOID" : "LOSS";
    if (selection === "under") return total < line ? "WIN" : total === line ? "VOID" : "LOSS";
  }
  if (market === "Home Team Goals" && Number.isFinite(line)) {
    if (selection === "over") return home > line ? "WIN" : home === line ? "VOID" : "LOSS";
    if (selection === "under") return home < line ? "WIN" : home === line ? "VOID" : "LOSS";
  }
  if (market === "Away Team Goals" && Number.isFinite(line)) {
    if (selection === "over") return away > line ? "WIN" : away === line ? "VOID" : "LOSS";
    if (selection === "under") return away < line ? "WIN" : away === line ? "VOID" : "LOSS";
  }
  return null;
}

async function settle(req: Request) {
  const admin = adminClient();
  const { data: picks, error } = await admin
    .from("aiscore_analysis_picks")
    .select("*,aiscore_analyses!inner(fixture_id,source_snapshot)")
    .is("result", null)
    .eq("status", "QUALIFIED")
    .limit(100);
  if (error) return json(req, { error: "Cannot load unsettled picks", details: error.message }, 500);

  let updated = 0;
  const byFixture = new Map<number, any[]>();
  for (const p of picks || []) {
    const fixtureId = Number(p.aiscore_analyses?.fixture_id);
    if (!fixtureId) continue;
    if (!byFixture.has(fixtureId)) byFixture.set(fixtureId, []);
    byFixture.get(fixtureId)!.push(p);
  }

  for (const [fixtureId, list] of byFixture.entries()) {
    try {
      const f = await cachedApi("/fixtures?id=" + fixtureId, 30);
      const fixture = f.body?.response?.[0];
      if (!fixture) continue;

      let closingOdds: any[] = [];
      try {
        const o = await cachedApi("/odds?fixture=" + fixtureId, 60);
        closingOdds = normalizeOdds(o.body?.response || []);
      } catch {}

      for (const pick of list) {
        const result = settleOne(pick, fixture);
        if (!result) continue;
        const close = closingOdds.find((o) => o.signal_key === pick.signal_key);
        const clv = close?.odds && pick.odds ? (Number(pick.odds) / Number(close.odds) - 1) * 100 : null;
        await admin.from("aiscore_analysis_picks").update({
          result,
          closing_odds: close?.odds || null,
          clv_pct: clv,
          settled_at: new Date().toISOString(),
        }).eq("id", pick.id);

        const review = {
          result,
          causal_attribution: "NOT_AUTOMATICALLY_INFERRED",
          original_edge_pp: pick.edge_pp,
          original_ev_pct: pick.ev_pct,
          original_data_snapshot: pick.aiscore_analyses?.source_snapshot || {},
          closing_odds: close?.odds || null,
          clv_pct: clv,
          notes: result === "LOSS"
            ? (clv !== null && clv > 0
                ? ["Outcome lost, but recorded closing price was shorter than the original signal price.", "Do not change strategy from one result; review over a larger sample."]
                : ["Outcome lost. Result alone is not enough to infer a model flaw.", "Review data quality, lineup certainty and sample size over a larger sample."])
            : result === "WIN"
              ? ["Outcome won. Win alone is not evidence that the model was correctly calibrated.", "Keep evaluating edge, CLV and larger-sample performance."]
              : ["Market settled void; preserve the original signal and exclude from win/loss rate."],
        };
        await admin.from("aiscore_model_reviews").upsert({
          pick_id: pick.id,
          review,
        }, { onConflict: "pick_id" });
        updated++;
      }
    } catch {}
  }

  return json(req, { updated });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "today";

    if (req.method === "GET" && action === "today") return await today(req, url);
    if (req.method === "GET" && action === "prematch_bundle") return await prematchBundle(req, url);
    if (req.method === "GET" && action === "live_bundle") return await liveBundle(req, url);
    if (req.method === "GET" && action === "history") return await history(req, url);
    if (req.method === "GET" && action === "analytics") return await analytics(req, url);
    if (req.method === "GET" && action === "odds_history") return await oddsHistory(req, url);
    if (req.method === "POST" && action === "save_analysis") return await saveAnalysis(req);
    if (req.method === "POST" && action === "settle") return await settle(req);

    return json(req, { error: "Unknown action" }, 404);
  } catch (error) {
    const message = String((error as Error)?.message || error);
    if (message === "API_FOOTBALL_KEY_MISSING") {
      return json(req, { error: "API_FOOTBALL_KEY nije podesen na backendu" }, 503);
    }
    return json(req, {
      error: "AIScore backend error",
      details: (error as any)?.details || message,
    }, Number((error as any)?.status || 500));
  }
});
