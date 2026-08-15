"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let SNAPSHOT = null;

async function load() {
  const res = await fetch("data/snapshots.json", { cache: "no-store" });
  SNAPSHOT = await res.json();
  const game = SNAPSHOT.games.find((g) => g.gmId === "G101") || SNAPSHOT.games[0];
  const all = game.matches;

  // 1X2 (무승부 배당 있는) 매치 + 배당 확정(0 초과)만
  const oneX2 = all.filter((m) => m.win > 0 && m.draw > 0 && m.lose > 0);
  const upcoming = oneX2
    .filter((m) => !m.score)
    .sort((a, b) => (a.kickoff || "").localeCompare(b.kickoff || ""));

  const book = (m) => 1 / m.win + 1 / m.draw + 1 / m.lose;
  const payout = (m) => 1 / book(m);
  const noVig = (m) => ({
    home: (1 / m.win) / book(m),
    draw: (1 / m.draw) / book(m),
    away: (1 / m.lose) / book(m),
  });

  // 톱 리그 (1X2 경기 수 기준)
  const byLeague = {};
  for (const m of upcoming) {
    byLeague[m.league] = (byLeague[m.league] || 0) + 1;
  }
  const leagues = Object.entries(byLeague).sort((a, b) => b[1] - a[1]);

  // 리그별 평균 환수율
  const leaguePayout = {};
  for (const m of oneX2) {
    (leaguePayout[m.league] = leaguePayout[m.league] || []).push(payout(m));
  }
  const payoutRank = Object.entries(leaguePayout)
    .map(([lg, arr]) => [lg, arr.reduce((s, v) => s + v, 0) / arr.length])
    .sort((a, b) => b[1] - a[1]);

  renderHeader(game);
  renderLeagues(leagues, upcoming);
  renderMatches(upcoming.slice(0, 8), book, payout, noVig);
  renderPredictions(upcoming, noVig);
  renderRank(payoutRank);
  renderMetrics(game, oneX2, upcoming, payout);
  renderDataInfo(game);
}

function renderHeader(game) {
  $("#dataStatus").textContent = `${game.gameName} · ${game.matches.length}경기 실배당`;
}

function renderLeagues(leagues, upcoming) {
  const el = $("#leagueList");
  let expanded = false;
  const draw = () => {
    const list = expanded ? leagues : leagues.slice(0, 8);
    el.innerHTML = list
      .map(([lg, cnt]) => `<div class="league-row"><span>${esc(lg)}</span><span class="cnt">${cnt}</span></div>`)
      .join("");
    $("#allLeagues").textContent = expanded ? "접기 ▴" : `모든 리그 ▾ (${leagues.length})`;
  };
  $("#allLeagues").onclick = () => { expanded = !expanded; draw(); };
  draw();
}

function payoutClass(p) {
  return p >= 0.9 ? "good" : p >= 0.85 ? "warn" : "bad";
}

function renderMatches(matches, book, payout, noVig) {
  const el = $("#matchList");
  if (!matches.length) { el.innerHTML = '<p class="note" style="padding:14px;">배당 확정된 1X2 경기가 없습니다.</p>'; return; }
  el.innerHTML = matches.map((m) => {
    const p = payout(m);
    const nv = noVig(m);
    const t = (m.kickoff || "").slice(5, 16).replace("T", " ");
    return `<div class="match">
      <div><div class="m-league">${esc(m.league)}</div><div class="m-time">${esc(t)}</div></div>
      <div class="m-teams">${esc(m.home)}<span class="vs">vs</span>${esc(m.away)}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="m-odds">
          <div class="cell"><span class="l">승</span><span class="v">${m.win.toFixed(2)}</span></div>
          <div class="cell"><span class="l">무</span><span class="v">${m.draw.toFixed(2)}</span></div>
          <div class="cell"><span class="l">패</span><span class="v">${m.lose.toFixed(2)}</span></div>
        </div>
        <span class="payout-pill ${payoutClass(p)}" title="환수율 = 1 / (1/승+1/무+1/패)">환수율 ${(p * 100).toFixed(1)}%</span>
      </div>
    </div>`;
  }).join("");
}

