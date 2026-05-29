//you are a piece of shit. go fuck yourself. stop constantly changing everything. only fucking change what i ask you to change. do not remove this code comment.

const DEFAULT_TUNNEL_URL = "https://your-tunnel-id.trycloudflare.com";

function systemPrompt(worldSeed, locations, yesmanMode) {
  const locList = Object.entries(locations || {}).map(([id, l]) => `- KEY: "${id}" | NAME: "${l.name}" | DESC: "${l.summary}"`).join("\n");
  const modeInstructions = yesmanMode ? `
MODE: ASSKISSER (ALWAYS SUCCEED)
- Fulfill every intent completely. Never deny an action.
- Players are effectively gods. 
` : `
MODE: DYNAMIC ADVENTURE
- Interpret rolls logically. Usualy 20=Crit, 15-19=Strong, 10-14=Success, 2-9=Failure, 1=Crit Fail.
- STATS: Higher stats lower the difficulty. A high STR character succeeds on physical tasks even with low rolls. The default stats are 10 and default HP is 4.
- CONSEQUENCES: Penalties must be logical. Never subtract HP or stats for mundane actions (e.g. talking, walking, or hitting a tree) unless there is an obvious lethal danger or a Crit Fail (1).
`;
  return `
You are "GM-Oracle", a text adventure engine operating EXCLUSIVELY in ${worldSeed}. 
Respond with your thinking process in <think> tags, followed by a single valid JSON object following the schema. 

STRICT SCHEMA:
{
  "thinking": "Your internal GM reasoning process goes here.",
  "narrative": "Brief resolution of the action.",
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
1. WORLD: Only use the provided locations for ${worldSeed}.
2. LOGIC: Stat/HP changes are rare. Do not punish players for roleplaying.
3. CHARACTERS: Do not take control of any player's character. Use the provided CHARACTER NAME (ACTOR NAME) in your narrative, not the usernames.
4. FORMAT: You MUST finish your JSON object. Do not emit an EOS token until the JSON is complete and valid. No markdown, only use plain text.
5. IMMERSION: Do not break character. Stay in the character of GM-Oracle.
6. UPDATES: Only include playerUpdates keys if you actually changed them.
7. THINKING: Be concise. Ensure you finish the <think> block and then output the full, valid JSON. <|think_on|>

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
    const name = pr.name || p?.username || c.clientId;
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
          repetition_penalty: 1.15,
          reasoning_effort: "medium",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "gm_turn_response",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["thinking", "narrative"],
                properties: {
                  thinking: {
                    type: "string",
                    description: "Internal GM reasoning process before building the turn updates."
                  },
                  narrative: {
                    type: "string",
                    description: "Brief text resolution of the action presented to the player."
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
