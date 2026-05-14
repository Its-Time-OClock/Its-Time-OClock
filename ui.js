const shownRolls = new Set();
let lastSystemTick = -1;
const diceOverlay = document.getElementById("dice-overlay");
const diceNumEl = document.getElementById("dice-number");
const diceRollerEl = document.getElementById("dice-roller-name");
const diceSubEl = document.getElementById("dice-subtext");

function showDiceOverlay() {
  diceOverlay.classList.add("show");
  diceOverlay.setAttribute("aria-hidden", "false");
}

function hideDiceOverlay() {
  diceOverlay.classList.remove("show");
  diceOverlay.setAttribute("aria-hidden", "true");
}

export function scheduleDiceRoll({ rollId, result, rollerId, startedAt, durationMs }, room) {
  if (!rollId || shownRolls.has(rollId)) return;
  shownRolls.add(rollId);
  const peers = room.peers || {};
  const presence = room.presence || {};
  const rollerName = presence[rollerId]?.name || peers[rollerId]?.username || "Someone";
  diceRollerEl.textContent = `— ${rollerName}`;
  diceSubEl.textContent = "Synchronizing...";
  diceNumEl.textContent = "20";
  diceNumEl.classList.remove("roll-spin");
  const delay = Math.max(0, startedAt - Date.now());
  setTimeout(() => {
    showDiceOverlay();
    const start = Date.now();
    const end = start + durationMs;
    diceSubEl.textContent = "Rolling...";
    diceNumEl.classList.add("roll-spin");
    const spinInterval = 60;
    let rafId;
    const ticker = () => {
      const now = Date.now();
      if (now >= end) {
        diceNumEl.textContent = String(result);
        if (result === 20) {
          diceSubEl.innerHTML = '<span class="dice-crit">Critical success!</span>';
        } else if (result === 1) {
          diceSubEl.innerHTML = '<span class="dice-fail">Critical failure!</span>';
        } else {
          diceSubEl.textContent = `Result: ${result}`;
        }
        setTimeout(() => hideDiceOverlay(), 1000);
        cancelAnimationFrame(rafId);
        return;
      }
      const fake = Math.floor(Math.random() * 20) + 1;
      diceNumEl.textContent = String(fake);
      rafId = requestAnimationFrame(ticker);
    };
    rafId = requestAnimationFrame(ticker);
  }, delay);
}

export function renderStats(targetId, room, hoveredPlayerId) {
  const els = {
    youAvatar: document.getElementById("you-avatar"),
    youName: document.getElementById("you-name"),
    youLocation: document.getElementById("you-location"),
    youHp: document.getElementById("you-hp"),
    youStr: document.getElementById("you-str"),
    youInt: document.getElementById("you-int"),
    youDex: document.getElementById("you-dex"),
    youCha: document.getElementById("you-cha"),
    youInv: document.getElementById("you-inv"),
    youDesc: document.getElementById("you-desc")
  };
  const isMe = targetId === room.clientId;
  const peer = room.peers[targetId] || {};
  const char = room.presence[targetId] || {};
  els.youAvatar.src = peer.avatarUrl || "";
  els.youName.textContent = char.name || peer.username || (isMe ? "You" : "Unknown");
  els.youLocation.textContent = `@ ${char.location || "-"}`;
  els.youHp.textContent = `${char.hp ?? "-"} / ${char.maxHp ?? "-"}`;
  els.youStr.textContent = char.str ?? "-";
  els.youInt.textContent = char.int ?? "-";
  els.youDex.textContent = char.dex ?? "-";
  els.youCha.textContent = char.cha ?? "-";
  const inv = char.inventory || {};
  els.youInv.innerHTML = "";
  const keys = Object.keys(inv);
  if (!keys.length) {
    const li = document.createElement("li");
    li.textContent = "(empty)";
    li.style.color = "#9aa4b2";
    els.youInv.appendChild(li);
  } else {
    for (const k of keys) {
      const li = document.createElement("li");
      const it = inv[k];
      li.textContent = `${it.name || k} x${it.qty ?? 1}`;
      els.youInv.appendChild(li);
    }
  }
  els.youDesc.textContent = (char.description || "") || "(empty)";
  const header = document.querySelector("#you h2");
  if (header) header.textContent = isMe ? "Your Character" : (char.name || peer.username || "Player");
}

