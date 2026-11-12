import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm";
import { localBestMove } from "./engine.js";

const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages");
const input = $("#input");
const statusEl = $("#status");
const eye = $("#eye");
const reveal = $("#reveal");
const boardEl = $("#board");

const game = new Chess();
let playerColor = "w";
let level = 2;
let thinking = false;
let resigned = false;
const isOver = () => resigned || game.isGameOver();
let weather = { label: "céu desconhecido", mood: "neutral", temp: null, wind: null, city: "São Paulo" };

// online rooms (PeerJS)
const ROOM_PREFIX = "nimbus-xadrez-sala-";
let mode = "bot"; // "bot" | "online"
let peer = null;
let conn = null;
let isHost = false;
let roomCode = null;
let myName = "Você";
let friendName = "Amigo";

const PIECES = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

/* ---------------- weather (Open-Meteo) ---------------- */
const MOODS = {
  clear: { accent: "#ffb547", accent2: "#ff6a3d" },
  cloud: { accent: "#a9bccd", accent2: "#5f7488" },
  fog: { accent: "#c9c1ad", accent2: "#7a7466" },
  rain: { accent: "#62b6e8", accent2: "#2f5fd0" },
  snow: { accent: "#e2ecf7", accent2: "#8fb3d9" },
  storm: { accent: "#b98cff", accent2: "#ff4f8b" },
  night: { accent: "#8fa0ff", accent2: "#3a2f8f" },
};

function decodeWmo(code) {
  if (code === 0) return ["céu limpo", "clear"];
  if (code <= 3) return ["parcialmente nublado", "cloud"];
  if (code === 45 || code === 48) return ["neblina", "fog"];
  if (code >= 51 && code <= 57) return ["garoa", "rain"];
  if (code >= 61 && code <= 67) return ["chuva", "rain"];
  if (code >= 71 && code <= 77) return ["neve", "snow"];
  if (code >= 80 && code <= 82) return ["pancadas de chuva", "rain"];
  if (code >= 85 && code <= 86) return ["neve", "snow"];
  if (code >= 95) return ["tempestade", "storm"];
  return ["tempo incerto", "cloud"];
}

