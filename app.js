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
let weather = { label: "céu desconhecido", mood: "neutral", temp: null, wind: null, city: "São Paulo" };

const PIECES = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

/* ---------------- weather (Open-Meteo) ---------------- */
const MOODS = {
  clear: { accent: "#ffb547", accent2: "#ff6a3d", words: ["céu limpo", "limpo"] },
  cloud: { accent: "#a9bccd", accent2: "#5f7488", words: ["nublado"] },
  fog: { accent: "#c9c1ad", accent2: "#7a7466", words: ["neblina"] },
  rain: { accent: "#62b6e8", accent2: "#2f5fd0", words: ["chuva"] },
  snow: { accent: "#e2ecf7", accent2: "#8fb3d9", words: ["neve"] },
  storm: { accent: "#b98cff", accent2: "#ff4f8b", words: ["tempestade"] },
  night: { accent: "#8fa0ff", accent2: "#3a2f8f", words: ["noite"] },
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
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const bot = (t, extra) => addMsg("bot", t, extra);
const sys = (t) => addMsg("sys", t);
const san = (s) => `<span class="san">${esc(s)}</span>`;

function setStatus(text, isThinking = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("thinking", isThinking);
}

function updateMeta() {
  $("#meta-color").textContent = playerColor === "w" ? "Brancas" : "Pretas";
  $("#meta-move").textContent = Math.floor(game.history().length / 2) + 1;
  $("#meta-level").textContent = `${level} / 3`;
  $("#meta-engine").textContent = level === 1 ? "Local" : "Stockfish";
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
    items = ["Xadrez <i>às cegas</i>", "Notação <i>algébrica</i>", "Segure o <i>olho</i>", "Nimbus <i>sente o clima</i>"];
  }
  const row = items.map((t) => `<span>${t} <b>✦</b></span>`).join("");
  $("#track").innerHTML = row + row + row + row;
}

/* ---------------- game flow ---------------- */
function normalize(raw) {
  let s = raw.trim().replace(/0-0-0/g, "O-O-O").replace(/0-0/g, "O-O").replace(/[!?]+$/, "");
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(s)) return { from: s.slice(0, 2).toLowerCase(), to: s.slice(2, 4).toLowerCase(), promotion: (s[4] || "q").toLowerCase() };
  return s;
}

function tryMove(raw) {
  try { return game.move(normalize(raw)); } catch { return null; }
}

function describeEnd() {
  if (game.isCheckmate()) {
    const loserIsPlayer = game.turn() === playerColor;
    return loserIsPlayer ? "Xeque-mate. O céu venceu desta vez. Digite /novo para revanche." : "Xeque-mate! Você venceu Nimbus. As nuvens se abrem. /novo para jogar de novo.";
  }
  if (game.isStalemate()) return "Afogamento. Empate — como um dia sem vento.";
  if (game.isThreefoldRepetition()) return "Repetição tripla. Empate.";
  if (game.isInsufficientMaterial()) return "Material insuficiente. Empate.";
  if (game.isDraw()) return "Empate pela regra dos 50 lances.";
  return null;
}

async function engineMove() {
  if (game.isGameOver()) return;
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
      if (uci) move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
    } catch { /* fallback below */ }
    if (!move) $("#meta-engine").textContent = "Local";
  }
  if (!move) {
    await new Promise((r) => setTimeout(r, 30));
    move = game.move(localBestMove(game, level === 1 ? 2 : 3));
  }

  const elapsed = performance.now() - start;
  if (elapsed < 700) await new Promise((r) => setTimeout(r, 700 - elapsed));

  thinking = false;
  const num = move.color === "w" ? `${Math.ceil(game.history().length / 2)}.` : `${Math.ceil(game.history().length / 2)}…`;
  let text = `${num} ${san(move.san)}`;
  if (move.san.includes("#")) text += "  — mate.";
  else if (move.san.includes("+")) text += "  — xeque.";
  else if (move.captured) text += Math.random() < 0.5 ? "  — obrigado pela peça." : "";
  else if (Math.random() < 0.18) text += `\n${moodQuip()}`;
  bot(text);
  updateMeta();
  const end = describeEnd();
  if (end) { sys(end); setStatus("partida encerrada"); } else setStatus("sua vez");
}

async function handleInput(raw) {
  const text = raw.trim();
  if (!text) return;
  addMsg("me", text.startsWith("/") ? esc(text) : san(text));
  if (text.startsWith("/")) return command(text.toLowerCase());
  if (thinking) return bot("Calma. Ainda estou olhando as nuvens.");
  if (game.isGameOver()) return bot("A partida acabou. Digite /novo.");
  if (game.turn() !== playerColor) return bot("Não é a sua vez.");

  const move = tryMove(text);
  if (!move) {
    const legal = game.moves();
    const sample = legal.sort(() => Math.random() - 0.5).slice(0, 5).map((m) => `<code>${esc(m)}</code>`).join(" ");
    return bot(`Lance inválido: <code>${esc(text)}</code>. ${game.inCheck() ? "Você está em xeque. " : ""}Alguns lances legais: ${sample}`, "error");
  }
  updateMeta();
  const end = describeEnd();
  if (end) { sys(end); setStatus("partida encerrada"); return; }
  await engineMove();
}

function newGame(color) {
  game.reset();
  playerColor = color;
  messagesEl.innerHTML = "";
  sys(`nova partida · você joga de ${color === "w" ? "brancas" : "pretas"} · nível ${level}`);
  updateMeta();
  if (color === "b") {
    bot(`Eu começo. ${moodQuip()}`);
    engineMove();
  } else {
    bot(`Suas brancas. Faça o primeiro lance.`);
    setStatus("sua vez");
  }
}

function command(cmd) {
  const [name, arg] = cmd.split(/\s+/);
  switch (name) {
    case "/ajuda":
    case "/help":
      return bot(
        "Lances em notação algébrica: <code>e4</code> <code>Nf3</code> <code>Bxc6</code> <code>O-O</code> <code>e8=Q</code>\n" +
        "Peças: K rei · Q dama · R torre · B bispo · N cavalo. Também aceito <code>e2e4</code>.\n\n" +
        "<code>/novo</code> nova partida de brancas\n<code>/pretas</code> nova partida de pretas\n" +
        "<code>/desfazer</code> volta seu último lance\n<code>/nivel 1-3</code> força do adversário\n" +
        "<code>/lances</code> lista seus lances legais\n<code>/pgn</code> partida até aqui\n\n" +
        "Segure o olho (ou a tecla Espaço fora do campo de texto) para ver o tabuleiro."
      );
    case "/novo":
    case "/brancas":
      return newGame("w");
    case "/pretas":
      return newGame("b");
    case "/desfazer":
      if (thinking) return bot("Espere minha jogada.");
      if (game.history().length === 0) return bot("Nada para desfazer.");
      game.undo();
      if (game.turn() !== playerColor) game.undo();
      updateMeta();
      setStatus("sua vez");
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

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = input.value;
  input.value = "";
  handleInput(v);
});
$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-cmd]");
  if (b) handleInput(b.dataset.cmd);
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
updateMarquee();
sys("nimbus está online");
loadWeather(-23.55, -46.63, "São Paulo").then(() => {
  bot(`Olá. Lá fora: ${weather.label}${weather.temp !== null ? `, ${weather.temp}°C` : ""}. ${moodQuip()}`);
  bot("Você joga de brancas. Envie seu lance em notação algébrica — por exemplo <code>e4</code>. Digite <code>/ajuda</code> para os comandos.");
  setStatus("sua vez");
});
