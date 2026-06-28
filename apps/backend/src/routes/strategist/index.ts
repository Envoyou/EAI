import { Router } from 'express';
import { gemini } from '@/lib/ai/provider-runtime';
import { getWorkspaceState } from '@/lib/user-workspace';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { composeEditorialPrompt, ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';

const router = Router();

// Configure the model to use for the Content Strategist Wizard
const MODEL = process.env.GEMINI_COPILOT_MODEL || 'gemini-3.5-flash';
const RESEARCH_MODEL = process.env.GEMINI_RESEARCH_MODEL || 'gemini-3.1-pro-preview';

// Fast-mode output control: higher limit for structured research material
const FAST_MODE_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_COPILOT_FAST_MAX_TOKENS) || 2048;
const FAST_MODE_TEMPERATURE = Number(process.env.GEMINI_COPILOT_FAST_TEMPERATURE) || 0.35;

const STRATEGIST_SYSTEM_PROMPT = `You are a senior content strategist for a B2B brand. 
Your role: analyze data, identify trends, and propose actionable editorial strategies.
Output style: concise, data-driven, structured. Avoid fluff.
Never write full articles — only research notes, outlines, and recommendations.`;


/**
 * 1. Analyze Data (Import Stage)
 */
router.post('/analyze-data', async (req, res) => {
  try {
    const { type, data } = req.body;
    let inputPrompt = '';

    if (type === 'csv' || type === 'url') {
      inputPrompt = `The user has uploaded their analytics data from: ${data}. Please analyze the top performing topics, traffic patterns, and user engagement, and propose a friendly opening message to start a discussion on their next content strategy.`;
    } else {
      inputPrompt = `The user provided the following manual performance metrics: "${data}". Please analyze this and propose a friendly opening message to start a discussion on their next content strategy.`;
    }

    const interaction = await gemini.interactions.create({
      model: MODEL,
      input: inputPrompt,
      system_instruction: STRATEGIST_SYSTEM_PROMPT + "\nKeep your responses concise, insightful, and engaging. DO NOT output Markdown formatting for this initial greeting.",
    });

    res.json({ reply: interaction.output_text });
  } catch (error) {
    console.error('Error analyzing data:', error);
    res.status(500).json({ error: 'Failed to analyze data' });
  }
});

/**
 * 1.5 Dynamic Greet
 */
router.post('/greet', async (req, res) => {
  try {
    const chatSchema = {
      type: "object",
      properties: {
        reply: { type: "string" },
        suggestions: { type: "array", items: { type: "string" } }
      },
      required: ["reply", "suggestions"]
    };

    const interaction = await gemini.interactions.create({
      model: MODEL,
      input: "Greet the user to EAI Research Copilot. Introduce yourself as a Thinking Partner. Be concise, friendly, and offer to analyze their blog data, research trends, or brainstorm content.",
      system_instruction: STRATEGIST_SYSTEM_PROMPT + "\nAlways provide 3-4 dynamic, clickable suggestion options.",
      response_format: { type: "text", mime_type: "application/json", schema: chatSchema }
    });

    let output;
    try {
      output = JSON.parse(interaction.output_text || '{}');
    } catch (_e) {
      output = { reply: interaction.output_text, suggestions: [] };
    }
    res.json({ reply: output.reply, suggestions: output.suggestions });
  } catch (error) {
    console.error('Error in greet:', error);
    res.status(500).json({ error: 'Failed to greet' });
  }
});

