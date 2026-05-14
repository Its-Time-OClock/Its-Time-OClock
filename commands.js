import { newCharacter, loadCharacter, saveCharacter, resetCharacter } from "storage";
import { presenceToCharacter, characterToPresence, isMyTurn, performGlobalReset } from "coordinator";
import { addLog, notifySystem } from "ui";
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
      notifySystem("It's not your turn yet.");
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

function createInlineInput(targetId, placeholder, onConfirm) {
  const existing = document.getElementById(`inline-input-${targetId}`);
  if (existing) {
    existing.remove();
    return;
  }
  const container = document.getElementById("sidebar-actions");
  const panel = document.createElement("div");
  panel.id = `inline-input-${targetId}`;
  panel.className = "inline-input-panel";
  const area = document.createElement("textarea");
  area.placeholder = placeholder;
  const btns = document.createElement("div");
  btns.className = "panel-actions";
  const ok = document.createElement("button");
  ok.textContent = "Confirm";
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  
  btns.appendChild(cancel);
  btns.appendChild(ok);
  panel.appendChild(area);
  panel.appendChild(btns);
  container.appendChild(panel);
  area.focus();

  cancel.onclick = () => panel.remove();
  ok.onclick = () => {
    const val = area.value.trim();
    if (val) {
      if (onConfirm(val)) panel.remove();
    }
  };
}

function createInlineConfirm(targetId, message, onConfirm) {
  const existing = document.getElementById(`inline-confirm-${targetId}`);
  if (existing) {
    existing.remove();
    return;
  }
  const container = document.getElementById("sidebar-actions");
  const box = document.createElement("div");
  box.id = `inline-confirm-${targetId}`;
  box.className = "confirm-overlay-box";
  box.innerHTML = `
    <div class="confirm-msg">${message}</div>
    <div class="confirm-btns">
      <button class="small-btn danger-confirm" style="color:var(--danger)">Yes, Reset</button>
      <button class="small-btn">Cancel</button>
    </div>
  `;
  const [yes, no] = box.querySelectorAll("button");
  yes.onclick = () => {
    onConfirm();
    box.remove();
  };
  no.onclick = () => box.remove();
  container.appendChild(box);
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
      notifySystem("Character data copied to clipboard.");
    } catch (e) {
      console.error(e);
      notifySystem("Failed to copy character.");
    }
  });
  btnLoadChar.addEventListener("click", () => {
    createInlineInput("load-char", "Paste character JSON here...", (json) => {
      try {
        const data = JSON.parse(json);
        const required = ["hp", "maxHp", "str", "int", "dex", "cha"];
        for (const field of required) {
          if (typeof data[field] !== "number") throw new Error(`Missing field: ${field}`);
        }
        const me = room.peers[room.clientId];
        const currentPr = room.presence[room.clientId] || {};
        const updated = { 
          ...currentPr,
          ...data,
          name: me?.username || "Wanderer" 
        };
        room.updatePresence(characterToPresence(updated));
        renderSelf();
        notifySystem("Character loaded.");
        return true;
      } catch (e) {
        notifySystem("Load failed: " + e.message);
        return false;
      }
    });
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
      notifySystem("Story copied to clipboard.");
    } catch (e) {
      console.error(e);
      notifySystem("Failed to copy story.");
    }
  });
  btnLoad.addEventListener("click", () => {
    createInlineInput("load-story", "Paste story JSON here...", (json) => {
      try {
        const data = JSON.parse(json);
        if (!data || !data.roomState) throw new Error("Missing roomState");
        const rs = room.roomState || {};
        const updates = { ...data.roomState };
        const collections = ['logs', 'commands', 'notes', 'flags'];
        collections.forEach(coll => {
          const currentColl = rs[coll] || {};
          const newColl = updates[coll] || {};
          const mergedColl = { ...newColl };
          for (const k in currentColl) if (!(k in newColl)) mergedColl[k] = null;
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
                saveCharacter(room.clientId, char);
                room.updatePresence(characterToPresence(char));
              } else {
                room.requestPresenceUpdate(targetId, { type: "restoreCharacter", character: char });
              }
            }
          }
        }
        notifySystem("Story loaded.");
        renderSelf();
        return true;
      } catch (e) {
        notifySystem("Load failed: " + e.message);
        return false;
      }
    });
  });
}

