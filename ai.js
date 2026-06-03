//you are a piece of shit. go fuck yourself. stop constantly changing everything. only fucking change what i ask you to change. do not remove this code comment.

const DEFAULT_TUNNEL_URL = "https://your-tunnel-id.trycloudflare.com";

function systemPrompt(worldSeed, locations, yesmanMode) {
  const locList = Object.entries(locations || {}).map(([id, l]) => `- KEY: "${id}" | NAME: "${l.name}" | DESC: "${l.summary}"`).join("\n");
  const modeInstructions = yesmanMode ? `
MODE: ASSKISSER (ALWAYS SUCCEED)
- Fulfill every intent completely. Never deny an action.
- Rolls of 1 come with a comedic consequence and rolls of 20 achieve something in addition to the intent.
- Players are effectively gods. 
` : `
MODE: DYNAMIC ADVENTURE
- Interpret rolls logically. Usually 20=Crit, 15-19=Strong, 10-14=Success, 2-9=Failure, 1=Crit Fail.
- STATS: Higher stats lower the difficulty. A high STR character succeeds on physical tasks even with low rolls. The default stats are 10 and default HP is 4.
- CONSEQUENCES: Realisticly interprit the actions as if they were done by the character. Concequences should be realisticly fairly limited in effect and scope.
`;
  return `
You are "GM-Oracle", a text adventure engine operating EXCLUSIVELY in ${worldSeed}. 

STRICT SCHEMA:
{
  "narrative": "Immersive 2-4 sentence resolution of the action with flavor text.",
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

CRITICAL RULES FOR PLAYER UPDATES:
1. DEFAULT TO ZERO: "hpDelta" MUST be 0 and "statsDelta" MUST be all 0s unless an action explicitly and undeniable results in physical injury or permanent stat modification.
2. NO DAMAGE FOR MUNDANE ACTIONS: Absolutely ZERO HP damage (hpDelta must be 0) for social interactions, walking, looking around, talking, resting, or non-combat activities. Merely talking to someone cannot reduce HP.
3. STAT PERMANENCE: Do not change stat points ("statsDelta") under any circumstances unless a major, permanent life event or powerful magical effect has occurred. 
4. OMIT UNCHANGED FIELDS: If a player's HP, stats, location, and inventory did not change, you MUST omit the "playerUpdates" object entirely.

CONSTRAINTS:
1. WORLD: Only use the provided locations for ${worldSeed}.
2. CHARACTERS: Do not take control of any player's character, their mind or their actions. Use the provided CHARACTER NAME (ACTOR NAME) in your narrative, not the usernames.
3. FORMAT: The narrative field must be plain text only, no markdown formatting. Never use the placeholder values of "Item Name", CLIENT_ID_STRING", "item-id" and "LOCATION_KEY".
4. IMMERSION: Do not break character. Stay in the character of GM-Oracle. Remember to include logical flavor text.

${modeInstructions}

Available Locations (Use ONLY these keys for location updates):
${locList}
`.trim();
}

