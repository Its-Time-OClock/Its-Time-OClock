import { newCharacter, loadCharacter, saveCharacter, resetCharacter } from "storage";
import { presenceToCharacter, characterToPresence, isMyTurn, performGlobalReset } from "coordinator";
import { addLog } from "ui";
import { ref, set } from "firebase/database";

const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function submitCommand(room, text) {
  const cmdId = id();
  const cmd = { id: cmdId, clientId: room.clientId, text, timestamp: Date.now() };
  room.updateRoomState({ commands: { [cmdId]: cmd } });
  room.updatePresence({ lastAction: text });
}

export function setupCommandForm(room) {
  const form = document.getElementById("command-form");
  const input = document.getElementById("command-input");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (!isMyTurn(room)) {
      addLog("System", "It's not your turn yet.", null, null, null, room);
      return;
    }
    submitCommand(room, text);
    input.value = "";
  });
}

export function setupActionButtons(room, renderSelf) {
  const btnLook = document.getElementById("btn-look");
  const btnSkip = document.getElementById("btn-skip");
  btnLook.addEventListener("click", () => {
    if (!isMyTurn(room)) return;
    submitCommand(room, "look around");
  });
  btnSkip.addEventListener("click", () => {
    if (!isMyTurn(room)) return;
    submitCommand(room, "skip");
  });
}

export function setupCharacterButtons(room, renderSelf) {
  const btnCopyChar = document.getElementById("btn-copy-char");
  const btnLoadChar = document.getElementById("btn-load-char");
  btnCopyChar.addEventListener("click", async () => {
    try {
      const pr = room.presence[room.clientId];
      if (!pr) return;
      const charData = { hp: pr.hp, maxHp: pr.maxHp, str: pr.str, int: pr.int, dex: pr.dex, cha: pr.cha, inventory: pr.inventory || {}, description: pr.description || "" };
      await navigator.clipboard.writeText(JSON.stringify(charData, null, 2));
      addLog("System", "Character data copied to clipboard.", null, null, null, room);
      alert("Character data copied to clipboard!");
    } catch (e) {
      console.error(e);
      alert("Failed to copy character.");
    }
  });
  btnLoadChar.addEventListener("click", async () => {
    const json = prompt("Paste your character JSON here:");
    if (!json) return;
    try {
      const data = JSON.parse(json);
      const required = ["hp", "maxHp", "str", "int", "dex", "cha"];
      for (const field of required) {
        if (typeof data[field] !== "number") throw new Error(`Missing or invalid field: ${field}`);
      }
      const me = room.peers[room.clientId];
      const updated = { name: me?.username || "Wanderer", hp: data.hp, maxHp: data.maxHp, str: data.str, int: data.int, dex: data.dex, cha: data.cha, inventory: data.inventory || {}, description: data.description || "" };
      room.updatePresence(characterToPresence(updated));
      renderSelf();
      addLog("System", "Character data loaded successfully.", null, null, null, room);
    } catch (e) {
      console.error(e);
      alert("Failed to load character: " + e.message);
    }
  });
}

export function setupSaveLoadButtons(room, renderSelf) {
  const btnCopy = document.getElementById("btn-copy");
  const btnLoad = document.getElementById("btn-load");
  btnCopy.addEventListener("click", async () => {
    try {
      const peers = room.peers || {};
      const presence = room.presence || {};
      const playersMap = {};
      for (const cid in peers) {
        const p = peers[cid];
        const pr = presence[cid];
        if (p && p.username && pr) playersMap[p.username] = presenceToCharacter(pr);
      }
      const state = { roomState: room.roomState, players: playersMap };
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      addLog("System", "Story copied to clipboard.", null, null, null, room);
      alert("Story data copied to clipboard.");
    } catch (e) {
      console.error(e);
      alert("Failed to copy story.");
    }
  });
  btnLoad.addEventListener("click", async () => {
    const json = prompt("Paste the story JSON here:");
    if (!json) return;
    try {
      const data = JSON.parse(json);
      if (!data || !data.roomState) throw new Error("Invalid format: missing roomState");
      
      const rs = room.roomState || {};
      const updates = { ...data.roomState };
      
      const collections = ['logs', 'commands', 'notes', 'flags'];
      collections.forEach(coll => {
        const currentColl = rs[coll] || {};
        const newColl = updates[coll] || {};
        const mergedColl = { ...newColl };
        for (const k in currentColl) {
          if (!(k in newColl)) mergedColl[k] = null;
        }
        updates[coll] = mergedColl;
      });

      room.updateRoomState(updates);

      if (data.players) {
        const peers = room.peers || {};
        for (const username in data.players) {
          const char = data.players[username];
          const targetId = Object.keys(peers).find(cid => (peers[cid].username || "").toLowerCase() === username.toLowerCase());
          if (targetId) {
            if (targetId === room.clientId) {
              const key = room.clientId;
              saveCharacter(key, char);
              room.updatePresence(characterToPresence(char));
            } else {
              room.requestPresenceUpdate(targetId, { type: "restoreCharacter", character: char });
            }
          }
        }
      }
      addLog("System", "Story and characters loaded from clipboard.", null, null, null, room);
      renderSelf();
    } catch (e) {
      console.error(e);
      alert("Failed to load story: " + e.message);
    }
  });
}

