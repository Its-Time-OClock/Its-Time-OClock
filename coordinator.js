import { generateTurn, generateIntro } from "ai";
import { applyCharacterUpdate } from "storage";
import { ref, set } from "firebase/database";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function isCoordinator(room) {
  const peers = room.peers || {};
  const onlineIds = Object.keys(peers).filter(id => peers[id].online).sort();
  if (!onlineIds.length) return false;
  return room.clientId === onlineIds[0];
}

export function getOrderedPeerIds(room) {
  return Object.keys(room.peers || {}).sort();
}

function makeOrderMap(ids) {
  const map = {};
  let i = 1;
  for (const pid of ids) { map[String(i)] = pid; i++; }
  return map;
}

function orderMapToArray(map) {
  return Object.entries(map || {}).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

function getNextInOrder(currentId, orderMap) {
  const arr = orderMapToArray(orderMap);
  if (!arr.length) return null;
  const idx = Math.max(0, arr.indexOf(currentId));
  return arr[(idx + 1) % arr.length];
}

export function currentTurnClientId(room) {
  return room.roomState?.turn?.current || null;
}

export function isMyTurn(room) {
  return room.clientId === currentTurnClientId(room);
}

let initializing = false;

export async function ensureRoomInit(room) {
  if (!isCoordinator(room) || initializing) return;
  const state = room.roomState || {};
  if (state.initialized) return;

  initializing = true;
  const worldSeed = `Mistledale`;
  const locations = {
    village: { name: "Glen", summary: "A small dwarven farming village in the east of Mistledale. Has a unique elevator into the underdark, where the villagers farm mushrooms." },
    forest: { name: "Beast Country", summary: "The western edge of mistledale. Suffers from a high population of goblinoids." },
	ruins: { name: "Galath's Roost", summary: "A abandoned bandit's fortress rumored to hold great treasure. Originally founded by a bandit named galath, it is rumored his ghost still haunts the fortress." },
    abbey: { name: "Abbey of the Golden Sheaf", summary: "A walled abbey north of Ashenford. Sorrounded by fields and has underground granaries. Dedicated to the goddess of agriculture, Chauntea." },
    city: { name: "Ashabenford", summary: "A human-majority market town that sits right on the ashaba river. The local 'White Hart Inn' is famous. Capital and center of mistledale." },
  };
  try {
    const intro = await generateIntro(worldSeed, locations, state.tunnelUrl) || `Welcome to ${worldSeed}.`;
    const ids = getOrderedPeerIds(room);
    const order = makeOrderMap(ids);
    const first = ids[0] || room.clientId;
    room.updateRoomState({ 
      initialized: true, 
      createdBy: room.clientId, 
      worldSeed, 
      locations, 
      tick: 1, 
      logs: { "1": { who: "Narrator", text: intro } }, 
      notes: { seed: `World seed: ${worldSeed}` }, 
      commands: {}, 
      lastProcessed: 1, 
      flags: {}, 
      yesmanMode: false, 
      turn: { order, current: first } 
    });
  } catch (e) {
    console.error("ensureRoomInit failed:", e);
  } finally {
    initializing = false;
  }
}

export function reconcileTurnOrder(room) {
  if (!isCoordinator(room)) return;
  const rs = room.roomState || {};
  const turn = rs.turn || {};
  const desiredIds = getOrderedPeerIds(room);
  const desiredOrder = makeOrderMap(desiredIds);
  let updates = {};
  let changed = false;
  const nowOrder = turn.order || {};
  const nowIds = orderMapToArray(nowOrder);
  if (JSON.stringify(nowIds) !== JSON.stringify(desiredIds)) {
    updates.order = desiredOrder;
    changed = true;
  }
  let cur = turn.current;
  if (!cur || !desiredIds.includes(cur)) {
    cur = desiredIds[0] || null;
    updates.current = cur;
    changed = true;
  }
  if (changed) room.updateRoomState({ turn: updates });
}

function normalizePlayerUpdates(rawPlayerUpdates, peers, presence, actorId) {
  if (!rawPlayerUpdates || typeof rawPlayerUpdates !== "object") return {};
  const out = {};
  const byId = new Set(Object.keys(peers || {}));
  const usernameToId = {};
  const displayNameToId = {};
  for (const cid of Object.keys(peers || {})) {
    const username = peers[cid]?.username;
    if (username) usernameToId[username.toLowerCase()] = cid;
  }
  for (const cid of Object.keys(presence || {})) {
    const nm = presence[cid]?.name;
    if (nm) displayNameToId[nm.toLowerCase()] = cid;
  }
  for (const key of Object.keys(rawPlayerUpdates)) {
    let targetId = null;
    const lowered = String(key).toLowerCase().trim();
    if (byId.has(key)) {
      targetId = key;
    } else if (lowered === "actor" || lowered === "current" || lowered === "*") {
      targetId = actorId;
    } else if (usernameToId[lowered]) {
      targetId = usernameToId[lowered];
    } else if (displayNameToId[lowered]) {
      targetId = displayNameToId[lowered];
    }
    if (targetId) {
      const patch = rawPlayerUpdates[key] || {};
      out[targetId] = { ...(out[targetId] || {}), ...patch };
    }
  }
  return out;
}

export function presenceToCharacter(p) {
  return { name: p.name, hp: p.hp, maxHp: p.maxHp ?? 20, str: p.str, int: p.int, dex: p.dex, cha: p.cha, location: p.location, inventory: p.inventory || {}, description: p.description || "" };
}

export function characterToPresence(c) {
  return { name: c.name, hp: c.hp, maxHp: c.maxHp, str: c.str, int: c.int, dex: c.dex, cha: c.cha, location: c.location, inventory: c.inventory, description: c.description };
}

let processing = false;

function pruneDefaultOfflinePlayers(room) {
  const peers = room.peers || {};
  for (const pid in peers) {
    const p = peers[pid];
    if (p.online || pid === room.clientId) continue;
    const isDefault = (p.username || "").startsWith("Guest-") || p.username === "Guest" || p.username === "Wanderer" || (p.username || "").toLowerCase().includes("anonymous");
    if (isDefault) {
      room.removePlayer(pid);
    }
  }
}

export async function coordinatorLoop(room, saveCharacter) {
  if (!isCoordinator(room) || processing) return;
  
  const rs = room.roomState || {};
  if (!rs.initialized) {
    await ensureRoomInit(room);
    return;
  }

  pruneDefaultOfflinePlayers(room);
  const turn = rs.turn || {};
  const current = turn.current;
  if (!current) return;
  const cmds = rs.commands || {};
  const pending = Object.fromEntries(Object.entries(cmds).filter(([, v]) => !v.processed && v.clientId === current).sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0)).slice(0, 1));
  const hasPending = Object.keys(pending).length > 0;
  if (!hasPending) return;
  processing = true;
  const [onlyKey, onlyCmd] = Object.entries(pending)[0];
  try {
    const mark = { [onlyKey]: { ...onlyCmd, processed: true, processedAt: Date.now() } };
    room.updateRoomState({ commands: mark });
    const nextTick = (rs.tick || 1) + 1;
    const peer = (room.peers || {})[onlyCmd.clientId] || {};
    const promptMap = { [onlyKey]: { clientId: onlyCmd.clientId, who: peer.username || onlyCmd.clientId, text: onlyCmd.text } };
    const needsRoll = /roll\s*d20/i.test(onlyCmd.text || "");
    let cmdForAI = { ...onlyCmd };
    let rollResult = undefined;
    if (needsRoll) {
      const rollId = id();
      rollResult = Math.floor(Math.random() * 20) + 1;
      const startedAt = Date.now() + 600;
      const durationMs = 2200;
      room.send({ type: "dice-roll", echo: true, rollId, result: rollResult, rollerId: onlyCmd.clientId, startedAt, durationMs });
      const stripped = (onlyCmd.text || "").replace(/roll\s*d20/ig, "").trim();
      cmdForAI.text = `[ROLL D20 = ${rollResult}] ${stripped}`;
    }
    const isSkip = /^skip$/i.test(onlyCmd.text || "");
    if (isSkip) {
      const logEntry = { who: "System", text: `${promptMap[onlyKey].who} skips their turn.`, prompts: promptMap };
      room.updateRoomState({ logs: { [String(nextTick)]: logEntry }, tick: nextTick, lastProcessed: nextTick });
    } else {
      const result = await generateTurn(rs, room.peers || {}, room.presence || {}, { [onlyKey]: cmdForAI });
      const logEntry = { who: "Narrator", text: result.narrative || "The world holds its breath...", prompts: promptMap };
      if (rollResult !== undefined) logEntry.rollResult = rollResult;
      const newLogs = {};
      newLogs[String(nextTick)] = logEntry;
      room.updateRoomState({ logs: newLogs, tick: nextTick, lastProcessed: nextTick });
      const normalizedUpdates = normalizePlayerUpdates(result.playerUpdates || {}, room.peers || {}, room.presence || {}, onlyCmd.clientId);
      for (const clientId in normalizedUpdates) {
        const patch = normalizedUpdates[clientId] || {};
        if (clientId === room.clientId) {
          const selfChar = presenceToCharacter(room.presence[room.clientId] || {});
          const applied = applyCharacterUpdate(selfChar, patch);
          room.updatePresence(characterToPresence(applied));
        } else {
          room.requestPresenceUpdate(clientId, { type: "applyUpdates", patch });
        }
      }
      room.send({ type: "turn-resolved", echo: true, tick: nextTick });
    }
    const order = (rs.turn && rs.turn.order) || makeOrderMap(getOrderedPeerIds(room));
    const nextPlayer = getNextInOrder(current, order) || current;
    room.updateRoomState({ turn: { current: nextPlayer } });
    const remove = {};
    remove[onlyKey] = null;
    room.updateRoomState({ commands: remove });
    const cap = {};
    const minKeep = nextTick - 60;
    const existing = rs.logs || {};
    for (const key in existing) {
      const n = Number(key);
      if (n <= minKeep) cap[key] = null;
    }
    if (Object.keys(cap).length) room.updateRoomState({ logs: cap });
  } catch (e) {
    const errTick = (room.roomState?.tick || 1) + 1;
    const logUpdate = {};
    logUpdate[String(errTick)] = { 
      who: "System", 
      text: "The AI fucked up again.",
      failedCommand: onlyCmd 
    };
    room.updateRoomState({ 
      logs: logUpdate,
      tick: errTick 
    });
    console.error("Leader loop error:", e);
  } finally {
    processing = false;
  }
}

export async function performGlobalReset(room) {
  const oldTunnel = room.roomState?.tunnelUrl;
  const oldUsername = room.user?.username || "Guest";
  const oldAvatar = room.user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${oldUsername}`;
  
  await set(ref(room.db), null);
  
  room.updatePeerInfo({ username: oldUsername, avatarUrl: oldAvatar });
  if (oldTunnel) {
    room.updateRoomState({ tunnelUrl: oldTunnel });
  }
  
  room.send({ type: "reset-complete", echo: true });
}