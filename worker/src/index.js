const SESSION_COOKIE = "taengle_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 100000;
const ODDS_BASE = "https://api.the-odds-api.com/v4";

const json = (data, status = 200, request, env, extra = {}) => {
  const origin = request?.headers.get("Origin") || "";
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowedOrigin(request, env),
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    ...extra,
  };
  return new Response(JSON.stringify(data), { status, headers });
};

const text = (value) => new TextEncoder().encode(value);
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const hex = (bytes) => [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, "0")).join("");
const nowIso = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function allowedOrigin(request, env) {
  const origin = request?.headers.get("Origin") || "";
  const allowed = String(env?.CORS_ORIGIN || "*").split(",").map((value) => value.trim()).filter(Boolean);
  if (allowed.includes("*")) return origin || "*";
  return allowed.includes(origin) ? origin : allowed[0] || "*";
}

async function sha256(value) {
  return crypto.subtle.digest("SHA-256", typeof value === "string" ? text(value) : value);
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", text(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return hex(bits);
}

async function encryptionKey(env) {
  return crypto.subtle.importKey("raw", await sha256(env.API_KEY_ENCRYPTION_SECRET), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptApiKey(apiKey, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), text(apiKey));
  return { ciphertext: b64(encrypted), iv: b64(iv) };
}

async function decryptApiKey(row, env) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(row.api_key_iv) },
    await encryptionKey(env),
    fromB64(row.api_key_ciphertext),
  );
  return new TextDecoder().decode(plain);
}

function cookie(name, value, maxAge = SESSION_TTL_MS / 1000) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name) {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function sessionToken(request) {
  const raw = request.headers.get("Cookie") || "";
  const match = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}

async function sessionUser(request, env) {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = hex(await sha256(token));
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, s.id AS session_id, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
  ).bind(tokenHash, nowIso()).first();
  return row || null;
}

async function createSession(userId, env) {
  const token = id().replaceAll("-", "");
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(hex(await sha256(token)), userId, expires, nowIso()).run();
  return token;
}