async function loadWeather(lat, lon, city) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=auto`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const { current } = await res.json();
    const [label, mood] = decodeWmo(current.weather_code);
    const finalMood = !current.is_day && mood === "clear" ? "night" : mood;
    weather = { label, mood: finalMood, temp: Math.round(current.temperature_2m), wind: Math.round(current.wind_speed_10m), city };
    $("#weather-text").textContent = `${city} · ${weather.temp}°C · ${label} · vento ${weather.wind} km/h`;
    applyMood(finalMood);
    return true;
  } catch {
    $("#weather-text").textContent = `${city} · o céu não respondeu`;
    return false;
  }
}

function applyMood(mood) {
  const m = MOODS[mood] || MOODS.clear;
  document.documentElement.style.setProperty("--accent", m.accent);
  document.documentElement.style.setProperty("--accent-2", m.accent2);
}

$("#locate").addEventListener("click", () => {
  if (!navigator.geolocation) return;
  $("#weather-text").textContent = "localizando…";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const ok = await loadWeather(pos.coords.latitude.toFixed(3), pos.coords.longitude.toFixed(3), "Aqui");
      if (ok) bot(`Agora sinto o seu céu: ${weather.label}, ${weather.temp}°C. ${moodQuip()}`);
    },
    () => { loadWeather(-23.55, -46.63, "São Paulo"); }
  );
});

function moodQuip() {
  const q = {
    clear: ["Sol aberto. Vou jogar às claras.", "Com esse céu, não escondo nada — só os lances."],
    cloud: ["Nuvens. Meus planos ficam encobertos.", "Céu cinza, jogo cinzento."],
    fog: ["Neblina. Nem eu enxergo o tabuleiro direito.", "Na névoa, toda peça parece um cavalo."],
    rain: ["Chuva lá fora. Vou jogar devagar, gota a gota.", "Cada gota é um cálculo."],
    snow: ["Neve. Jogo frio, posição gelada.", "Meus peões escorregam."],
    storm: ["Tempestade. Hoje eu sacrifico.", "Trovão. Cuidado com a sua dama."],
    night: ["Noite clara. Jogo de estrelas.", "À noite as diagonais brilham mais."],
  }[weather.mood] || ["O tempo está estranho."];
  return q[Math.floor(Math.random() * q.length)];
}

/* ---------------- chat ---------------- */
function addMsg(kind, html, extra = "") {
  const li = document.createElement("li");
  li.className = `msg ${kind} ${extra}`;
  li.innerHTML = html;
  messagesEl.appendChild(li);
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
  return li;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const bot = (t, extra) => addMsg("bot", t, extra);
const sys = (t) => addMsg("sys", t);
const peerMsg = (t) => addMsg("peer", `<span class="who">${esc(friendName)}</span>${t}`);
const san = (s) => `<span class="san">${esc(s)}</span>`;

function setStatus(text, isThinking = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("thinking", isThinking);
}

function turnStatus() {
  if (isOver()) return setStatus("partida encerrada");
  if (mode === "online" && !conn?.open) return setStatus(isHost ? `sala ${roomCode} · esperando amigo` : "conectando…", true);
  if (game.turn() === playerColor) return setStatus("sua vez");
  setStatus(mode === "online" ? `vez de ${friendName}` : "Nimbus está pensando", true);
}

function updateMeta() {
  $("#meta-color").textContent = playerColor === "w" ? "Brancas" : "Pretas";
  $("#meta-move").textContent = Math.floor(game.history().length / 2) + 1;
  if (mode === "online") {
    $("#meta-level-k").textContent = "Sala";
    $("#meta-level").textContent = roomCode || "—";
    $("#meta-engine").textContent = conn?.open ? friendName : "Aguardando";
    $("#chat-name").textContent = conn?.open ? `${friendName} · sala ${roomCode}` : `Sala ${roomCode || ""}`;
  } else {
    $("#meta-level-k").textContent = "Nível";
    $("#meta-level").textContent = `${level} / 3`;
    $("#meta-engine").textContent = level === 1 ? "Local" : "Stockfish";
    $("#chat-name").textContent = "Nimbus";
  }
  updateMarquee();
  if (reveal.classList.contains("open")) renderBoard();
}

function updateMarquee() {
  const hist = game.history();
  let items;
  if (hist.length) {
    items = [];
    for (let i = 0; i < hist.length; i += 2) {
      items.push(`<b>${i / 2 + 1}.</b> ${esc(hist[i])}${hist[i + 1] ? ` <i>${esc(hist[i + 1])}</i>` : ""}`);
    }
    items = items.slice(-10);
  } else {
    items = ["Xadrez <i>às cegas</i>", "Notação <i>algébrica</i>", "Segure o <i>olho</i>", "Crie uma <i>sala</i>", "Nimbus <i>sente o clima</i>"];
  }
  const row = items.map((t) => `<span>${t} <b>✦</b></span>`).join("");
  $("#track").innerHTML = row + row + row + row;
}

/* ---------------- game flow ---------------- */
const SAN_LIKE = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBNqrbn])?|[O0]-[O0](?:-[O0])?|[a-h][1-8][a-h][1-8][qrbn]?)[+#]?[!?]*$/;

function normalize(raw) {
  let s = raw.trim().replace(/0-0-0/g, "O-O-O").replace(/0-0/g, "O-O").replace(/[!?]+$/, "");
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(s)) return { from: s.slice(0, 2).toLowerCase(), to: s.slice(2, 4).toLowerCase(), promotion: (s[4] || "q").toLowerCase() };
  return s;
}

function tryMove(raw) {
  try { return game.move(normalize(raw)); } catch { return null; }
}

function moveLabel(move) {
  const n = Math.ceil(game.history().length / 2);
  return `${move.color === "w" ? `${n}.` : `${n}…`} ${san(move.san)}`;
}

function describeEnd() {
  if (game.isCheckmate()) {
    const loserIsPlayer = game.turn() === playerColor;
    if (mode === "online") return loserIsPlayer ? `Xeque-mate. ${friendName} venceu. /novo para revanche.` : `Xeque-mate! Você venceu ${friendName}. /novo para revanche.`;
    return loserIsPlayer ? "Xeque-mate. O céu venceu desta vez. Digite /novo para revanche." : "Xeque-mate! Você venceu Nimbus. As nuvens se abrem. /novo para jogar de novo.";
  }
  if (game.isStalemate()) return "Afogamento. Empate — como um dia sem vento.";
  if (game.isThreefoldRepetition()) return "Repetição tripla. Empate.";
  if (game.isInsufficientMaterial()) return "Material insuficiente. Empate.";
  if (game.isDraw()) return "Empate pela regra dos 50 lances.";
  return null;
}

function afterMove() {
  updateMeta();
  const end = describeEnd();
  if (end) sys(end);
  turnStatus();
  return !!end;
}

async function engineMove() {
  if (game.isGameOver() || mode !== "bot") return;
  thinking = true;
  setStatus("Nimbus está pensando", true);
  const start = performance.now();
  let move = null;

  if (level > 1) {
    const depth = level === 2 ? 6 : 13;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(game.fen())}&depth=${depth}`, { signal: ctrl.signal });
      clearTimeout(t);
      const data = await res.json();
      const uci = data.success && data.bestmove ? data.bestmove.split(" ")[1] : null;
      if (uci && mode === "bot") move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
    } catch { /* fallback below */ }
    if (!move) $("#meta-engine").textContent = "Local";
  }
  if (mode !== "bot") { thinking = false; return; }
  if (!move) {
    await new Promise((r) => setTimeout(r, 30));
    move = game.move(localBestMove(game, level === 1 ? 2 : 3));
  }

  const elapsed = performance.now() - start;
  if (elapsed < 700) await new Promise((r) => setTimeout(r, 700 - elapsed));

  thinking = false;
  let text = moveLabel(move);
  if (move.san.includes("#")) text += "  — mate.";
  else if (move.san.includes("+")) text += "  — xeque.";
  else if (move.captured) text += Math.random() < 0.5 ? "  — obrigado pela peça." : "";
  else if (Math.random() < 0.18) text += `\n${moodQuip()}`;
  bot(text);
  afterMove();
}

