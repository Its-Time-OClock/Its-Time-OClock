import { loadCharacter, saveCharacter, newCharacter, applyCharacterUpdate } from "storage";
import { presenceToCharacter, characterToPresence } from "coordinator";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export let lastCustomiseTime = 0;

export function checkCustomiseAvailability(room, isMyTurn) {
  const rs = room.roomState || {};
  const isyesman = !!rs.yesmanMode;
  const logs = rs.logs || {};
  const logKeys = Object.keys(logs);
  const isStart = logKeys.length === 1 && logKeys[0] === "1";
  const cd = Date.now() - lastCustomiseTime;
  const onCooldown = cd < 10000;
  const available = isyesman || isMyTurn || isStart;
  const btnCustomise = document.getElementById("btn-customise");
  btnCustomise.disabled = !available || onCooldown;
  if (onCooldown) {
    btnCustomise.title = `Cooldown (${Math.ceil((10000 - cd)/1000)}s)`
  } else if (!available) {
    btnCustomise.title = "Not available (Requires: Turn OR Start OR yesman Mode)"
  } else {
    btnCustomise.title = "Customise Character"
  }
}

export function setupCustomiseModal(room, renderSelf) {
  const btnCustomise = document.getElementById("btn-customise");
  const modalCust = document.getElementById("customise-modal");
  const formCust = document.getElementById("customise-form");
  const btnCustCancel = document.getElementById("btn-cust-cancel");
  btnCustomise.addEventListener("click", () => {
    if (btnCustomise.disabled) return;
    if (Date.now() - lastCustomiseTime < 10000) return;
    const char = presenceToCharacter(room.presence[room.clientId] || {});
    document.getElementById("cust-name").value = char.name || "";
    document.getElementById("cust-hp").value = char.hp;
    document.getElementById("cust-maxhp").value = char.maxHp;
    document.getElementById("cust-str").value = char.str;
    document.getElementById("cust-int").value = char.int;
    document.getElementById("cust-dex").value = char.dex;
    document.getElementById("cust-cha").value = char.cha;
    document.getElementById("cust-desc").value = char.description || "";
    const lines = []
    for(const k in char.inventory) {
      const it = char.inventory[k];
      lines.push(`${it.name || k} x${it.qty || 1}`);
    }
    document.getElementById("cust-inv").value = lines.join("\n");
    modalCust.classList.add("show");
    modalCust.setAttribute("aria-hidden", "false");
  });
  function closeCustModal() {
    modalCust.classList.remove("show");
    modalCust.setAttribute("aria-hidden", "true");
  }
  btnCustCancel.addEventListener("click", closeCustModal);
  formCust.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("btn-cust-save");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    try {
      const name = document.getElementById("cust-name").value.trim() || "Wanderer";
      const hp = Number(document.getElementById("cust-hp").value);
      const maxHp = Number(document.getElementById("cust-maxhp").value);
      const str = Number(document.getElementById("cust-str").value);
      const int = Number(document.getElementById("cust-int").value);
      const dex = Number(document.getElementById("cust-dex").value);
      const cha = Number(document.getElementById("cust-cha").value);
      const desc = document.getElementById("cust-desc").value.trim();
      const invText = document.getElementById("cust-inv").value;
      const inventory = {};
      const lines = invText.split("\n");
      for(const line of lines) {
        const trimmed = line.trim();
        if(!trimmed) continue;
        const match = trimmed.match(/^(.*?)\s*x(\d+)$/i);
        let iName = trimmed;
        let iQty = 1;
        if (match) {
          iName = match[1].trim();
          iQty = Math.max(1, parseInt(match[2], 10));
        }
        const key = iName.toLowerCase().replace(/[^a-z0-9]/g, "-");
        if (key) inventory[key] = { name: iName, qty: iQty };
      }
      const me = room.peers[room.clientId];
      const key = me?.username || room.clientId;
      const char = loadCharacter(key) || newCharacter(name);
      const updated = applyCharacterUpdate(char, { name, hp, maxHp, str, int, dex, cha, inventory, description: desc });
      saveCharacter(key, updated);
      room.updatePresence(characterToPresence(updated));
      lastCustomiseTime = Date.now();
      renderSelf(); 
      await sleep(500); 
      closeCustModal();
    } catch (err) {
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Changes";
    }
  });
}

export function setupReassignModal(room, executeLoad) {
  const modalReassign = document.getElementById("reassign-modal");
  const reassignList = document.getElementById("reassign-list");
  const btnReassignCancel = document.getElementById("btn-reassign-cancel");
  const btnReassignConfirm = document.getElementById("btn-reassign-confirm");

  let pendingLoadData = null;

  btnReassignCancel.addEventListener("click", () => {
    modalReassign.classList.remove("show");
    modalReassign.setAttribute("aria-hidden", "true");
    pendingLoadData = null;
  });

  btnReassignConfirm.addEventListener("click", () => {
    if (!pendingLoadData) return;
    const { data, mapToLoad } = pendingLoadData;
    const inputs = reassignList.querySelectorAll("select");

    inputs.forEach(sel => {
      const idx = parseInt(sel.dataset.idx, 10);
      const orphan = pendingLoadData.orphans[idx];
      const targetUsername = sel.value;

      if (targetUsername !== "skip") {
        mapToLoad[targetUsername] = orphan.char;
      }
    });

    modalReassign.classList.remove("show");
    modalReassign.setAttribute("aria-hidden", "true");
    executeLoad(data, mapToLoad);
    pendingLoadData = null;
  });

  return {
    setPendingLoadData: (data) => { pendingLoadData = data; }
  };
}