/**
 * 2. Insight Conversation (Chat)
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages, mode } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chatInput = messages[messages.length - 1].content;

    // Truncate history to last 6 messages to prevent context bloat.
    // Long assistant research outputs are further capped to avoid token spikes.
    const CHAT_HISTORY_WINDOW = 6;
    const ASSISTANT_MSG_MAX_CHARS = 1500;
    const rawHistory = messages.slice(0, -1);
    const windowedHistory = rawHistory.length > CHAT_HISTORY_WINDOW
      ? rawHistory.slice(-CHAT_HISTORY_WINDOW)
      : rawHistory;

    const history = windowedHistory.map((m: { role: string, content: string }) => {
      const text = m.role === 'assistant' && m.content.length > ASSISTANT_MSG_MAX_CHARS
        ? m.content.slice(0, ASSISTANT_MSG_MAX_CHARS) + '\n...[truncated for context]'
        : m.content;
      return { role: m.role, content: [{ type: 'text', text }] };
    });

    const contextPrompt = history.map((m: { role: string, content: { text: string }[] }) => `${m.role}: ${m.content[0].text}`).join('\n') + `\nuser: ${chatInput}\nassistant:`;

    if (mode === 'deep') {
      const interaction = await gemini.interactions.create({
        model: RESEARCH_MODEL,
        input: contextPrompt + "\n\n[CRITICAL INSTRUCTION: YOU ARE IN DEEP RESEARCH MODE. Use Google Search thoroughly to gather facts, synthesize a comprehensive report, and ensure all claims are backed by credible sources.]",
        system_instruction: STRATEGIST_SYSTEM_PROMPT,
        tools: [{ type: "google_search" }],
        background: true
      });
      
      console.log(`[BILLING] Deep Research started. Interaction ID: ${interaction.id}. Token usage will be billed upon completion.`);

      res.write(`data: ${JSON.stringify({ type: "deep_research_started", interaction_id: interaction.id })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
      return;
    }

    // FAST MODE
    const FAST_MODE_INSTRUCTION = `
CRITICAL: You are in FAST MODE — a quick research assistant.
Your task: answer the user's question with ONE focused, actionable insight.
Each response must:
- Be 2–4 sentences max (≈80–120 words).
- Ground all your factual claims. The system will automatically append citations, so do NOT manually type URLs in your response.
- End with exactly 3 short, clickable follow-up suggestions in this format:
[SUGGESTIONS: Suggestion 1 | Suggestion 2 | Suggestion 3]

DO NOT:
- Write long lists, summaries, or multiple sections.
- Repeat previous answers.
- Output markdown headings.

If the user asks for a broad topic, pick the most important angle and respond concisely.
`;

    const stream = await gemini.interactions.create({
      model: MODEL,
      input: contextPrompt,
      tools: [
        { type: "google_search" }
      ],
      system_instruction: STRATEGIST_SYSTEM_PROMPT + FAST_MODE_INSTRUCTION,
      stream: true,
      generation_config: {
        max_output_tokens: FAST_MODE_MAX_OUTPUT_TOKENS,
        temperature: FAST_MODE_TEMPERATURE,
      },
    });

    let finalOutputText = "";
    const sources: string[] = [];
    const globalAnnotations: { type?: string; url?: string; title?: string; end_index?: number }[] = [];

    for await (const event of stream) {
        if (event.event_type === "step.start") {
            if (event.step?.type === "google_search_call") {
                const queries = (event.step as { arguments?: { queries?: string[] } }).arguments?.queries;
                if (queries && queries.length > 0) {
                    res.write(`data: ${JSON.stringify({ type: "status", message: `Searching: "${queries[0]}"...` })}\n\n`);
                } else {
                    res.write(`data: ${JSON.stringify({ type: "status", message: "Searching the internet for real-time data..." })}\n\n`);
                }
            } else if (event.step?.type === "code_execution_call") {
                res.write(`data: ${JSON.stringify({ type: "status", message: "Executing data analysis script..." })}\n\n`);
            } else if (event.step?.type === "url_context_result" || event.step?.type === "url_context_call") {
                res.write(`data: ${JSON.stringify({ type: "status", message: "Retrieving content from provided URL..." })}\n\n`);
            }
        } else if (event.event_type === "step.delta") {
            if (event.delta?.type === "text" && event.delta.text) {
                finalOutputText += event.delta.text;
                res.write(`data: ${JSON.stringify({ type: "text", chunk: event.delta.text })}\n\n`);
            } else if (event.delta?.type === "text_annotation_delta" && event.delta.annotations) {
                globalAnnotations.push(...event.delta.annotations);
            }
        } else if (event.event_type === "interaction.completed") {
            // [ENVOYOU BILLING] Token Tracker Implementation
            const eventWithInteraction = event as { interaction?: { usage?: { total_input_tokens?: number; total_output_tokens?: number; total_tokens?: number } } };
            const usage = eventWithInteraction.interaction?.usage;
            if (usage) {
                console.log("\n[ENVOYOU INTERNAL BILLING] Fast Mode Execution Complete:");
                console.log(`- Input Tokens: ${usage.total_input_tokens || 0}`);
                console.log(`- Output Tokens: ${usage.total_output_tokens || 0}`);
                console.log(`- Total Tokens Billed: ${usage.total_tokens || 0}`);
                console.log("- TODO: Connect to Envoyou User Credit Database to deduct balance.\n");
            }

            const sortedAnnotations = [...globalAnnotations].sort((a: { end_index?: number }, b: { end_index?: number }) => {
                const endA = a.end_index || 0;
                const endB = b.end_index || 0;
                return endB - endA;
            });
            
            // Map to keep track of unique URLs and their footnote index
            const urlToIndex = new Map<string, number>();
            const uniqueSourcesData: { url: string; domain: string }[] = [];
            
            // Unfurl Google Vertex AI Grounding redirect URLs
            const resolvedUrls = new Map<string, string>();
            const urlsToResolve = [...new Set(sortedAnnotations.map(a => a.url).filter(Boolean))] as string[];
            
            await Promise.all(urlsToResolve.map(async (u) => {
                if (u.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
                    try {
                        const res = await fetch(u, { method: 'HEAD', redirect: 'manual' });
                        const loc = res.headers.get('location');
                        resolvedUrls.set(u, loc || u);
                    } catch (_e) {
                        resolvedUrls.set(u, u);
                    }
                } else {
                    resolvedUrls.set(u, u);
                }
            }));
            
            for (const annotation of sortedAnnotations) {
                if (annotation.type === "url_citation" && annotation.url) {
                    const realUrl = resolvedUrls.get(annotation.url) || annotation.url;
                    sources.push(realUrl);
                    
                    if (!urlToIndex.has(realUrl)) {
                        urlToIndex.set(realUrl, urlToIndex.size + 1);
                        let domain = annotation.title;
                        if (!domain || domain.trim() === "") {
                            try {
                                domain = new URL(realUrl).hostname.replace('www.', '');
                            } catch (_e) { domain = "Source"; }
                        }
                        const cleanDomain = domain.replace(/[[\]()*_`]/g, '').trim();
                        uniqueSourcesData.push({ url: realUrl, domain: cleanDomain });
                    }
                    
                    const sourceIndex = urlToIndex.get(realUrl);
                    // Perplexity style inline numbered pill
                    const citationStr = ` [${sourceIndex}](${realUrl})`;
                    
                    // Interactions API returns UTF-16 character index directly — no conversion needed
                    const charIndex = Math.min(annotation.end_index || 0, finalOutputText.length);
                    finalOutputText = finalOutputText.slice(0, charIndex) + citationStr + finalOutputText.slice(charIndex);
                }
            }
            
            // (Markdown appending removed in favor of premium frontend favicon UI)

            // Output is sent as-is — structured prompt keeps length bounded without lossy summarization
            const outputToSend = finalOutputText;
            
            if (outputToSend) {
                res.write(`data: ${JSON.stringify({ type: "replace_text", text: outputToSend })}\n\n`);
            }
            if (uniqueSourcesData.length > 0) {
                res.write(`data: ${JSON.stringify({ type: "sources", sources: uniqueSourcesData })}\n\n`);
            }
            res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        }
    }
    
    res.end();
  } catch (error) {
    console.error('Error in chat stream:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to chat' });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Stream failed" })}\n\n`);
      res.end();
    }
  }
});

/**
 * 3. Deep Research Status Polling
 */