export function renderPlayers(room, hoveredPlayerId, onHoverEnter, onHoverLeave) {
  const playerList = document.getElementById("player-list");
  const peers = room.peers || {};
  const presence = room.presence || {};
  const cur = room.roomState?.turn?.current;
  if (hoveredPlayerId && !peers[hoveredPlayerId]) return null;
  playerList.innerHTML = "";
  Object.keys(peers).sort().forEach((pid) => {
    const p = peers[pid];
    const pr = presence[pid] || {};
    
    const isAnonymous = !p.username || p.username.startsWith("Guest-") || p.username === "Guest" || p.username === "Wanderer";
    if (!p.online && isAnonymous) return;

    if (!p.online && !pr.ready) return;

    const row = document.createElement("div");
    row.className = "player-row";
    row.addEventListener("mouseenter", () => onHoverEnter(pid));
    row.addEventListener("mouseleave", () => onHoverLeave());
    const img = document.createElement("img");
    img.className = "p-avatar";
    img.src = p.avatarUrl || "";
    const info = document.createElement("div");
    info.className = "p-info";
    const name = document.createElement("div");
    name.className = "p-name";
    name.textContent = pr.name || p.username;
    const uname = document.createElement("div");
    uname.className = "p-username";
    uname.textContent = `(@${p.username})`;
    info.appendChild(name);
    info.appendChild(uname);
    const meta = document.createElement("div");
    meta.className = "p-meta";
    meta.textContent = `HP ${pr.hp ?? "?"} • ${pr.location || "-"}` + (pid === cur ? " • (Their turn)" : "");
    if (!p.online) {
      row.style.opacity = "0.5";
      const offlineBadge = document.createElement("div");
      offlineBadge.style.fontSize = "9px";
      offlineBadge.style.color = "var(--danger)";
      offlineBadge.textContent = "(Offline)";
      info.appendChild(offlineBadge);
    }

    row.appendChild(img);
    row.appendChild(info);
    row.appendChild(meta);
    playerList.appendChild(row);
  });
  return hoveredPlayerId;
}

export function renderWorld(room) {
  const worldMeta = document.getElementById("world-meta");
  const toggleAsskiss = document.getElementById("toggle-yesman");
  const btnTakeTurn = document.getElementById("btn-take-turn");
  const rs = room.roomState || {};
  const curId = rs.turn?.current;
  const curName = curId ? (room.presence[curId]?.name || room.peers[curId]?.username || curId) : "-";
  
  worldMeta.innerHTML = `
    <div>World: <span style="color:#c7e7ff">${rs.worldSeed || "-"}</span></div>
    <div>Tick: <span style="color:#c7e7ff">${rs.tick || 1}</span></div>
    <div>Turn: <span style="color:#ffd27a">${curName}</span></div>
  `;
  
  if (toggleAsskiss) toggleAsskiss.checked = !!rs.yesmanMode;
  if (btnTakeTurn) {
    btnTakeTurn.disabled = (curId === room.clientId);
  }
}

export function notifySystem(text) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  while (container.children.length >= 2) {
    container.removeChild(container.firstChild);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add("fade-out");
      setTimeout(() => toast.remove(), 300);
    }
  }, 2000);
}