function invalidMove(text) {
  const legal = game.moves();
  const sample = legal.sort(() => Math.random() - 0.5).slice(0, 5).map((m) => `<code>${esc(m)}</code>`).join(" ");
  bot(`Lance inválido: <code>${esc(text)}</code>. ${game.inCheck() ? "Você está em xeque. " : ""}Alguns lances legais: ${sample}`, "error");
}

async function handleInput(raw) {
  const text = raw.trim();
  if (!text) return;
  const isCmd = text.startsWith("/");
  const looksLikeMove = SAN_LIKE.test(text);
  addMsg("me", isCmd || !looksLikeMove ? esc(text) : san(text));
  if (isCmd) return command(text);
  if (mode === "online") return onlineInput(text, looksLikeMove);

  if (thinking) return bot("Calma. Ainda estou olhando as nuvens.");
  if (isOver()) return bot("A partida acabou. Digite /novo.");
  if (game.turn() !== playerColor) return bot("Não é a sua vez.");

  const move = tryMove(text);
  if (!move) return invalidMove(text);
  if (afterMove()) return;
  await engineMove();
}

function newGame(color) {
  if (mode === "online") leaveRoom(true);
  game.reset();
  resigned = false;
  playerColor = color;
  messagesEl.innerHTML = "";
  sys(`nova partida contra Nimbus · você joga de ${color === "w" ? "brancas" : "pretas"} · nível ${level}`);
  updateMeta();
  if (color === "b") {
    bot(`Eu começo. ${moodQuip()}`);
    engineMove();
  } else {
    bot(`Suas brancas. Faça o primeiro lance.`);
    turnStatus();
  }
}