router.get('/chat/status/:id', async (req, res) => {
  try {
    const interactionId = req.params.id;
    const interaction = await gemini.interactions.get(interactionId);
    
    res.json({
      state: interaction.status ? interaction.status.toUpperCase() : 'UNKNOWN',
      output: (interaction as { output_text?: string }).output_text || ''
    });
  } catch (error) {
    console.error('Error getting interaction status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * 4. Generate Pre-Editor Plan
 */
router.post('/generate-plan', async (req, res) => {
  try {
    const { recommendation, history } = req.body;

    let chatHistory = "";
    if (history && Array.isArray(history)) {
      // Truncate to last 8 messages to avoid bloating the blueprint prompt
      const HISTORY_WINDOW = 8;
      const trimmed = history.length > HISTORY_WINDOW
        ? history.slice(-HISTORY_WINDOW)
        : history;
      const truncationNote = history.length > HISTORY_WINDOW
        ? `[Note: showing last ${HISTORY_WINDOW} of ${history.length} messages]\n`
        : '';
      chatHistory = truncationNote + trimmed
        .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
        .join('\n');
    }

    const prompt = `
      ${STRATEGIST_SYSTEM_PROMPT}

      The user wants to generate a final blueprint based on the following context:
      "${recommendation}"
      
      Here is the preceding discussion history which contains the agreed-upon topic, audience, and outline:
      <history>
      ${chatHistory}
      </history>

      CRITICAL REQUIREMENT: You MUST use Google Search to find highly credible, real-world sources, data points, and factual references related to this topic. 
      The resulting "sources" array inside the plan MUST contain valid, real URLs to credible publications, reports, or data sources.
      The "draft" MUST include factual claims backed by the sources you found. 
      If you fail to provide real sources, the article will fail the final Editorial Fact-Checking stage.
      
      Write a brief, conversational summary in the 'reply' field explaining the blueprint to the user.
      Provide exactly two suggestions in the 'suggestions' array: "Proceed to Editor" and "Revise Blueprint".
      Output the detailed blueprint in the 'plan' object.

      CRITICAL: You MUST output a raw, valid JSON object matching this schema exactly. DO NOT wrap it in markdown code blocks like \`\`\`json.
      Schema:
      {
        "reply": "string",
        "suggestions": ["Proceed to Editor", "Revise Blueprint"],
        "plan": {
          "angle": "string",
          "audience": "string",
          "hook": "string",
          "outline": "string",
          "seoIntent": "string",
          "sources": ["url1", "url2"],
          "draft": "string"
        }
      }

      ADDITIONAL DRAFT RULES:
      - The 'draft' field must be a cohesive 400–600 word draft that synthesizes the outline and sources.
      - Keep the draft focused on the agreed angle and audience.
      - Do NOT include meta-commentary (e.g., "Here is your draft"). Just output the draft text.
    `;

    const interaction = await gemini.interactions.create({
      model: MODEL,
      input: prompt,
      tools: [{ type: "google_search" }],
      generation_config: {
        max_output_tokens: 4000,
        temperature: 0.5,
      }
    });
    
    if (!interaction.output_text) {
        throw new Error("No output from model");
    }

    let rawOutput = interaction.output_text;
    
    // Extract JSON object using regex in case the AI includes conversational text outside the block
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      rawOutput = jsonMatch[0];
    } else {
      rawOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    }

    const data = JSON.parse(rawOutput);
    res.json(data);
  } catch (error) {
    console.error('Error in generate-plan:', error);
    res.status(500).json({ error: 'Failed to generate plan' });
  }
});

/**
 * 5. Generate Draft from Notes
 */
router.post('/generate-draft-from-notes', async (req, res) => {
  try {
    let userId: string | null = null;
    let orgId: string | null = null;
    let orgSlug: string | null = null;
    let orgRole: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        if (token) {
          const { verifyToken } = await import('@clerk/backend');
          const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
          userId = payload.sub;
          orgId = (payload.org_id as string) || null;
          orgSlug = (payload.org_slug as string) || null;
          orgRole = (payload.org_role as string) || null;
        }
      } catch (authError) {
        console.warn('[Generate Draft Auth] Token verification failed:', authError);
      }
    }

    const { notes, metadata } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (!notes || notes.length === 0) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "No notes provided" })}\n\n`);
      res.end();
      return;
    }

    let workspace = null;
    if (userId) {
      workspace = await getWorkspaceState(userId, {
        clerkOrganizationId: orgId,
        clerkOrganizationSlug: orgSlug,
        clerkOrganizationRole: orgRole,
      });
    }
    
    let profile = ENVOYOU_EDITORIAL_PROFILE;
    try {
      if (userId) {
        profile = await resolveEditorialProfileForUser(userId, workspace?.organizationId);
      }
    } catch (profileError) {
      console.warn('[Editorial Profile] Profile resolution failed, falling back to Envoyou v1:', profileError);
    }

    const notesText = notes.map((n: { content: string; sources?: { url: string; domain?: string }[] }, i: number) => {
      const sourcesText = n.sources && n.sources.length > 0 
        ? `Sources: ${n.sources.map(s => s.url).join(', ')}`
        : '';
      return `NOTE ${i + 1}:\n${n.content}\n${sourcesText}`;
    }).join('\n\n---\n\n');

    const basePrompt = `
CRITICAL INSTRUCTION: You are a professional article writer.
Your task is to write a cohesive, engaging initial draft for an article using ONLY the following raw research notes as your factual basis.

[RAW RESEARCH NOTES]
${notesText}
[/RAW RESEARCH NOTES]

[ARTICLE METADATA]
Category: ${metadata?.category || 'General'}
Type: ${metadata?.type || 'Article'}
Target Audience: ${metadata?.targetAudience || 'General Audience'}
Writing Instructions: ${metadata?.brief || 'Write in a clear, professional, and engaging tone.'}
[/ARTICLE METADATA]

RULES:
- Target length: approximately 600–800 words (around 4–6 paragraphs).
- Use ONLY the provided research notes as your factual foundation. Do not add new facts or external information.
- Synthesize the notes into a flowing narrative, not a bullet-point summary.
- Maintain the requested tone, Target Audience, and Writing Instructions from the ARTICLE METADATA.
- Do NOT output bullet points unless strictly necessary for a list.
- Do NOT include any meta-commentary (e.g., "Here is your draft") or headings like "Draft:". Just output the draft content directly.

CRITICAL CITATION RULES:
- You MUST include inline markdown citations for every factual claim.
- Use ONLY the source URLs explicitly provided in the raw research notes.
- You MUST output the FULL markdown link using the exact URL provided in the sources, e.g. [Source Name](https://example.com/article).
- Do NOT invent new sources or URLs.
- Do NOT just output a number like [1] or [2] without the URL parentheses.
- Do NOT wrap the markdown link in an extra set of square brackets (do not use [[...]]).

EXAMPLE OF CORRECT CITATION:
If the note says:
"NOTE 1:
Apples are red.
Sources: https://apple.com/color"

Your draft MUST output:
"According to recent studies, apples are predominantly red ([Apple Color Study](https://apple.com/color))."`;

    const prompt = composeEditorialPrompt(basePrompt, profile);

    const stream = await gemini.interactions.create({
      model: MODEL,
      input: prompt,
      system_instruction: "You are an expert editorial writer. Synthesize research notes into a cohesive first draft.",
      stream: true,
      generation_config: {
        max_output_tokens: 4000,
        temperature: 0.6,
      },
    });

    for await (const event of stream) {
      if (event.event_type === "step.delta" && event.delta?.type === "text" && event.delta.text) {
        res.write(`data: ${JSON.stringify({ type: "text", chunk: event.delta.text })}\n\n`);
      } else if (event.event_type === "interaction.completed") {
        const eventWithInteraction = event as { interaction?: { usage?: { total_tokens?: number } } };
        const usage = eventWithInteraction.interaction?.usage;
        if (usage) {
          console.log(`\n[ENVOYOU INTERNAL BILLING] Generate Draft from Notes Complete. Total Tokens: ${usage.total_tokens || 0}`);
        }
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      }
    }
    
    res.end();
  } catch (error) {
    console.error('Error generating draft from notes:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate draft' });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Stream failed" })}\n\n`);
      res.end();
    }
  }
});

export default router;
