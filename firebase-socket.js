import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, push, onChildAdded, onDisconnect, serverTimestamp } from "firebase/database";

export class FirebaseSocket {
  constructor(databaseURL) {
    this.databaseURL = databaseURL;
    
    this.clientId = localStorage.getItem('dwd_client_id');
    if (!this.clientId) {
      this.clientId = Math.random().toString(36).slice(2, 11);
      localStorage.setItem('dwd_client_id', this.clientId);
    }

    this.peers = {};
    this.presence = {};
    this.roomState = {};
    this.onmessage = null;
    this._roomStateSubscribers = [];
    this._presenceSubscribers = [];
    this._presenceUpdateRequestsSubscribers = [];
    this.initialized = false;
    this._onReady = null;
    this.ready = new Promise(resolve => { this._onReady = resolve; });
  }

  async initialize() {
    const config = { 
      databaseURL: this.databaseURL,
      projectId: "dungeons-without-dragons-default-rtdb"
    };
    this.app = initializeApp(config);
    this.db = getDatabase(this.app, this.databaseURL);
    
    const cookieUser = this._getCookieUser();
    let user = { username: "Guest", avatar_url: "" };
    if (cookieUser.username) user.username = cookieUser.username;
    if (cookieUser.avatarUrl) user.avatar_url = cookieUser.avatarUrl;

    if (user.username === "Guest" || !user.username) {
      user.username = `Guest-${this.clientId.slice(0, 4)}`;
    }

    this.user = user;
    let firstRoomState = true;
    let firstPeersLoad = true;

    const myPeerRef = ref(this.db, `peers/${this.clientId}`);
    const myPresenceRef = ref(this.db, `presence/${this.clientId}`);
    const peersRef = ref(this.db, 'peers');
    const presenceRef = ref(this.db, 'presence');
    const roomStateRef = ref(this.db, 'roomState');
    const messagesRef = ref(this.db, 'messages');
    const presenceRequestsRef = ref(this.db, `presenceRequests/${this.clientId}`);

    this.peers[this.clientId] = { 
      username: user.username, 
      avatarUrl: user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`,
      online: true
    };

    await update(myPeerRef, { 
      username: user.username, 
      avatarUrl: this.peers[this.clientId].avatarUrl,
      online: true, 
      lastSeen: serverTimestamp() 
    });

    onDisconnect(myPeerRef).update({ online: false, lastSeen: serverTimestamp() });

    onValue(roomStateRef, (snap) => {
      this.roomState = snap.val() || {};
      this._roomStateSubscribers.forEach(cb => cb(this.roomState));
      if (firstRoomState && !firstPeersLoad) {
        firstRoomState = false;
        this.initialized = true;
        this._onReady();
      }
      firstRoomState = false;
    });

    onValue(presenceRef, (snap) => {
      this.presence = snap.val() || {};
      this._presenceSubscribers.forEach(cb => cb(this.presence));
    });

    onValue(peersRef, (snap) => {
      const newPeers = snap.val() || {};
      if (!firstPeersLoad && this.onmessage) {
        Object.keys(newPeers).forEach(id => {
          if (!this.peers[id]) this.onmessage({ data: { type: 'connected', username: newPeers[id].username } });
        });
        Object.keys(this.peers).forEach(id => {
          if (!newPeers[id]) this.onmessage({ data: { type: 'disconnected', username: this.peers[id].username } });
        });
      }
      this.peers = newPeers;
      if (firstPeersLoad && !firstRoomState) {
        this.initialized = true;
        this._onReady();
      }
      firstPeersLoad = false;
      this._presenceSubscribers.forEach(cb => cb(this.presence));
    });

    const startTime = Date.now() - 2000;
    onChildAdded(messagesRef, (snap) => {
      const msg = snap.val();
      if (msg && msg.timestamp > startTime) {
        if (msg.senderId !== this.clientId || msg.payload?.echo) {
          if (this.onmessage) this.onmessage({ data: msg.payload });
        }
      }
    });

    onChildAdded(presenceRequestsRef, (snap) => {
      const req = snap.val();
      if (req) {
        this._presenceUpdateRequestsSubscribers.forEach(cb => cb(req.update, req.fromClientId));
        set(ref(this.db, `presenceRequests/${this.clientId}/${snap.key}`), null);
      }
    });
  }

  updateRoomState(patch) {
    if (!this.initialized) return;
    const updates = {};
    const clean = (obj) => {
      if (obj === null || typeof obj !== 'object') return obj;
      const result = Array.isArray(obj) ? [] : {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) result[k] = clean(v);
      }
      return result;
    };

    for (const key in patch) {
      const val = patch[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const subKey in val) {
          const subVal = val[subKey];
          if (subVal !== undefined) updates[`${key}/${subKey}`] = clean(subVal);
        }
      } else if (val !== undefined) {
        updates[key] = clean(val);
      }
    }
    if (Object.keys(updates).length > 0) {
      update(ref(this.db, 'roomState'), updates);
    }
  }

  updatePresence(patch) {
    if (!this.initialized) return;
    update(ref(this.db, `presence/${this.clientId}`), patch);
  }

  updatePeerInfo(info) {
    if (!this.initialized) return;
    const myPeerRef = ref(this.db, `peers/${this.clientId}`);
    const updateData = {
      username: info.username,
      avatarUrl: info.avatarUrl,
      lastSeen: serverTimestamp(),
      online: true
    };
    update(myPeerRef, updateData);
    this.user.username = info.username;
    this.user.avatar_url = info.avatarUrl;
  }

  _getCookieUser() {
    const getC = (name) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    };
    return {
      username: getC('dwd_user_override'),
      avatarUrl: getC('dwd_avatar_override')
    };
  }

  subscribePresence(cb) { this._presenceSubscribers.push(cb); }
  subscribeRoomState(cb) { this._roomStateSubscribers.push(cb); }

  send(payload) {
    if (!this.initialized) return;
    push(ref(this.db, 'messages'), { senderId: this.clientId, payload, timestamp: serverTimestamp() });
  }

  requestPresenceUpdate(targetId, updateData) {
    if (!this.initialized) return;
    push(ref(this.db, `presenceRequests/${targetId}`), { fromClientId: this.clientId, update: updateData });
  }

  removePlayer(targetId) {
    if (!this.initialized) return;
    set(ref(this.db, `peers/${targetId}`), null);
    set(ref(this.db, `presence/${targetId}`), null);
    set(ref(this.db, `presenceRequests/${targetId}`), null);
  }

  subscribePresenceUpdateRequests(cb) { this._presenceUpdateRequestsSubscribers.push(cb); }
}