function command(raw) {
  const [nameRaw, ...rest] = raw.split(/\s+/);
  const name = nameRaw.toLowerCase();
  const arg = rest.join(" ");
  switch (name) {
    case "/ajuda":
    case "/help":
      return bot(
        "Lances em notação algébrica: <code>e4</code> <code>Nf3</code> <code>Bxc6</code> <code>O-O</code> <code>e8=Q</code>\n" +
        "Peças: K rei · Q dama · R torre · B bispo · N cavalo. Também aceito <code>e2e4</code>.\n\n" +
        "<b>Jogar com um amigo</b>\n<code>/criar</code> cria uma sala e mostra o link\n<code>/entrar CÓDIGO</code> entra na sala do amigo\n" +
        "<code>/nome Seu Nome</code> como o amigo te vê\n<code>/sair</code> sai da sala e volta para o Nimbus\n" +
        "Na sala, qualquer texto que não for lance vira mensagem para o amigo.\n\n" +
        "<b>Partida</b>\n<code>/novo</code> nova partida (na sala: revanche com cores trocadas)\n<code>/pretas</code> jogar de pretas contra o Nimbus\n" +
        "<code>/desfazer</code> volta seu último lance (só contra o Nimbus)\n<code>/nivel 1-3</code> força do Nimbus\n" +
        "<code>/desistir</code> abandona a partida\n<code>/lances</code> lista seus lances legais\n<code>/pgn</code> partida até aqui\n\n" +
        "Segure o olho (ou a tecla Espaço fora do campo de texto) para ver o tabuleiro."
      );
    case "/criar":
      return createRoom();
    case "/entrar": {
      const code = arg.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!code) return bot("Use <code>/entrar CÓDIGO</code>, por exemplo <code>/entrar K7QXP</code>.");
      return joinRoom(code);
    }
    case "/sair":
      if (mode !== "online") return bot("Você não está em nenhuma sala.");
      return newGame("w");
    case "/nome": {
      const n = arg.trim().slice(0, 24);
      if (!n) return bot("Use <code>/nome Seu Nome</code>.");
      myName = n;
      try { localStorage.setItem("nimbus-name", n); } catch { /* ignore */ }
      send({ type: "hello", name: myName, rename: true });
      return bot(`Pronto, agora você é <b>${esc(n)}</b>.`);
    }
    case "/novo":
    case "/brancas":
      if (mode === "online") {
        if (!conn?.open) return bot("Espere seu amigo entrar para começar.");
        send({ type: "new" });
        return rematch();
      }
      return newGame("w");
    case "/pretas":
      if (mode === "online") return bot("Na sala as cores alternam a cada revanche (<code>/novo</code>).");
      return newGame("b");
    case "/desistir":
      if (isOver()) return bot("A partida já acabou.");
      if (mode === "online") {
        send({ type: "resign" });
        sys(`Você desistiu. ${friendName} vence. /novo para revanche.`);
      } else sys("Você desistiu. Nimbus vence. /novo para jogar de novo.");
      resigned = true;
      return turnStatus();
    case "/desfazer":
      if (mode === "online") return bot("Na sala não dá para desfazer lances.");
      if (thinking) return bot("Espere minha jogada.");
      if (game.history().length === 0) return bot("Nada para desfazer.");
      game.undo();
      if (game.turn() !== playerColor) game.undo();
      updateMeta();
      turnStatus();
      return bot("Voltei no tempo. Sua vez de novo.");
    case "/nivel":
    case "/nível": {
      const n = parseInt(arg, 10);
      if (![1, 2, 3].includes(n)) return bot("Use <code>/nivel 1</code>, <code>/nivel 2</code> ou <code>/nivel 3</code>.");
      level = n;
      updateMeta();
      return bot(["", "Nível 1: vou jogar como uma brisa.", "Nível 2: vento firme.", "Nível 3: furacão."][n]);
    }
    case "/lances":
      return bot(game.moves().map((m) => `<code>${esc(m)}</code>`).join(" ") || "Nenhum lance legal.");
    case "/pgn":
      return bot(game.history().length ? esc(game.pgn()) : "Ainda não há lances.");
    default:
      return bot(`Comando desconhecido. Tente <code>/ajuda</code>.`);
  }
}

/* ---------------- online rooms ---------------- */
function makeCode() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => abc[b % abc.length]).join("");
}
const roomLink = (code) => `${location.origin}${location.pathname}?sala=${code}`;

function send(data) {
  if (conn?.open) conn.send(data);
}

function leaveRoom(silent) {
  try { conn?.close(); } catch { /* ignore */ }
  try { peer?.destroy(); } catch { /* ignore */ }
  conn = null; peer = null; roomCode = null; isHost = false;
  mode = "bot";
  history.replaceState(null, "", location.pathname);
  if (!silent) sys("você saiu da sala");
}

function peerReady() {
  if (typeof window.Peer !== "function") {
    bot("Não consegui carregar o sistema de salas (PeerJS). Recarregue a página e tente de novo.", "error");
    return false;
  }
  return true;
}

function startOnline(code, host) {
  if (mode === "online") leaveRoom(true);
  mode = "online";
  isHost = host;
  roomCode = code;
  game.reset();
  resigned = false;
  friendName = "Amigo";
  messagesEl.innerHTML = "";
  playerColor = host ? "w" : "b";
  // guests keep the invite in the URL so a reload rejoins; a reloading host must not join its own room
  history.replaceState(null, "", host ? location.pathname : `?sala=${code}`);
  updateMeta();
  turnStatus();
}

