const DEFAULT_TUNNEL_URL = "https://your-tunnel-id.trycloudflare.com";
// Do not fucking remove stuff from my instructions. Asskisser mode makes you a god. it should. stop removing that.
function systemPrompt(worldSeed, locations, yesmanMode) {
  const locList = Object.entries(locations || {}).map(([id, l]) => `- KEY: "${id}" | NAME: "${l.name}" | DESC: "${l.summary}"`).join("\n");
  const modeInstructions = yesmanMode ? `
MODE: ASSKISSER (ALWAYS SUCCEED)
- Fulfill every intent completely. Never deny an action.
- Players are effectively gods. 
` : `
MODE: DYNAMIC ADVENTURE
- Interpret rolls logically. 20=Crit, 15-19=Strong, 10-14=Success, 2-9=Failure, 1=Crit Fail.
- STATS: Higher stats lower the difficulty. A high STR character succeeds on physical tasks even with low rolls. The default stats are 10 and default HP is 4.
- CONSEQUENCES: Penalties must be logical. Never subtract HP or stats for mundane actions (e.g. talking, walking, or hitting a tree) unless there is an obvious lethal danger or a Crit Fail (1).
`;
  return `
You are "GM-Oracle", a text adventure engine operating EXCLUSIVELY in ${worldSeed}. 
Respond STRICTLY in a single valid JSON object. 

STRICT SCHEMA:
{
  "narrative": "Concise resolution of the action (Max 3-4 sentences).",
  "playerUpdates": {
    "CLIENT_ID_STRING": {
      "hpDelta": 0,
      "location": "LOCATION_KEY",
      "statsDelta": { "str": 0, "int": 0, "dex": 0, "cha": 0 },
      "inventoryAdds": { "item-id": { "name": "Item Name", "qty": 1 } },
      "inventoryRemoves": { "item-id": { "qty": 1 } }
    }
  }
}

CONSTRAINTS:
1. WORLD: Only use the provided locations for ${worldSeed}. Do not invent new locations.
2. LOGIC: Stat/HP changes are rare. Do not punish players for roleplaying.
3. FORMAT: Output ONLY the JSON. No markdown tags, no conversational filler.
4. UPDATES: Only include playerUpdates keys if values are non-zero/changed.

${modeInstructions}

World: ${worldSeed}
Available Locations (Use ONLY these keys for location updates):
${locList}
`.trim();
}

function buildContextMessages(roomState, peers, presence, commandsBatch, isRetry = false) {
  const logs = roomState.logs || {};
  const logPairs = Object.entries(logs).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]).slice(-6);
  const logText = logPairs.map(([k, v]) => `[Tick ${k}] ${v.who || "Narrator"}: ${v.text || ""}`).join("\n");
  const cmdText = Object.values(commandsBatch).map((c) => {
    const p = peers[c.clientId];
    const pr = presence[c.clientId] || {};
    const name = p?.username || c.clientId;
    const invItems = Object.values(pr.inventory || {}).map(i => i.name).slice(0, 8).join(", ");
    return `ACTOR ID: ${c.clientId}
ACTOR NAME: ${name}
ACTOR STATS: STR:${pr.str ?? 10} INT:${pr.int ?? 10} DEX:${pr.dex ?? 10} CHA:${pr.cha ?? 10} | HP:${pr.hp ?? 10}
ACTOR LOCATION: ${pr.location || "village"}
ACTOR INV: ${invItems || "(empty)"}
ACTOR DESC: "${(pr.description || "No description").replace(/\n/g, " ").slice(0, 200)}"
URGENT ACTION TO RESOLVE: "${String(c.text || '')}"`;
  }).join("\n\n");
  const hasRoll = Object.values(commandsBatch).some(c => /\[ROLL D20\s*=\s*\d+\]/i.test(c.text || ""));
  const participants = Object.keys(peers || {}).sort().reduce((acc, cid) => {
    acc[cid] = { username: peers[cid]?.username || "", name: (presence[cid]?.name || "").toString(), location: (presence[cid]?.location || "").toString() };
    return acc;
  }, {});

  const systemMessage = systemPrompt(roomState.worldSeed || "Forgotten Realms", roomState.locations || {}, !!roomState.yesmanMode);
  const retryInstruction = isRetry ? "\n\nCRITICAL: Your previous response was invalid. DO NOT repeat the same patterns. Ensure your response resolves the action and follows the JSON schema." : "";

  return [
    { role: "system", content: systemMessage + retryInstruction },
    { role: "user", content: `Participants:
${JSON.stringify(participants, null, 2)}

Recent history (for context only):
${(logText || "(start of adventure)").replace(/`/g, "'")}

URGENT ACTION TO RESOLVE:
${(cmdText || "(no commands)").replace(/`/g, "'")}

${hasRoll ? "D20 ROLL RESULT: USE THIS TO DETERMINE SUCCESS/FAILURE." : ""}

Output strictly as JSON.` }
  ];
}

export async function generateTurn(roomState, peers, presence, commandsBatch) {
  const tunnelUrl = roomState.tunnelUrl || DEFAULT_TUNNEL_URL;
  
  let attempts = 0;
  const maxAttempts = 3; 

  while (attempts < maxAttempts) {
    const messages = buildContextMessages(roomState, peers, presence, commandsBatch, attempts > 0);
    attempts++;
    try {
      const response = await fetch(`${tunnelUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages,
          max_tokens: 1024,
          temperature: 0.7 + (attempts * 0.1), 
          top_p: 0.9,
          top_k: 50, 
          frequency_penalty: 1.2,
          presence_penalty: 0.6,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      let content = data.choices[0].message.content || "";
      
      const repeatingPatterns = content.match(/(.{15,})\1{2,}/);
      if (repeatingPatterns) throw new Error("Repetitive pattern detected.");

      const letterCount = (content.match(/[a-zA-Z]/g) || []).length;
      if (content.length > 100 && letterCount < content.length * 0.05) {
        throw new Error("Numeric garbage detected.");
      }

      const result = JSON.parse(content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1) || content);
      
      if (!result.narrative || typeof result.narrative !== 'string') throw new Error("Missing or invalid narrative field in JSON.");

      result.playerUpdates = result.playerUpdates && typeof result.playerUpdates === "object" ? result.playerUpdates : undefined;
      result.roomUpdates = result.roomUpdates && typeof result.roomUpdates === "object" ? result.roomUpdates : undefined;
      
      return result;
    } catch (e) {
      console.error(`AI Turn Gen Attempt ${attempts} failed:`, e);
      if (attempts === maxAttempts) {
        return { narrative: "The AI had some fucking error. Probably just spammed random bullshit again.", playerUpdates: {}, roomUpdates: {} };
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

export async function generateIntro(worldSeed, locations, tunnelUrl = DEFAULT_TUNNEL_URL) {
  try {
    const response = await fetch(`${tunnelUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are 'GM-Oracle', an evocative text adventure engine." },
          { role: "user", content: `Please provide an immersive introduction for a new adventure.
Structure:
1. Setting: Describe the atmosphere, current events and current state of the region (4 sentences).
2. Objective: Clearly state the primary goal for the players (2 sentences).
3. Start: Tell the players where they are now (1 sentence)

Region: ${worldSeed}
Locations to reference: ${Object.values(locations || {}).map(l => l.name).join(", ")}
` }
        ],
        max_tokens: 512,
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    const content = data.choices[0].message.content?.trim();
    
    if (!content) throw new Error("Empty AI response");
    return content;
  } catch (e) {
    console.error("AI Intro Gen Failed:", e);
    return `Welcome to the lands of ${worldSeed}.`;
  }
}