function publicUser(user) {
  return { id: user.id, username: user.username };
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function username(value) {
  return String(value || "").trim().toLowerCase();
}

function validUsername(value) {
  return /^[a-z0-9가-힣_]{2,24}$/.test(value);
}

function validPassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

async function authSignup(request, env) {
  const input = await body(request);
  const name = username(input.username);
  if (!validUsername(name) || !validPassword(input.password)) {
    return json({ error: "아이디는 2~24자, 비밀번호는 8~128자로 입력하세요." }, 400, request, env);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const userId = id();
  try {
    await env.DB.prepare(
      "INSERT INTO users (id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(userId, name, await passwordHash(input.password, salt), b64(salt), nowIso()).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) return json({ error: "이미 사용 중인 아이디입니다." }, 409, request, env);
    throw error;
  }
  const token = await createSession(userId, env);
  return json({ user: { id: userId, username: name }, keyConfigured: false }, 201, request, env, { "Set-Cookie": cookie(SESSION_COOKIE, token) });
}

async function authLogin(request, env) {
  const input = await body(request);
  const name = username(input.username);
  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(name).first();
  if (!user || !validPassword(input.password) || (await passwordHash(input.password, fromB64(user.password_salt))) !== user.password_hash) {
    return json({ error: "아이디 또는 비밀번호가 맞지 않습니다." }, 401, request, env);
  }
  const token = await createSession(user.id, env);
  const key = await env.DB.prepare("SELECT key_last4 FROM api_credentials WHERE user_id = ?").bind(user.id).first();
  return json({ user: publicUser(user), keyConfigured: Boolean(key), keyLast4: key?.key_last4 || null }, 200, request, env, { "Set-Cookie": cookie(SESSION_COOKIE, token) });
}

async function authLogout(request, env) {
  const token = sessionToken(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(hex(await sha256(token))).run();
  return json({ ok: true }, 200, request, env, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
}

async function me(request, env, user) {
  const key = await env.DB.prepare("SELECT key_last4, updated_at FROM api_credentials WHERE user_id = ?").bind(user.id).first();
  const watches = await listWatches(env, user.id);
  return json({ user: publicUser(user), keyConfigured: Boolean(key), keyLast4: key?.key_last4 || null, keyUpdatedAt: key?.updated_at || null, watches }, 200, request, env);
}

async function saveApiKey(request, env, user) {
  const input = await body(request);
  const apiKey = String(input.apiKey || "").trim();
  if (!/^[a-zA-Z0-9]{24,64}$/.test(apiKey)) return json({ error: "The Odds API 키 형식을 확인하세요." }, 400, request, env);
  const check = await fetch(`${ODDS_BASE}/sports/?apiKey=${encodeURIComponent(apiKey)}`);
  if (!check.ok) return json({ error: "API 키 검증에 실패했습니다." }, 400, request, env);
  const encrypted = await encryptApiKey(apiKey, env);
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO api_credentials (user_id, api_key_ciphertext, api_key_iv, key_last4, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET api_key_ciphertext=excluded.api_key_ciphertext, api_key_iv=excluded.api_key_iv, key_last4=excluded.key_last4, updated_at=excluded.updated_at`,
  ).bind(user.id, encrypted.ciphertext, encrypted.iv, apiKey.slice(-4), now, now).run();
  return json({ ok: true, keyConfigured: true, keyLast4: apiKey.slice(-4) }, 200, request, env);
}

async function deleteApiKey(request, env, user) {
  await env.DB.prepare("DELETE FROM api_credentials WHERE user_id = ?").bind(user.id).run();
  return json({ ok: true, keyConfigured: false }, 200, request, env);
}

function watchPublic(row) {
  return {
    id: row.id,
    marketId: row.market_id,
    sportKey: row.sport_key,
    marketType: row.market_type || "h2h",
    totalPoint: row.total_point == null ? null : Number(row.total_point),
    league: row.league,
    home: row.home,
    away: row.away,
    kickoffUtc: row.kickoff_utc,
    enabled: Boolean(row.enabled),
    refreshFrom: row.refresh_from,
    refreshUntil: row.refresh_until,
    lastFetchedAt: row.last_fetched_at,
    lastError: row.last_error,
  };
}

async function listWatches(env, userId) {
  const result = await env.DB.prepare("SELECT * FROM watches WHERE user_id = ? ORDER BY kickoff_utc ASC").bind(userId).all();
  return (result.results || []).map(watchPublic);
}

async function createWatch(request, env, user) {
  const input = await body(request);
  const marketId = String(input.marketId || "").trim();
  const sportKey = String(input.sportKey || "").trim();
  const marketType = input.marketType === "totals" ? "totals" : "h2h";
  const totalPoint = input.totalPoint == null ? null : Number(input.totalPoint);
  const kickoff = new Date(input.kickoffUtc);
  const betman = input.betman && typeof input.betman === "object" ? input.betman : null;
  const validBetman = marketType === "totals" ? betman && betman.over > 0 && betman.under > 0 && Number.isFinite(totalPoint) : betman && betman.win > 0 && betman.lose > 0;
  if (!marketId || !sportKey || Number.isNaN(kickoff.getTime()) || !validBetman) {
    return json({ error: "경기 식별자, 킥오프, 베트맨 배당을 확인하세요." }, 400, request, env);
  }
  const credential = await env.DB.prepare("SELECT key_last4 FROM api_credentials WHERE user_id = ?").bind(user.id).first();
  if (!credential) return json({ error: "먼저 본인 The Odds API 키를 등록하세요." }, 400, request, env);
  const kickoffUtc = kickoff.toISOString();
  const now = nowIso();
  const watch = {
    id: id(),
    userId: user.id,
    marketId,
    sportKey,
    league: String(input.league || "-"),
    home: String(input.home || "-"),
    away: String(input.away || "-"),
    kickoffUtc,
    marketType,
    totalPoint,
    betman: JSON.stringify(marketType === "totals"
      ? { over: Number(betman.over), under: Number(betman.under) }
      : { win: Number(betman.win), draw: betman.draw ? Number(betman.draw) : null, lose: Number(betman.lose) }),
    refreshFrom: new Date(kickoff.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    refreshUntil: kickoffUtc,
    now,
  };
  await env.DB.prepare(
    `INSERT INTO watches (id, user_id, market_id, sport_key, market_type, total_point, league, home, away, kickoff_utc, betman_json, enabled, refresh_from, refresh_until, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(user_id, market_id) DO UPDATE SET sport_key=excluded.sport_key, market_type=excluded.market_type, total_point=excluded.total_point, league=excluded.league, home=excluded.home, away=excluded.away, kickoff_utc=excluded.kickoff_utc, betman_json=excluded.betman_json, refresh_from=excluded.refresh_from, refresh_until=excluded.refresh_until, enabled=1, last_error=NULL, updated_at=excluded.updated_at`,
  ).bind(watch.id, watch.userId, watch.marketId, watch.sportKey, watch.marketType, watch.totalPoint, watch.league, watch.home, watch.away, watch.kickoffUtc, watch.betman, watch.refreshFrom, watch.refreshUntil, watch.now, watch.now).run();
  const saved = await env.DB.prepare("SELECT * FROM watches WHERE user_id = ? AND market_id = ?").bind(user.id, marketId).first();
  return json({ watch: watchPublic(saved) }, 201, request, env);
}

async function updateWatch(request, env, user, watchId) {
  const input = await body(request);
  const enabled = Boolean(input.enabled);
  const result = await env.DB.prepare("UPDATE watches SET enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(enabled ? 1 : 0, nowIso(), watchId, user.id).run();
  if (!result.meta.changes) return json({ error: "관측 경기를 찾을 수 없습니다." }, 404, request, env);
  const saved = await env.DB.prepare("SELECT * FROM watches WHERE id = ? AND user_id = ?").bind(watchId, user.id).first();
  return json({ watch: watchPublic(saved) }, 200, request, env);
}

async function deleteWatch(request, env, user, watchId) {
  const result = await env.DB.prepare("DELETE FROM watches WHERE id = ? AND user_id = ?").bind(watchId, user.id).run();
  if (!result.meta.changes) return json({ error: "관측 경기를 찾을 수 없습니다." }, 404, request, env);
  return json({ ok: true }, 200, request, env);
}

async function watchSnapshots(request, env, user, watchId) {
  const owner = await env.DB.prepare("SELECT id FROM watches WHERE id = ? AND user_id = ?").bind(watchId, user.id).first();
  if (!owner) return json({ error: "관측 경기를 찾을 수 없습니다." }, 404, request, env);
  const result = await env.DB.prepare("SELECT id, fetched_at, market_json, cut_json FROM watch_snapshots WHERE watch_id = ? ORDER BY fetched_at DESC LIMIT 72").bind(watchId).all();
  return json({ snapshots: (result.results || []).map((row) => ({ id: row.id, fetchedAt: row.fetched_at, market: JSON.parse(row.market_json), cut: JSON.parse(row.cut_json) })) }, 200, request, env);
}

function meanValues(values) {
  return Object.fromEntries(Object.entries(values).filter(([, list]) => list.some((value) => value >= 1.01 && value <= 20)).map(([key, list]) => {
    const clean = list.filter((value) => value >= 1.01 && value <= 20);
    const ordered = [...clean].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return [key, ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2];
  }));
}

function marketSummary(event) {
  const home = event.home_team;
  const away = event.away_team;
  const h2hValues = { home: [], draw: [], away: [] };
  const h2hPinnacle = {};
  const totalsByPoint = new Map();
  const totalsPinnacle = new Map();
  for (const bookmaker of event.bookmakers || []) {
    const h2h = {};
    for (const market of bookmaker.markets || []) {
      if (market.key === "h2h") {
        for (const outcome of market.outcomes || []) {
          if (outcome.name === home) h2h.home = outcome.price;
          else if (outcome.name === away) h2h.away = outcome.price;
          else if (outcome.name === "Draw") h2h.draw = outcome.price;
        }
      }
      if (market.key === "totals") {
        for (const outcome of market.outcomes || []) {
          if (!Number.isFinite(outcome.point) || !["Over", "Under"].includes(outcome.name)) continue;
          const point = Number(outcome.point);
          const values = totalsByPoint.get(point) || { over: [], under: [] };
          values[outcome.name.toLowerCase()].push(outcome.price);
          totalsByPoint.set(point, values);
          if (bookmaker.key === "pinnacle") {
            const pin = totalsPinnacle.get(point) || {};
            pin[outcome.name.toLowerCase()] = outcome.price;
            totalsPinnacle.set(point, pin);
          }
        }
      }
    }
    for (const [key, value] of Object.entries(h2h)) h2hValues[key].push(value);
    if (bookmaker.key === "pinnacle") Object.assign(h2hPinnacle, h2h);
  }
  const result = { id: event.id, sportKey: event.sport_key, commenceUtc: event.commence_time, homeEn: home, awayEn: away, books: (event.bookmakers || []).length, consensus: meanValues(h2hValues), pinnacle: h2hPinnacle };
  if (totalsByPoint.size) {
    const [point, values] = [...totalsByPoint.entries()].sort((a, b) => {
      const aCount = a[1].over.length + a[1].under.length;
      const bCount = b[1].over.length + b[1].under.length;
      return bCount - aCount;
    })[0];
    result.totals = { point, books: Math.max(values.over.length, values.under.length), consensus: meanValues(values), pinnacle: totalsPinnacle.get(point) || {} };
  }
  return result;
}

function cutValue(domestic, overseas) {
  return domestic && overseas ? Number((1 - domestic / overseas).toFixed(4)) : null;
}

async function refreshWatchGroup(env, group) {
  const url = `${ODDS_BASE}/sports/${encodeURIComponent(group.sport_key)}/events/${encodeURIComponent(group.market_id)}/odds?apiKey=${encodeURIComponent(group.apiKey)}&regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`;
  const response = await fetch(url, { headers: { "User-Agent": "taengle-api/1.0" } });
  if (!response.ok) throw new Error(`odds api HTTP ${response.status}`);
  const event = await response.json();
  const market = marketSummary(event);
  for (const watch of group.watches) {
    const betman = JSON.parse(watch.betman_json);
    const selected = watch.market_type === "totals" ? market.totals : market;
    if (!selected) throw new Error(`${watch.market_type} market unavailable`);
    const cut = watch.market_type === "totals"
      ? { over: cutValue(betman.over, selected.consensus.over), under: cutValue(betman.under, selected.consensus.under), point: selected.point }
      : { win: cutValue(betman.win, selected.consensus.home), draw: cutValue(betman.draw, selected.consensus.draw), lose: cutValue(betman.lose, selected.consensus.away) };
    const valid = Object.entries(cut).filter(([key, value]) => key !== "point" && value != null).map(([, value]) => value);
    cut.avg = valid.length ? Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(4)) : null;
    const fetched = nowIso();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO watch_snapshots (id, watch_id, fetched_at, market_json, cut_json) VALUES (?, ?, ?, ?, ?)").bind(id(), watch.id, fetched, JSON.stringify(market), JSON.stringify(cut)),
      env.DB.prepare("UPDATE watches SET last_fetched_at = ?, last_error = NULL, updated_at = ? WHERE id = ?").bind(fetched, fetched, watch.id),
      env.DB.prepare("DELETE FROM watch_snapshots WHERE watch_id = ? AND id NOT IN (SELECT id FROM watch_snapshots WHERE watch_id = ? ORDER BY fetched_at DESC LIMIT 72)").bind(watch.id, watch.id),
    ]);
  }
}

async function refreshDueWatches(env) {
  const now = nowIso();
  const result = await env.DB.prepare(
    `SELECT w.*, c.api_key_ciphertext, c.api_key_iv FROM watches w JOIN api_credentials c ON c.user_id = w.user_id
     WHERE w.enabled = 1 AND w.refresh_from <= ? AND w.refresh_until > ?`,
  ).bind(now, now).all();
  const groups = new Map();
  for (const row of result.results || []) {
    const apiKey = await decryptApiKey(row, env);
    const key = `${row.user_id}:${row.sport_key}:${row.market_id}`;
    const group = groups.get(key) || { userId: row.user_id, sport_key: row.sport_key, market_id: row.market_id, apiKey, watches: [] };
    group.watches.push(row);
    groups.set(key, group);
  }
  let success = 0;
  for (const group of groups.values()) {
    try {
      await refreshWatchGroup(env, group);
      success += group.watches.length;
    } catch (error) {
      const message = String(error).slice(0, 240);
      for (const watch of group.watches) await env.DB.prepare("UPDATE watches SET last_error = ?, updated_at = ? WHERE id = ?").bind(message, nowIso(), watch.id).run();
    }
  }
  return { due: result.results?.length || 0, success, groups: groups.size };
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": allowedOrigin(request, env), "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "Vary": "Origin" } });
  if (url.pathname === "/api/health") return json({ ok: true, service: "taengle-api", now: nowIso() }, 200, request, env);
  if (url.pathname === "/api/auth/signup" && request.method === "POST") return authSignup(request, env);
  if (url.pathname === "/api/auth/login" && request.method === "POST") return authLogin(request, env);
  if (url.pathname === "/api/auth/logout" && request.method === "POST") return authLogout(request, env);
  const user = await sessionUser(request, env);
  if (url.pathname === "/api/me" && request.method === "GET" && !user) return json({ user: null, keyConfigured: false, keyLast4: null, watches: [] }, 200, request, env);
  if (!user) return json({ error: "로그인이 필요합니다." }, 401, request, env);
  if (url.pathname === "/api/me" && request.method === "GET") return me(request, env, user);
  if (url.pathname === "/api/me/api-key" && request.method === "PUT") return saveApiKey(request, env, user);
  if (url.pathname === "/api/me/api-key" && request.method === "DELETE") return deleteApiKey(request, env, user);
  if (url.pathname === "/api/watches" && request.method === "GET") return json({ watches: await listWatches(env, user.id) }, 200, request, env);
  if (url.pathname === "/api/watches" && request.method === "POST") return createWatch(request, env, user);
  const match = url.pathname.match(/^\/api\/watches\/([^/]+)(?:\/snapshots)?$/);
  if (match && url.pathname.endsWith("/snapshots") && request.method === "GET") return watchSnapshots(request, env, user, match[1]);
  if (match && !url.pathname.endsWith("/snapshots") && request.method === "PATCH") return updateWatch(request, env, user, match[1]);
  if (match && !url.pathname.endsWith("/snapshots") && request.method === "DELETE") return deleteWatch(request, env, user, match[1]);
  return json({ error: "Not found" }, 404, request, env);
}

export default {
  fetch(request, env) {
    return route(request, env).catch((error) => {
      console.error(error);
      return json({ error: "서버 오류가 발생했습니다." }, 500, request, env);
    });
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshDueWatches(env));
  },
};
