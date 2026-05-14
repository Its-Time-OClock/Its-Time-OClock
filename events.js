import { loadCharacter, saveCharacter, resetCharacter, applyCharacterUpdate, newCharacter } from "storage";
import { presenceToCharacter, characterToPresence } from "coordinator";
import { notifySystem, scheduleDiceRoll } from "ui";

export function setupRoomMessageHandler(room, renderSelf) {
  room.onmessage = (event) => {
    const data = event.data;
    switch (data.type) {
      case "connected":
        notifySystem(`${data.username} joined.`);
        break;
      case "disconnected":
        notifySystem(`${data.username} left.`);
        break;
      case "dice-roll":
        scheduleDiceRoll(data, room);
        break;
      case "reset-complete":
        notifySystem("The adventure was reset.");
        break;
      default:
        break;
    }
  };
}

export function setupPresenceUpdateHandler(room, renderSelf) {
  room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
    if (updateRequest?.type === "applyUpdates") {
      const myPresence = room.presence[room.clientId] || {};
      const applied = applyCharacterUpdate(presenceToCharacter(myPresence), updateRequest.patch || {});
      const key = room.clientId;
      saveCharacter(key, applied);
      room.updatePresence(characterToPresence(applied));
    } else if (updateRequest?.type === "restoreCharacter") {
      const char = updateRequest.character;
      if (char) {
        const key = room.clientId;
        saveCharacter(key, char);
        room.updatePresence(characterToPresence(char));
        renderSelf();
      }
    } else if (updateRequest?.type === "fullReset") {
      const key = room.clientId;
      resetCharacter(key);
      const me = room.peers[room.clientId];
      const username = me?.username;
      const nChar = newCharacter(username);
      saveCharacter(key, nChar);
      room.updatePresence({ name: nChar.name, hp: nChar.hp, maxHp: nChar.maxHp, str: nChar.str, int: nChar.int, dex: nChar.dex, cha: nChar.cha, location: nChar.location, inventory: nChar.inventory, description: nChar.description, lastAction: "", ready: true });
    }
  });
}