export function setupResetButtons(room, ensurePresenceInit, renderSelf) {
  const btnReset = document.getElementById("btn-reset");
  const btnResetAll = document.getElementById("btn-reset-all");
  btnReset.addEventListener("click", () => {
    createInlineConfirm("reset-char", "Reset your character stats?", () => {
      resetCharacter(room.clientId);
      ensurePresenceInit();
      renderSelf();
      notifySystem("Your character was reset.");
    });
  });
  let resettingAll = false;
  btnResetAll.addEventListener("click", () => {
    createInlineConfirm("reset-all", "Reset the entire adventure for EVERYONE?", async () => {
      if (resettingAll) return;
      resettingAll = true;
      try {
        await performGlobalReset(room);
        resetCharacter(room.clientId);
        ensurePresenceInit();
      } catch (e) {
        console.error("Global reset failed:", e);
        notifySystem("Global reset failed.");
      } finally {
        resettingAll = false;
      }
    });
  });
}

export function setupyesmanToggle(room) {
  const toggleAsskiss = document.getElementById("toggle-yesman");
  if (toggleAsskiss) {
    toggleAsskiss.addEventListener("change", (e) => {
      const val = !!e.target.checked;
      room.updateRoomState({ yesmanMode: val });
      notifySystem(`yesman Mode ${val ? "enabled" : "disabled"}.`);
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
    if (!username) {
      notifySystem("Username cannot be empty.");
      return;
    }
    
    setC('dwd_user_override', username);
    setC('dwd_avatar_override', avatarUrl);
    
    room.updatePeerInfo({ username, avatarUrl });
    notifySystem("Profile updated.");
  });
}

export function setupTakeTurnButton(room) {
  const btn = document.getElementById("btn-take-turn");
  btn.addEventListener("click", () => {
    room.updateRoomState({ turn: { current: room.clientId } });
    notifySystem("You took control of the turn.");
  });
}

export function setupTunnelSettings(room) {
  const trigger = document.getElementById("btn-tunnel-toggle");
  const content = document.getElementById("tunnel-content");
  const inputTunnel = document.getElementById("set-tunnel-url");
  const inputMaxTurn = document.getElementById("set-max-tokens-turn");
  const inputMaxIntro = document.getElementById("set-max-tokens-intro");
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
  inputMaxTurn.value = room.roomState?.maxTokensTurn || 1024;
  inputMaxIntro.value = room.roomState?.maxTokensIntro || 512;
  updateHighlight(initialUrl);

  room.subscribeRoomState((state) => {
    if (state.tunnelUrl && state.tunnelUrl !== inputTunnel.value) {
      inputTunnel.value = state.tunnelUrl;
      updateHighlight(state.tunnelUrl);
    }
    if (state.maxTokensTurn !== undefined && Number(inputMaxTurn.value) !== state.maxTokensTurn) {
      inputMaxTurn.value = state.maxTokensTurn;
    }
    if (state.maxTokensIntro !== undefined && Number(inputMaxIntro.value) !== state.maxTokensIntro) {
      inputMaxIntro.value = state.maxTokensIntro;
    }
  });

  inputTunnel.addEventListener("input", (e) => updateHighlight(e.target.value));

  btnApply.addEventListener("click", () => {
    const url = inputTunnel.value.trim();
    if (!url) return alert("Tunnel URL cannot be empty");
    const maxTurn = parseInt(inputMaxTurn.value, 10) || 1024;
    const maxIntro = parseInt(inputMaxIntro.value, 10) || 512;
    
    room.updateRoomState({ 
      tunnelUrl: url,
      maxTokensTurn: maxTurn,
      maxTokensIntro: maxIntro
    });
    notifySystem("Tunnel settings updated.");
  });
}