export function setupResetButtons(room, ensurePresenceInit, renderSelf) {
  const btnReset = document.getElementById("btn-reset");
  const btnResetAll = document.getElementById("btn-reset-all");
  btnReset.addEventListener("click", async () => {
    const yes = confirm("Reset your character?");
    if (!yes) return;
    const key = room.clientId;
    resetCharacter(key);
    ensurePresenceInit();
    renderSelf();
  });
  let resettingAll = false;
  btnResetAll.addEventListener("click", async () => {
    const yes = confirm("Reset the entire adventure?");
    if (!yes) return;
    if (resettingAll) return;
    resettingAll = true;
    try {
      await performGlobalReset(room);
      resetCharacter(room.clientId);
      ensurePresenceInit();
    } catch (e) {
      console.error("Global reset failed:", e);
      addLog("System", "Reset Error.", null, null, null, room);
    } finally {
      resettingAll = false;
    }
  });
}

export function setupyesmanToggle(room) {
  const toggleAsskiss = document.getElementById("toggle-yesman");
  if (toggleAsskiss) {
    toggleAsskiss.addEventListener("change", (e) => {
      const val = !!e.target.checked;
      room.updateRoomState({ yesmanMode: val });
      addLog("System", `yesman Mode ${val ? "enabled" : "disabled"}.`, null, null, null, room);
    });
  }
}

export function setupUserSettings(room) {
  const trigger = document.getElementById("btn-settings-toggle");
  const content = document.getElementById("settings-content");
  const inputUser = document.getElementById("set-username");
  const inputAvatar = document.getElementById("set-avatar");
  const btnSave = document.getElementById("btn-save-settings");

  const getC = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  };
  const setC = (name, val) => {
    const d = new Date();
    d.setTime(d.getTime() + (30 * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${val};expires=${d.toUTCString()};path=/`;
  };

  const isCollapsed = getC('settings_collapsed') !== 'false'; 
  if (!isCollapsed) {
    content.classList.add('show');
    trigger.textContent = "User Settings ▲";
  }

  inputUser.value = room.user?.username || "";
  inputAvatar.value = room.user?.avatar_url || "";

  trigger.addEventListener("click", () => {
    const showing = content.classList.toggle('show');
    setC('settings_collapsed', !showing);
    trigger.textContent = showing ? "User Settings ▲" : "User Settings ▼";
  });

  btnSave.addEventListener("click", () => {
    const username = inputUser.value.trim();
    const avatarUrl = inputAvatar.value.trim();
    if (!username) return alert("Username cant be empty");
    
    setC('dwd_user_override', username);
    setC('dwd_avatar_override', avatarUrl);
    
    room.updatePeerInfo({ username, avatarUrl });
    alert("Your username and avatar will sync for other players.");
  });
}

export function setupTakeTurnButton(room) {
  const btn = document.getElementById("btn-take-turn");
  btn.addEventListener("click", () => {
    room.updateRoomState({ turn: { current: room.clientId } });
    addLog("System", "You took control of the turn.", null, null, null, room);
  });
}

export function setupTunnelSettings(room) {
  const trigger = document.getElementById("btn-tunnel-toggle");
  const content = document.getElementById("tunnel-content");
  const inputTunnel = document.getElementById("set-tunnel-url");
  const btnApply = document.getElementById("btn-apply-tunnel");
  const DEFAULT_TUNNEL = "https://your-tunnel-id.trycloudflare.com";

  const setC = (name, val) => {
    const d = new Date();
    d.setTime(d.getTime() + (30 * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${val};expires=${d.toUTCString()};path=/`;
  };
  const getC = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  };

  const isCollapsed = getC('tunnel_collapsed') !== 'false';
  if (!isCollapsed) {
    content.classList.add('show');
    trigger.textContent = "Tunnel Settings ▲";
  }

  trigger.addEventListener("click", () => {
    const showing = content.classList.toggle('show');
    setC('tunnel_collapsed', !showing);
    trigger.textContent = showing ? "Tunnel Settings ▲" : "Tunnel Settings ▼";
  });

  const updateHighlight = (val) => {
    if (!val || val === DEFAULT_TUNNEL) {
      inputTunnel.classList.add("highlight-red");
    } else {
      inputTunnel.classList.remove("highlight-red");
    }
  };

  const initialUrl = room.roomState?.tunnelUrl || DEFAULT_TUNNEL;
  inputTunnel.value = initialUrl;
  updateHighlight(initialUrl);

  room.subscribeRoomState((state) => {
    if (state.tunnelUrl && state.tunnelUrl !== inputTunnel.value) {
      inputTunnel.value = state.tunnelUrl;
      updateHighlight(state.tunnelUrl);
    }
  });

  inputTunnel.addEventListener("input", (e) => updateHighlight(e.target.value));

  btnApply.addEventListener("click", () => {
    const url = inputTunnel.value.trim();
    if (!url) return alert("Tunnel URL cannot be empty");
    room.updateRoomState({ tunnelUrl: url });
    addLog("System", "Kobold Tunnel URL updated for the room.", null, null, null, room);
    alert("Tunnel URL applied to the room.");
  });
}