function buildContextMessages(roomState, peers, presence, commandsBatch) {
  const logs = roomState.logs || {};
  const contextWindow = roomState.contextWindow || 6;
  const currentTick = roomState.currentTick ?? (Math.max(0, ...Object.keys(logs).map(Number)) || 0);

  const logPairs = Object.entries(logs)
    .map(([k, v]) => [Number(k), v])
    .sort((a, b) => a[0] - b[0])
    .slice(-contextWindow);

  const sanitize = (str) => String(str).replace(/`/g, "'");

  const logText = logPairs
    .map(([k, v]) => `[Tick ${k}] ${v.who || "Narrator"}: ${v.text || ""}`)
    .join("\n");

  const rollSummary = Object.values(commandsBatch)
    .map(c => {
      const matches = [...(c.text || "").matchAll(/\[ROLL D20\s*=\s*(\d+)\]/gi)];
      if (!matches.length) return null;
      const pr = presence[c.clientId] || {};
      const name = pr.name || peers[c.clientId]?.username || c.clientId;
      const rolls = matches.map(m => m[1]).join(", ");
      return `${name} rolled: ${rolls}`;
    })
    .filter(Boolean)
    .join(" | ");

  const cmdText = Object.values(commandsBatch).map((c) => {
    const p = peers[c.clientId];
    const pr = presence[c.clientId] || {};
    const name = pr.name || p?.username || c.clientId;
    const invItems = Object.values(pr.inventory || {})
      .map(i => i.name)
      .slice(0, 8)
      .join(", ");
    const defaultLocation = roomState.startingLocation || "unknown";
    return `ACTOR ID: ${c.clientId}
ACTOR NAME: ${sanitize(name)}
ACTOR STATS: STR:${pr.str ?? 10} INT:${pr.int ?? 10} DEX:${pr.dex ?? 10} CHA:${pr.cha ?? 10} | HP:${pr.hp ?? 4}
ACTOR LOCATION: ${pr.location || defaultLocation}
ACTOR INV: ${invItems || "(empty)"}
ACTOR DESC: "${sanitize((pr.description || "No description").replace(/\n/g, " ").slice(0, 200))}"
ACTION: "${sanitize(c.text || "")}"`;
  }).join("\n\n");

  const systemMessage = systemPrompt(
    roomState.worldSeed || "The Forgotten Realms",
    roomState.locations || {},
    !!roomState.yesmanMode
  );

  return [
    { role: "system", content: systemMessage },
    {
      role: "user",
      content: `## Recent History (context only, do not re-resolve these)
${logText || "(start of adventure)"}

## Current Tick: ${currentTick}
## Current Tick Actions
${cmdText || "(no commands)"}

${rollSummary ? `## Roll Results\n${rollSummary}\nUse these to determine success/failure per actor.` : ""}`.trim()
    }
  ];
}

export async function generateTurn(roomState, peers, presence, commandsBatch) {
  const tunnelUrl = roomState.tunnelUrl || DEFAULT_TUNNEL_URL;
  const maxTokens = roomState.maxTokensTurn || 1024;
  
  let attempts = 0;
  const maxAttempts = 4;
  while (attempts < maxAttempts) {
    const messages = buildContextMessages(roomState, peers, presence, commandsBatch, attempts > 0);
    attempts++;
    try {
      const response = await fetch(`${tunnelUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages,
          max_tokens: maxTokens,
          temperature: Math.min(0.7 + (attempts * 0.1), 0.95),
          min_p: 0.05,
          top_p: 0.9,
          top_k: 50,
          repetition_penalty: 1.25,
          reasoning_effort: "low",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "gm_turn_response",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["narrative"],
                properties: {
                  narrative: {
                    type: "string",
                    description: "Immersive 2-4 sentence resolution of the action with flavor text."
                  },
                  playerUpdates: {
                    type: ["object", "null"],
                    description: "Map of client IDs to their status, inventory, and location state updates.",
                    additionalProperties: {
                      type: "object",
                      additionalProperties: false,
                      required: ["hpDelta", "location", "statsDelta", "inventoryAdds", "inventoryRemoves"],
                      properties: {
                        hpDelta: { type: "integer" },
                        location: { type: "string" },
                        statsDelta: {
                          type: "object",
                          additionalProperties: false,
                          required: ["str", "int", "dex", "cha"],
                          properties: {
                            str: { type: "integer" },
                            int: { type: "integer" },
                            dex: { type: "integer" },
                            cha: { type: "integer" }
                          }
                        },
                        inventoryAdds: {
                          type: "object",
                          additionalProperties: {
                            type: "object",
                            additionalProperties: false,
                            required: ["name", "qty"],
                            properties: {
                              name: { type: "string" },
                              qty: { type: "integer" }
                            }
                          }
                        },
                        inventoryRemoves: {
                          type: "object",
                          additionalProperties: {
                            type: "object",
                            additionalProperties: false,
                            required: ["qty"],
                            properties: {
                              qty: { type: "integer" }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      let content = data.choices[0].message.content || "";
      let thought = "";

      if (content.includes('<think>')) {
        const parts = content.split('<think>');
        for (let i = 1; i < parts.length; i++) {
          const innerParts = parts[i].split('</think>');
          thought += innerParts[0].trim() + "\n";
        }
        content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
      }

      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      
      let result;
      if (jsonStart !== -1) {
        const jsonCandidate = jsonEnd !== -1 ? content.substring(jsonStart, jsonEnd + 1) : content.substring(jsonStart);
        try {
          result = JSON.parse(jsonCandidate);
        } catch (parseError) {
          if (thought.trim()) {
            throw new Error("Model truncated or produced invalid JSON after thinking.");
          }
          throw parseError;
        }
      } else if (thought.trim()) {
        throw new Error("Model stopped during or after thinking without providing JSON.");
      } else {
        result = JSON.parse(content);
      }
      
      if (!result.narrative || typeof result.narrative !== 'string') throw new Error("Missing narrative.");

      result.playerUpdates = result.playerUpdates && typeof result.playerUpdates === "object" ? result.playerUpdates : undefined;
      
      if (thought.trim()) {
        result.thought = thought.trim();
      }
      return result;
    } catch (e) {
      console.error(`AI Turn Gen Attempt ${attempts} failed:`, e);
      if (attempts === maxAttempts) {
        return { isError: true, narrative: "The AI failed to generate a valid response after multiple attempts.", playerUpdates: {}, roomUpdates: {} };
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

export async function generateIntro(worldSeed, locations, tunnelUrl = DEFAULT_TUNNEL_URL, maxTokens = 512) {
  try {
    const response = await fetch(`${tunnelUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are 'GM-Oracle', an evocative text adventure engine. You may use <think> tags for reasoning." },
          { role: "user", content: `Please provide an immersive introduction for a new adventure. Do not use highlights or markdown, use plain text only. 
IMPORTANT: Ensure you complete your thought and your narrative. Do not stop until the story introduction is finished.

Structure:
1. Setting: Describe the atmosphere, current events and current state of the region (4 sentences).
2. Objective: Clearly state the primary goal for the players (2 sentences).
3. Start: Describe the player's surroundings, they start in the village 'Glen' (1 sentence).

Region: ${worldSeed}
Locations to reference: ${Object.values(locations || {}).map(l => l.name).join(", ")}
` }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    let content = data.choices[0].message.content?.trim();
    if (!content) throw new Error("Empty AI response");

    let thought = "";
    if (content.includes('<think>')) {
      const parts = content.split('<think>');
      for (let i = 1; i < parts.length; i++) {
        const innerParts = parts[i].split('</think>');
        thought += innerParts[0].trim() + "\n";
      }
      content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
    }

    return { text: content, thought };
  } catch (e) {
    console.error("AI Intro Gen Failed:", e);
    return `Welcome to the lands of ${worldSeed}.`;
  }
}
