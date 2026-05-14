export function loadCharacter() { return null; }
export function saveCharacter() {}
export function resetCharacter() {}

export function newCharacter(username) {
  return {
    name: username || "Wanderer",
    hp: 4,
    maxHp: 4,
    str: 10,
    int: 10,
    dex: 10,
    cha: 10,
    location: "village",
    inventory: {},
    description: "",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function applyCharacterUpdate(char, update) {
  const c = { ...char };
  if (update.name) c.name = update.name;
  if (update.description !== undefined) c.description = update.description;
  if (typeof update.maxHp === "number") c.maxHp = update.maxHp;
  if (typeof update.hp === "number") c.hp = update.hp;
  if (typeof update.hpDelta === "number") c.hp = Math.max(0, Math.min(c.maxHp, c.hp + update.hpDelta));
  if (update.location) c.location = update.location;
  if (typeof update.str === "number") c.str = update.str;
  if (typeof update.int === "number") c.int = update.int;
  if (typeof update.dex === "number") c.dex = update.dex;
  if (typeof update.cha === "number") c.cha = update.cha;
  if (update.statsDelta) {
    const s = update.statsDelta;
    if (typeof s.str === "number") c.str = Math.max(1, c.str + s.str);
    if (typeof s.int === "number") c.int = Math.max(1, c.int + s.int);
    if (typeof s.dex === "number") c.dex = Math.max(1, c.dex + s.dex);
    if (typeof s.cha === "number") c.cha = Math.max(1, c.cha + s.cha);
  }
  if (update.inventory) c.inventory = update.inventory;
  if (update.inventoryAdds) {
    for (const key in update.inventoryAdds) {
      const item = update.inventoryAdds[key];
      const prev = c.inventory[key] || { name: item.name || key, qty: 0 };
      c.inventory[key] = { name: item.name || prev.name || key, qty: (prev.qty || 0) + (item.qty || 1) };
    }
  }
  if (update.inventoryRemoves) {
    for (const key in update.inventoryRemoves) {
      const qty = update.inventoryRemoves[key]?.qty ?? 1;
      const prev = c.inventory[key];
      if (prev) {
        const newQty = (prev.qty || 0) - qty;
        if (newQty > 0) c.inventory[key] = { ...prev, qty: newQty };
        else delete c.inventory[key];
      }
    }
  }
  c.updatedAt = Date.now();
  return c;
}