function showRoomCard(code) {
  const li = bot(
    `<div class="room-card"><span>Sala criada. Mande este código ou link para seu amigo:</span>` +
    `<span class="room-code">${esc(code)}</span><span class="room-link">${esc(roomLink(code))}</span>` +
    `<button type="button" class="copy">copiar link</button></div>`
  );
  const btn = li.querySelector(".copy");
  btn.addEventListener("click", () => {
    navigator.clipboard?.writeText(roomLink(code)).then(
      () => { btn.textContent = "link copiado"; },
      () => { getSelection().selectAllChildren(li.querySelector(".room-link")); btn.textContent = "selecionado — Ctrl+C"; }
    );
  });
}

function createRoom(attempt = 0) {
  if (!peerReady()) return;
  const code = makeCode();
  startOnline(code, true);
  sys("criando sala…");
  peer = new window.Peer(ROOM_PREFIX + code);
  peer.on("open", () => {
    showRoomCard(code);
    bot("Você joga de <b>brancas</b>. Assim que seu amigo entrar, faça o primeiro lance.");
    turnStatus();
  });
  peer.on("connection", (c) => {
    if (conn?.open) { c.on("open", () => { c.send({ type: "full" }); setTimeout(() => c.close(), 500); }); return; }
    wireConnection(c);
  });
  peer.on("error", (err) => {
    if (err.type === "unavailable-id" && attempt < 3) { peer.destroy(); return createRoom(attempt + 1); }
    peerError(err);
  });
  peer.on("disconnected", () => { if (peer && !peer.destroyed) peer.reconnect(); });
}

function joinRoom(code) {
  if (!peerReady()) return;
  startOnline(code, false);
  sys(`entrando na sala ${code}…`);
  peer = new window.Peer();
  peer.on("open", () => wireConnection(peer.connect(ROOM_PREFIX + code, { reliable: true })));
  peer.on("error", peerError);
}

function peerError(err) {
  const msgs = {
    "peer-unavailable": "Sala não encontrada. Confira o código ou peça para seu amigo criar outra com /criar.",
    network: "Sem conexão com o servidor de salas. Verifique a internet.",
    "server-error": "O servidor de salas não respondeu. Tente de novo em instantes.",
    "browser-incompatible": "Este navegador não suporta salas online.",
  };
  bot(msgs[err.type] || `Erro na sala: ${esc(err.type || err.message)}`, "error");
  setStatus("sem conexão");
}

function wireConnection(c) {
  conn = c;
  c.on("open", () => {
    send({ type: "hello", name: myName });
    if (isHost) send({ type: "state", moves: game.history(), hostColor: playerColor });
    updateMeta();
    turnStatus();
  });
  c.on("data", onPeerData);
  c.on("close", () => {
    if (conn !== c) return;
    conn = null;
    sys(`${friendName} saiu da sala.${isHost ? " A sala continua aberta; ele pode voltar pelo mesmo link." : ""}`);
    updateMeta();
    turnStatus();
  });
}

function onPeerData(d) {
  if (!d || typeof d !== "object") return;
  switch (d.type) {
    case "hello": {
      let name = String(d.name || "Amigo").slice(0, 24);
      if (name === "Você") name = "Amigo";
      sys(d.rename ? `${friendName} agora se chama ${name}` : `${name} está na sala`);
      friendName = name;
      updateMeta();
      return turnStatus();
    }
    case "state": {
      game.reset();
      for (const m of d.moves || []) { try { game.move(m); } catch { break; } }
      playerColor = d.hostColor === "w" ? "b" : "w";
      bot(`Você joga de <b>${playerColor === "w" ? "brancas" : "pretas"}</b>.` +
        (game.history().length ? ` Partida em andamento: ${game.history().length} lances.` : "") +
        " Digite lances ou converse — o que não for lance vira mensagem.");
      return afterMove();
    }
    case "move": {
      if (game.turn() === playerColor) return;
      let move;
      try { move = game.move(d.san); } catch { return; }
      peerMsg(moveLabel(move));
      return afterMove();
    }
    case "chat":
      return peerMsg(esc(String(d.text).slice(0, 500)));
    case "new":
      return rematch();
    case "resign":
      sys(`${friendName} desistiu. Você vence! /novo para revanche.`);
      resigned = true;
      return turnStatus();
    case "full":
      bot("Essa sala já tem dois jogadores.", "error");
      return leaveRoom(true);
  }
}

function rematch() {
  game.reset();
  resigned = false;
  playerColor = playerColor === "w" ? "b" : "w";
  sys(`revanche · você joga de ${playerColor === "w" ? "brancas" : "pretas"}`);
  updateMeta();
  turnStatus();
}

