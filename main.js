import { newCharacter, loadCharacter, saveCharacter, resetCharacter } from "storage";
import { renderStats, renderPlayers, renderWorld, renderLogs } from "ui";
import { isCoordinator, ensureRoomInit, reconcileTurnOrder, coordinatorLoop, isMyTurn } from "coordinator";
import { setupCustomiseModal, checkCustomiseAvailability } from "modals";
import { setupCommandForm, submitCommand, setupActionButtons, setupCharacterButtons, setupSaveLoadButtons, setupResetButtons, setupyesmanToggle, setupUserSettings, setupTunnelSettings, setupTakeTurnButton } from "commands";
import { setupRoomMessageHandler, setupPresenceUpdateHandler } from "events";
import { FirebaseSocket } from "firebase-socket";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let hoveredPlayerId = null;
const room = new FirebaseSocket("https://dungeons-without-dragons-default-rtdb.europe-west1.firebasedatabase.app");
await room.initialize();
await room.ready;

function ensurePresenceInit() {
  const rs = room.roomState || {};
  const me = room.peers[room.clientId];
  
  const existingPresence = room.presence[room.clientId];
  
  if (existingPresence && existingPresence.ready) {
    room.updatePresence({ ready: true });
  } else {
    const char = newCharacter(me?.username);
    room.updatePresence({ ...char, lastAction: "", ready: true });
  }
}

ensurePresenceInit();
await ensureRoomInit(room);

setInterval(() => {
  reconcileTurnOrder(room);
  coordinatorLoop(room, saveCharacter);
}, 1000);

function renderSelf() {
  const target = hoveredPlayerId || room.clientId;
  renderStats(target, room, hoveredPlayerId);
  const myTurn = isMyTurn(room);
  const input = document.getElementById("command-input");
  const btnLook = document.getElementById("btn-look");
  const btnSkip = document.getElementById("btn-skip");
  const form = document.getElementById("command-form");
  input.disabled = !myTurn;
  btnLook.disabled = !myTurn;
  btnSkip.disabled = !myTurn;
  form.querySelector('button[type="submit"]').disabled = !myTurn;
  input.placeholder = myTurn ? "Type your action..." : "Waiting for your turn...";
  checkCustomiseAvailability(room, myTurn);
}

setupCommandForm(room);
window.addEventListener('retry-command', (e) => {
  const cmd = e.detail;
  if (cmd && cmd.text) submitCommand(room, cmd.text);
});
setupActionButtons(room, renderSelf);
setupCharacterButtons(room, renderSelf);
setupSaveLoadButtons(room, renderSelf);
setupResetButtons(room, ensurePresenceInit, renderSelf);
setupyesmanToggle(room);
setupUserSettings(room);
setupTunnelSettings(room);
setupTakeTurnButton(room);
setupCustomiseModal(room, renderSelf);
setupRoomMessageHandler(room, renderSelf);
setupPresenceUpdateHandler(room, renderSelf);

room.subscribePresence(() => {
  reconcileTurnOrder(room);
  renderSelf();
  const newHoveredId = renderPlayers(room, hoveredPlayerId, (pid) => { hoveredPlayerId = pid; renderSelf(); }, () => { hoveredPlayerId = null; renderSelf(); });
  if (newHoveredId === null) {
    hoveredPlayerId = null;
    renderSelf();
  }
  renderWorld(room);
});

room.subscribeRoomState(() => {
  renderWorld(room);
  renderLogs(room);
  renderSelf(); 
  renderPlayers(room, hoveredPlayerId, (pid) => { hoveredPlayerId = pid; renderSelf(); }, () => { hoveredPlayerId = null; renderSelf(); });
});

setInterval(() => {
  checkCustomiseAvailability(room, isMyTurn(room));
}, 1000);

await sleep(50);
renderSelf();
renderPlayers(room, hoveredPlayerId, (pid) => { hoveredPlayerId = pid; renderSelf(); }, () => { hoveredPlayerId = null; renderSelf(); });
renderWorld(room);
renderLogs(room);