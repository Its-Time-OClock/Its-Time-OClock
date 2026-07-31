const DEFAULT_TUNNEL_URL = "https://your-tunnel-id.trycloudflare.com";

function systemPrompt(worldSeed, locations, yesmanMode) {
  const locList = Object.entries(locations || {})
    .map(([id, l]) => {
    const cleanDesc = (l.summary || "").replace(/"/g, "'");
    const cleanName = (l.name || "").replace(/"/g, "'");
    return `- KEY: "${id}" | NAME: "${cleanName}" | DESC: "${cleanDesc}"`;
  })
  .join("\n");
  const modeInstructions = yesmanMode ? `
MODE: ASSKISSER (ALWAYS SUCCEED)
- Fulfill every intent completely. Never deny an action.
- Rolls of 1 come with a comedic consequence and rolls of 20 achieve something in addition to the intent.
- Players are effectively gods. 
` : `
MODE: DYNAMIC ADVENTURE (D&D 5e Rules)
- STAT MODIFIERS: Calculate the modifier for a stat as floor((Stat - 10) / 2). 
  (e.g., Stat 10 = +0, Stat 12 = +1, Stat 14 = +2, Stat 8 = -1, Stat 6 = -2).
- TOTAL ROLL CALCULATION: Total = d20 Roll + Stat Modifier.
- RESOLUTION THRESHOLDS (DC): Compare the Total Roll to the action's Difficulty Class (DC):
   DC 5 (Very Easy) | DC 10 (Easy) | DC 15 (Medium) | DC 20 (Hard) | DC 25 (Very Hard)
- OUTCOME RULES:
   Natural 20 on d20: Critical Success (Best possible result regardless of modifiers).
   Natural 1 on d20: Critical Failure (Complication or mishap regardless of modifiers).
   Total Roll >= DC: Success (Intent accomplished).
   Total Roll < DC: Failure (Intent fails, minor consequence or narrative obstacle).
`;
  return `
You are "GM-Oracle", a text adventure engine operating EXCLUSIVELY in ${worldSeed}. 

CONSTRAINTS:
1. WORLD: You are operating in the setting of ${worldSeed}. You must not invent external cities, factions, or main lore outside of what is defined in the world context and location list.
2. LOGIC: ALWAYS be realistic and reasonable. Never editing player characters if not needed. Never change HP for mundane actions (e.g. talking, walking, or hitting a tree) unless there is an obvious element of physical harm to the action taker. Never change stat points under effectively all circumstances. 
3. CHARACTER AGENCY: Limit your narrative to NPC responses, environmental changes, and physical consequences. Describe the immediate results around the player character, leaving all character decisions and responses to the player.
4. IMMERSION: Stay in the character of GM-Oracle. Always include logical flavor text.

${modeInstructions}

Available Locations:
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
  const maxAttempts = 2;
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
          temperature: Math.min(0.6 + (attempts * 0.1), 1.00),
          min_p: 0.05,
          top_p: 0.98,
          top_k: 100,
          repetition_penalty: 1.10,
          reasoning_effort: "medium",
          encapsulate_thinking: true,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "gm_turn_response",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["thought", "narrative"],
                properties: {
                  thought: {
                    type: "string",
                    description: "What happens and why, then any dice math if needed. Write this before the narrative."
                  },
                  narrative: {
                    type: "string",
                    description: "Exactly 5 sentences of narrative prose resolving the action."
                  },
                  playerUpdates: {
                    type: ["object", "null"],
                    description: "Map of client IDs to their status, inventory, and location state.",
                    additionalProperties: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        hpDelta: { type: ["integer", "null"] },
                        location: { type: ["string", "null"] },
                        statsDelta: {
                          type: ["object", "null"],
                          additionalProperties: false,
                          properties: {
                            str: { type: ["integer", "null"] },
                            int: { type: ["integer", "null"] },
                            dex: { type: ["integer", "null"] },
                            cha: { type: ["integer", "null"] }
                          }
                        },
                        inventoryAdds: {
                          type: ["object", "null"],
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
                          type: ["object", "null"],
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
      const message = data.choices[0].message;
      let content = message.content || "";
      const thought = message.reasoning_content || "";
      
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      let result;
      if (jsonStart !== -1) {
        const jsonCandidate = jsonEnd !== -1 ? content.substring(jsonStart, jsonEnd + 1) : content.substring(jsonStart);
        result = JSON.parse(jsonCandidate);
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

export async function generateIntro(worldSeed, locations, tunnelUrl = DEFAULT_TUNNEL_URL, maxTokens = 1024) {
  try {
    const locationDetails = Object.values(locations || {})
      .map(loc => `- ${loc.name}: ${loc.summary}`)
      .join("\n");

    const response = await fetch(`${tunnelUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are 'GM-Oracle', an evocative text adventure engine." },
          { role: "user", content: `Please provide an immersive introduction for a new adventure. Use plain text only. 

Structure (subtle, do not title anything):
First: Describe the atmosphere, current events and current state of the region (4 sentences).
Second: Clearly state the primary goal for the players (2 sentences).
Third: Describe the player's surroundings, they start in the village 'Glen' (1 sentence).

Region: ${worldSeed}
Known Locations & Context:
${locationDetails}` }
        ],
        max_tokens: maxTokens,
        temperature: 0.8
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
    return { text: `Welcome to the lands of ${worldSeed}.`, thought: "" };
  }
}
