import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SOURCES = [
  "https://www.sofascore.com/api/v1",
  "https://api.sofascore.com/api/v1",
];
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
async function publicFetch(path: string) {
  let last: any = null;
  for (const base of SOURCES) {
    try {
      const res = await fetch(base + path, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 AIScore/1.0",
          "Referer": "https://www.sofascore.com/",
        },
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) return body;
      last = { status: res.status, body };
    } catch (e) {
      last = String(e);
    }
  }
  const err: any = new Error("PUBLIC_SOURCE_UNAVAILABLE");
  err.details = last;
  throw err;
}

function statusShort(event: any) {
  const t = String(event?.status?.type || "").toLowerCase();
  const d = String(event?.status?.description || "").toLowerCase();
  if (t === "notstarted" || d.includes("not started") || d.includes("scheduled")) return "NS";
  if (t === "finished" || d.includes("finished")) return "FT";
  if (t === "canceled" || d.includes("cancel")) return "CANC";
  if (t === "postponed" || d.includes("postpon")) return "PST";
  if (t === "inprogress" || t === "live") return "LIVE";
  return t ? t.toUpperCase() : "NS";
}
function scoreValue(score: any) {
  const v = score?.current ?? score?.display ?? score?.normaltime ?? null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalizeEvent(event: any) {
  const tournament = event?.tournament || {};
  const unique = tournament?.uniqueTournament || {};
  return {
    fixture: {
      id: event?.id ?? null,
      date: event?.startTimestamp ? new Date(Number(event.startTimestamp) * 1000).toISOString() : null,
      status: {
        short: statusShort(event),
        long: event?.status?.description || event?.status?.type || "Scheduled",
        elapsed: null,
      },
      referee: event?.referee?.name || null,
    },
    league: {
      id: unique?.id ?? tournament?.id ?? null,
      name: unique?.name || tournament?.name || "Unknown League",
      season: event?.season?.id ?? null,
      round: event?.roundInfo?.round != null ? String(event.roundInfo.round) : null,
    },
    teams: {
      home: { id: event?.homeTeam?.id ?? null, name: event?.homeTeam?.name || "Home", logo: null },
      away: { id: event?.awayTeam?.id ?? null, name: event?.awayTeam?.name || "Away", logo: null },
    },
    goals: {
      home: scoreValue(event?.homeScore),
      away: scoreValue(event?.awayScore),
    },
    _public_source: {
      source: "Sofascore public website data",
      tournament_id: tournament?.id ?? null,
      unique_tournament_id: unique?.id ?? null,
      season_id: event?.season?.id ?? null,
    },
  };
}
function onlyPrematch(events: any[]) {
  return (events || []).filter((e) => statusShort(e) === "NS");
}
function fractionalToDecimal(value: any) {
  if (value == null) return null;
  const s = String(value).trim();
  const direct = Number(s);
  if (Number.isFinite(direct) && direct > 1) return direct;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return 1 + a / b;
}
function marketRows(payload: any) {
  const rows: any[] = [];
  const roots = [
    ...(Array.isArray(payload?.markets) ? payload.markets : []),
    ...(Array.isArray(payload?.data?.markets) ? payload.data.markets : []),
  ];
  for (const market of roots) {
    const marketName = String(market?.marketName || market?.name || "").trim();
    for (const choice of market?.choices || market?.outcomes || []) {
      rows.push({
        marketName,
        name: choice?.name || choice?.label || choice?.choiceName || "",
        odds: fractionalToDecimal(choice?.fractionalValue ?? choice?.odds ?? choice?.decimalValue),
        initialOdds: fractionalToDecimal(choice?.initialFractionalValue),
        source: market?.sourceName || market?.bookmaker?.name || payload?.bookmaker?.name || "Public odds",
      });
    }
  }
  return rows;
}
function mapOdds(payload: any) {
  const rows = marketRows(payload);
  const out: any[] = [];
  for (const r of rows) {
    if (!r.odds || r.odds <= 1) continue;
    const m = r.marketName.toLowerCase();
    const n = String(r.name).toLowerCase();
    let market: any = null, selection: any = null, line: any = null;

    if (m.includes("full time") || m.includes("match result") || m === "1x2" || m.includes("winner")) {
      market = "1X2";
      if (["1","home"].includes(n) || n.includes("home")) selection = "Home";
      else if (["x","draw"].includes(n)) selection = "Draw";
      else if (["2","away"].includes(n) || n.includes("away")) selection = "Away";
    } else if (m.includes("double chance")) {
      market = "Double Chance";
      if (n.includes("1x") || n.includes("home/draw")) selection = "Home/Draw";
      else if (n.includes("x2") || n.includes("draw/away")) selection = "Draw/Away";
      else if (n.includes("12") || n.includes("home/away")) selection = "Home/Away";
    } else if (m.includes("draw no bet")) {
      market = "Draw No Bet";
      if (n.includes("home") || n === "1") selection = "Home";
      else if (n.includes("away") || n === "2") selection = "Away";
      line = 0;
    } else if (m.includes("both teams") || m.includes("btts")) {
      market = "BTTS";
      if (n.includes("yes")) selection = "Yes";
      else if (n.includes("no")) selection = "No";
    } else if (m.includes("total") || m.includes("goals") || m.includes("over/under")) {
      market = "Goals";
      if (n.includes("over")) selection = "Over";
      else if (n.includes("under")) selection = "Under";
      const nums = (r.name + " " + r.marketName).match(/[0-9]+(?:\.[0-9]+)?/g);
      if (nums?.length) line = Number(nums[nums.length - 1]);
    }
    if (!market || !selection) continue;
    const signal_key = [market, selection, line ?? ""].join("|");
    out.push({
      market, selection, line, odds: r.odds, signal_key,
      bookmaker: r.source,
      timestamp: new Date().toISOString(),
      opening_odds: r.initialOdds,
    });
  }
  const best = new Map<string, any>();
  for (const row of out) {
    const prev = best.get(row.signal_key);
    if (!prev || row.odds > prev.odds) best.set(row.signal_key, row);
  }
  return [...best.values()];
}
async function safe(path: string, fallback: any) {
  try { return await publicFetch(path); } catch { return fallback; }
}
async function recentTeam(teamId: number) {
  if (!teamId) return [];
  for (let page = 0; page < 3; page++) {
    const body = await safe("/team/" + teamId + "/events/last/" + page, { events: [] });
    const ev = Array.isArray(body?.events) ? body.events : [];
    if (ev.length) return ev.filter((e:any) => statusShort(e) === "FT").slice(0, 10).map(normalizeEvent);
  }
  return [];
}
async function eventOdds(eventId: number) {
  const candidates = [
    "/event/" + eventId + "/odds/1/all",
    "/event/" + eventId + "/odds/1",
  ];
  for (const p of candidates) {
    const body = await safe(p, null);
    if (body) {
      const mapped = mapOdds(body);
      if (mapped.length) return mapped;
    }
  }
  return [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "GET") return json(req, { error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "health";
  try {
    if (action === "health") {
      const date = new Date().toISOString().slice(0,10);
      const body = await publicFetch("/sport/football/scheduled-events/" + date);
      return json(req, {
        ok: true,
        provider: "Sofascore public website data",
        api_key_required: false,
        prematch_only: true,
        sample_events: Array.isArray(body?.events) ? body.events.length : 0,
        checked_at: new Date().toISOString(),
      });
    }

    if (action === "today") {
      const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);
      const body = await publicFetch("/sport/football/scheduled-events/" + date);
      const events = onlyPrematch(Array.isArray(body?.events) ? body.events : []);
      const normalized = events.map(normalizeEvent).sort((a:any,b:any) =>
        new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
      );
      return json(req, {
        data: normalized,
        provider: "Sofascore public website data",
        api_key_required: false,
        prematch_only: true,
        data_last_updated: new Date().toISOString(),
      });
    }

    if (action === "prematch_bundle") {
      const eventId = Number(url.searchParams.get("fixture"));
      if (!Number.isFinite(eventId)) return json(req, { error: "Nedostaje fixture id" }, 400);

      const detail = await publicFetch("/event/" + eventId);
      const raw = detail?.event || detail;
      if (!raw?.id) return json(req, { error: "Meč nije pronađen" }, 404);
      const fixture = normalizeEvent(raw);
      const homeId = fixture.teams.home.id;
      const awayId = fixture.teams.away.id;

      const [homeRecent, awayRecent, h2hBody, lineupsBody, odds] = await Promise.all([
        recentTeam(homeId),
        recentTeam(awayId),
        safe("/event/" + eventId + "/h2h/0/events", { events: [] }),
        safe("/event/" + eventId + "/lineups", null),
        eventOdds(eventId),
      ]);
      const h2h = (Array.isArray(h2hBody?.events) ? h2hBody.events : []).slice(0,10).map(normalizeEvent);
      const hasLineups = !!lineupsBody && (
        Array.isArray(lineupsBody?.home?.players) || Array.isArray(lineupsBody?.away?.players)
      );
      const toTeam = (side:any, fallback:any) => {
        const players = Array.isArray(side?.players) ? side.players : [];
        return {
          team: { id: fallback?.id, name: fallback?.name },
          startXI: players.filter((p:any) => p?.substitute !== true).slice(0,11).map((p:any) => ({
            player: { id: p?.player?.id, name: p?.player?.name || "Unknown" }
          })),
          substitutes: players.filter((p:any) => p?.substitute === true).map((p:any) => ({
            player: { id: p?.player?.id, name: p?.player?.name || "Unknown" }
          })),
        };
      };
      const lineups = hasLineups ? [
        toTeam(lineupsBody?.home, fixture.teams.home),
        toTeam(lineupsBody?.away, fixture.teams.away),
      ] : [];

      return json(req, {
        fixture,
        home_recent: homeRecent,
        away_recent: awayRecent,
        home_team_stats: null,
        away_team_stats: null,
        h2h,
        injuries: [],
        lineups,
        projected_lineup: null,
        standings: [],
        odds,
        lineup_confirmed: hasLineups ? true : null,
        availability: {
          fixture: true,
          home_recent: homeRecent.length > 0,
          away_recent: awayRecent.length > 0,
          home_team_stats: false,
          away_team_stats: false,
          h2h: h2h.length > 0,
          injuries: false,
          lineups: hasLineups,
          projected_lineup: false,
          standings: false,
          odds: odds.length > 0,
          xg: false,
          weather: false,
          referee_stats: false,
        },
        provider: "Sofascore public website data",
        api_key_required: false,
        prematch_only: true,
        analysis_generated_at: new Date().toISOString(),
        data_last_updated: new Date().toISOString(),
      });
    }

    return json(req, { error: "Unknown action" }, 404);
  } catch (e) {
    return json(req, {
      error: "Javni izvor trenutno nije dostupan",
      details: (e as any)?.details || String((e as Error)?.message || e),
    }, 503);
  }
});