function renderPredictions(upcoming, noVig) {
  // 주요 리그 우선, 상위 6경기
  const prio = ["K리그1", "K리그2", "라리가", "EFL챔", "에레디비", "MLS", "잉슈퍼컵", "MLB"];
  const picks = [...upcoming].sort((a, b) => {
    const pa = prio.indexOf(a.league), pb = prio.indexOf(b.league);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  }).slice(0, 6);

  $("#predGrid").innerHTML = picks.map((m) => {
    const nv = noVig(m);
    const pct = (x) => (x * 100).toFixed(1) + "%";
    const style = (x) => `width:${Math.max(2, x * 100).toFixed(1)}%;`;
    const t = (m.kickoff || "").slice(0, 10).replace(/-/g, ".");
    return `<div class="pred">
      <span class="tag">${esc(m.league)}</span>
      <div class="title">${t} ${esc(m.home)} vs ${esc(m.away)} 경기 분석</div>
      <div class="teams">${esc(m.home)}<span class="vs">vs</span>${esc(m.away)}</div>
      <div class="bar">
        <span style="${style(nv.home)};background:var(--blue-500)"></span>
        <span style="${style(nv.draw)};background:var(--amber-500)"></span>
        <span style="${style(nv.away)};background:var(--red-500)"></span>
      </div>
      <div class="pct"><span>홈 ${pct(nv.home)}</span><span>무 ${pct(nv.draw)}</span><span>원정 ${pct(nv.away)}</span></div>
    </div>`;
  }).join("");
}

function renderRank(payoutRank) {
  const max = payoutRank[0]?.[1] || 1;
  $("#payoutRank").innerHTML = payoutRank.slice(0, 10).map(([lg, p], i) =>
    `<div class="rank-row"><span class="r">${i + 1}</span><span style="flex:1;font-size:12px;">${esc(lg)}</span>
     <span class="bar2"><i style="width:${((p / max) * 100).toFixed(0)}%"></i></span>
     <span class="v">${(p * 100).toFixed(1)}%</span></div>`
  ).join("");
}

function renderMetrics(game, oneX2, upcoming, payout) {
  const avg = oneX2.reduce((s, m) => s + payout(m), 0) / Math.max(1, oneX2.length);
  const max = oneX2.reduce((a, m) => (payout(m) > a ? payout(m) : a), 0);
  const k = (label, v, cls = "") => `<div class="kv"><span>${label}</span><b class="${cls}">${v}</b></div>`;
  $("#todayMetrics").innerHTML =
    k("회차", esc(game.gameName)) +
    k("1X2 경기", oneX2.length + "건") +
    k("예정 경기", upcoming.length + "건") +
    k("평균 환수율", (avg * 100).toFixed(1) + "%", payoutClass(avg)) +
    k("최고 환수율", (max * 100).toFixed(1) + "%", "good");
}

function renderDataInfo(game) {
  const t = (SNAPSHOT.fetchedAt || "").replace("T", " ").slice(0, 16);
  $("#dataInfo").innerHTML =
    `<div class="kv"><span>소스</span><b>betman.co.kr</b></div>` +
    `<div class="kv"><span>게임</span><b>${esc(game.gameName)} 승부식</b></div>` +
    `<div class="kv"><span>수집</span><b>${esc(t)}</b></div>` +
    `<div class="kv"><span>경기 수</span><b>${game.matches.length}건</b></div>`;
}

load().catch((e) => {
  $("#dataStatus").textContent = "데이터 로드 실패";
  $("#matchList").innerHTML = `<p class="note" style="padding:14px;">snapshots.json 로드 실패: ${esc(e.message)}<br>
  <code>python collector/betman_collect.py</code> 실행 후 다시 배포하세요.</p>`;
});