export function addLog(who, text, tickOverride, prompts, rollResult, room, failedCommand, thought) {
  if (who === "System") return;
  const log = document.getElementById("narrative-log");
  const entry = document.createElement("div");
  entry.className = "entry";
  const tick = document.createElement("div");
  tick.className = "tick";
  const currentTick = tickOverride ?? (room.roomState?.tick || "-");
  tick.textContent = `[${currentTick}]`;
  entry.appendChild(tick);

  const controls = document.createElement("div");
  controls.className = "entry-controls";
  
  const btnEdit = document.createElement("button");
  btnEdit.className = "control-btn";
  btnEdit.textContent = "Edit";
  
  const btnDelete = document.createElement("button");
  btnDelete.className = "control-btn del";
  btnDelete.textContent = "Delete";

  const textDiv = document.createElement("div");
  textDiv.className = "text";
  textDiv.textContent = text;

  btnEdit.onclick = () => {
    if (!tickOverride) return;
    const existingEditor = entry.querySelector(".inline-editor");
    if (existingEditor) {
      existingEditor.remove();
      textDiv.style.display = "";
      return;
    }

    const editor = document.createElement("div");
    editor.className = "inline-editor";
    const area = document.createElement("textarea");
    area.value = text;
    const btns = document.createElement("div");
    btns.className = "editor-btns";
    const save = document.createElement("button");
    save.className = "small-btn";
    save.style.color = "var(--accent)";
    save.textContent = "Save";
    const cancel = document.createElement("button");
    cancel.className = "small-btn";
    cancel.textContent = "Cancel";

    btns.appendChild(save);
    btns.appendChild(cancel);
    editor.appendChild(area);
    editor.appendChild(btns);

    textDiv.style.display = "none";
    entry.insertBefore(editor, textDiv);
    area.focus();

    save.onclick = () => {
      room.updateRoomState({ logs: { [tickOverride]: { ...room.roomState.logs[tickOverride], text: area.value } } });
    };
    cancel.onclick = () => {
      editor.remove();
      textDiv.style.display = "";
    };
  };
  
  btnDelete.onclick = () => {
    if (!tickOverride) return;
    const confirmBox = document.createElement("div");
    confirmBox.className = "confirm-overlay-box";
    confirmBox.innerHTML = `
      <div class="confirm-msg">Delete this message?</div>
      <div class="confirm-btns">
        <button class="small-btn danger-confirm" style="color:var(--danger)">Delete</button>
        <button class="small-btn">Cancel</button>
      </div>
    `;
    const [delBtn, canBtn] = confirmBox.querySelectorAll("button");
    delBtn.onclick = () => room.updateRoomState({ logs: { [tickOverride]: null } });
    canBtn.onclick = () => confirmBox.remove();
    entry.appendChild(confirmBox);
  };

  controls.appendChild(btnEdit);
  controls.appendChild(btnDelete);
  entry.appendChild(controls);

  if (thought) {
    const thinkToggle = document.createElement("button");
    thinkToggle.className = "think-toggle";
    thinkToggle.textContent = "think";
    thinkToggle.title = "Show AI thinking process";
    
    const thinkCont = document.createElement("div");
    thinkCont.className = "think-content";
    thinkCont.textContent = thought;
    
    thinkToggle.onclick = (e) => {
      e.stopPropagation();
      const isVisible = thinkCont.classList.toggle("show");
      thinkToggle.textContent = isVisible ? "hide" : "think";
    };
    
    entry.appendChild(thinkToggle);
    entry.appendChild(thinkCont);
  }

  if (who !== "Narrator") {
    const header = document.createElement("div");
    const whoSpan = document.createElement("span");
    whoSpan.className = "who";
    whoSpan.textContent = who;
    header.appendChild(whoSpan);
    entry.appendChild(header);
  }
  entry.appendChild(textDiv);
  if (prompts && typeof prompts === "object" && Object.keys(prompts).length) {
    const pDiv = document.createElement("div");
    pDiv.className = "prompts";
    const title = document.createElement("div");
    title.textContent = "Caused by:";
    pDiv.appendChild(title);
    for (const k in prompts) {
      const p = prompts[k];
      const line = document.createElement("span");
      line.className = "p-line";
      const u = document.createElement("span");
      u.className = "p-user";
      u.textContent = p.who || p.clientId || "Someone";
      line.appendChild(u);
      const raw = p.text || "";
      const cleaned = raw.replace(/roll\s*d20/gi, "").trim();
      const displayText = cleaned ? ` — "${cleaned}"` : "";
      const rest = document.createTextNode(displayText);
      line.appendChild(rest);
      pDiv.appendChild(line);
    }
    entry.appendChild(pDiv);
  }
  if (failedCommand) {
    const retryBtn = document.createElement("button");
    retryBtn.className = "retry-turn-btn";
    retryBtn.innerHTML = "<span>↻</span> Retry Turn";
    retryBtn.title = "Re-submit the command that failed";
    retryBtn.onclick = () => {
      window.dispatchEvent(new CustomEvent('retry-command', { detail: failedCommand }));
    };
    entry.appendChild(retryBtn);
  }
  if (typeof rollResult === "number") {
    const badge = document.createElement("div");
    badge.className = "roll-badge";
    if (rollResult === 20) badge.classList.add("crit");
    else if (rollResult === 1) badge.classList.add("fail");
    badge.textContent = `d20: ${rollResult}`;
    entry.appendChild(badge);
  }
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

export function renderLogs(room) {
  const log = document.getElementById("narrative-log");
  const logs = room.roomState?.logs || {};
  const pairs = Object.entries(logs).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);

  if (lastSystemTick === -1 && pairs.length > 0) {
    lastSystemTick = pairs
      .filter(([k, v]) => v.who === "System")
      .reduce((max, [k]) => Math.max(max, k), -1);
  }

  log.innerHTML = "";
  for (const [k, v] of pairs) {
    if (v.who === "System") {
      if (k > lastSystemTick) {
        lastSystemTick = k;
        notifySystem(v.text);
      }
      continue;
    }
    addLog(v.who || "Narrator", v.text || "", k, v.prompts, v.rollResult, room, v.failedCommand, v.thought);
  }
}