function onlineInput(text, looksLikeMove) {
  if (!conn?.open) return bot(isHost ? "Ainda estou esperando seu amigo entrar na sala." : "Ainda conectando à sala…");
  if (!looksLikeMove) return send({ type: "chat", text });
  if (isOver()) return bot("A partida acabou. /novo para revanche.");
  if (game.turn() !== playerColor) return bot(`Não é a sua vez — ${friendName} está pensando.`);
  const move = tryMove(text);
  if (!move) return invalidMove(text);
  send({ type: "move", san: move.san });
  afterMove();
}

/* ---------------- composer ---------------- */
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = input.value;
  input.value = "";
  handleInput(v);
});
$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.fill) { input.value = b.dataset.fill; input.focus(); return; }
  if (b.dataset.cmd) handleInput(b.dataset.cmd);
});

/* ---------------- board reveal ---------------- */
function renderBoard() {
  const b = game.board();
  const hist = game.history({ verbose: true });
  const last = hist[hist.length - 1];
  const checkSq = game.inCheck()
    ? b.flat().find((p) => p && p.type === "k" && p.color === game.turn())?.square
    : null;
  const ranks = playerColor === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const files = playerColor === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  let html = "";
  ranks.forEach((r, ri) => {
    files.forEach((f, fi) => {
      const sq = "abcdefgh"[f] + (8 - r);
      const p = b[r][f];
      const cls = ["sq", (r + f) % 2 ? "d" : "l"];
      if (last && (last.from === sq || last.to === sq)) cls.push("last");
      if (checkSq === sq) cls.push("check");
      html += `<div class="${cls.join(" ")}">`;
      if (p) html += `<span class="p ${p.color}">${PIECES[p.type]}&#xFE0E;</span>`;
      if (ri === 7) html += `<span class="coord f">${"abcdefgh"[f]}</span>`;
      if (fi === 0) html += `<span class="coord r">${8 - r}</span>`;
      html += `</div>`;
    });
  });
  boardEl.innerHTML = html;
  $("#board-caption").textContent = `${game.turn() === "w" ? "brancas" : "pretas"} jogam · lance ${Math.floor(hist.length / 2) + 1}`;
}

function openReveal(x, y) {
  renderBoard();
  reveal.style.setProperty("--x", `${x}px`);
  reveal.style.setProperty("--y", `${y}px`);
  reveal.classList.add("open");
  eye.classList.add("active");
}
function closeReveal() {
  reveal.classList.remove("open");
  eye.classList.remove("active");
}
function eyeCenter() {
  const r = eye.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

eye.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  eye.setPointerCapture(e.pointerId);
  openReveal(...eyeCenter());
});
["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => eye.addEventListener(ev, closeReveal));
eye.addEventListener("contextmenu", (e) => e.preventDefault());
eye.addEventListener("keydown", (e) => {
  if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); openReveal(...eyeCenter()); }
});
eye.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") closeReveal(); });

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || document.activeElement === input || document.activeElement === eye) return;
  e.preventDefault();
  openReveal(innerWidth / 2, innerHeight / 2);
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && document.activeElement !== input && document.activeElement !== eye) closeReveal();
});
window.addEventListener("blur", closeReveal);

/* ---------------- cursor + clock ---------------- */
const cursor = $(".cursor");
let cx = 0, cy = 0, tx = 0, ty = 0;
window.addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; });
(function loop() {
  cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
  cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  requestAnimationFrame(loop);
})();
document.addEventListener("pointerover", (e) => cursor.classList.toggle("big", !!e.target.closest("button, a, input")));

function tick() {
  $("#clock").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
tick();
setInterval(tick, 10000);

/* ---------------- boot ---------------- */
try { myName = localStorage.getItem("nimbus-name") || myName; } catch { /* ignore */ }
updateMarquee();
const invite = new URLSearchParams(location.search).get("sala");
const weatherReady = loadWeather(-23.55, -46.63, "São Paulo");
if (invite) {
  joinRoom(invite.toUpperCase().replace(/[^A-Z0-9]/g, ""));
} else {
  sys("nimbus está online");
  weatherReady.then(() => {
    if (mode !== "bot") return;
    bot(`Olá. Lá fora: ${weather.label}${weather.temp !== null ? `, ${weather.temp}°C` : ""}. ${moodQuip()}`);
    bot("Você joga de brancas contra mim. Envie seu lance em notação algébrica — por exemplo <code>e4</code>.\nQuer jogar com um amigo? Digite <code>/criar</code>. Comandos em <code>/ajuda</code>.");
    turnStatus();
  });
}
