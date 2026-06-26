import { Router } from 'express';
import { gemini } from '@/lib/ai/provider-runtime';

const router = Router();

// Configure the model to use for the Content Strategist Wizard
const MODEL = 'gemini-3.5-flash';


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
      system_instruction: "You are an expert Data-Driven Content Strategist. Your goal is to analyze the user's data and act as a Thinking Partner to help them decide what to write next. Keep your responses concise, insightful, and engaging. DO NOT output Markdown formatting for this initial greeting.",
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
      system_instruction: "You are an expert Data-Driven Content Strategist. Always provide 3-4 dynamic, clickable suggestion options.",
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
    const history = messages.slice(0, -1).map((m: { role: string, content: string }) => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }]
    }));

    const contextPrompt = history.map((m: { role: string, content: { text: string }[] }) => `${m.role}: ${m.content[0].text}`).join('\n') + `\nuser: ${chatInput}\nassistant:`;

    if (mode === 'deep') {
      const interaction = await gemini.interactions.create({
        model: "gemini-3.1-pro-preview",
        input: contextPrompt + "\n\n[CRITICAL INSTRUCTION: YOU ARE IN DEEP RESEARCH MODE. Use Google Search thoroughly to gather facts, synthesize a comprehensive report, and ensure all claims are backed by credible sources.]",
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
    const stream = await gemini.interactions.create({
      model: MODEL,
      input: contextPrompt,
      tools: [
        { type: "google_search" }
      ],
      system_instruction: "CRITICAL: You are in FAST MODE. DO NOT perform more than 1 search iteration. You are an expert Data-Driven Content Strategist. For substantive queries, you MUST use Google Search. Be concise. At the VERY END of your response, provide exactly 3 suggestions for the user's next message, formatted exactly as: \n\n[SUGGESTIONS: Suggestion 1 | Suggestion 2 | Suggestion 3]",
      stream: true
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
            
            for (const annotation of sortedAnnotations) {
                if (annotation.type === "url_citation" && annotation.url) {
                    sources.push(annotation.url);
                    
                    if (!urlToIndex.has(annotation.url)) {
                        urlToIndex.set(annotation.url, urlToIndex.size + 1);
                        let domain = annotation.title;
                        if (!domain || domain.trim() === "") {
                            try {
                                domain = new URL(annotation.url).hostname.replace('www.', '');
                            } catch (_e) { domain = "Source"; }
                        }
                        const cleanDomain = domain.replace(/[[\]()*_`]/g, '').trim();
                        uniqueSourcesData.push({ url: annotation.url, domain: cleanDomain });
                    }
                    
                    const sourceIndex = urlToIndex.get(annotation.url);
                    // Perplexity style inline numbered pill
                    const citationStr = ` [${sourceIndex}](${annotation.url})`;
                    
                    // Convert UTF-8 byte offset to UTF-16 character index
                    const byteOffset = annotation.end_index || 0;
                    const encoder = new TextEncoder();
                    const bytes = encoder.encode(finalOutputText);
                    const safeByteOffset = Math.min(byteOffset, bytes.length);
                    const decoder = new TextDecoder('utf-8', { fatal: false });
                    const utf16Index = decoder.decode(bytes.slice(0, safeByteOffset)).length;
                    
                    finalOutputText = finalOutputText.slice(0, utf16Index) + citationStr + finalOutputText.slice(utf16Index);
                }
            }
            
            // (Markdown appending removed in favor of premium frontend favicon UI)
            
            if (finalOutputText) {
                res.write(`data: ${JSON.stringify({ type: "replace_text", text: finalOutputText })}\n\n`);
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
    const { recommendation } = req.body;

    const prompt = `
      You are a Master Content Strategist. The user has selected the following recommendation to draft:
      "${recommendation}"
      
      CRITICAL REQUIREMENT: You MUST use Google Search to find highly credible, real-world sources, data points, and factual references related to this topic. 
      The resulting "sources" array inside the plan MUST contain valid, real URLs to credible publications, reports, or data sources.
      The "draft" MUST include factual claims backed by the sources you found. 
      If you fail to provide real sources, the article will fail the final Editorial Fact-Checking stage.
      
      Write a brief, conversational summary in the 'reply' field explaining the blueprint to the user.
      Provide exactly two suggestions in the 'suggestions' array: "Proceed to Editor" and "Revise Blueprint".
      Output the detailed blueprint in the 'plan' object.
    `;

    const planSchema = {
      type: "object",
      properties: {
        reply: { type: "string" },
        suggestions: { type: "array", items: { type: "string" } },
        plan: {
          type: "object",
          properties: {
            angle: { type: "string" },
            audience: { type: "string" },
            hook: { type: "string" },
            outline: { type: "string" },
            seoIntent: { type: "string" },
            sources: { 
              type: "array", 
              items: { type: "string" },
              description: "Array of valid, real URLs to highly credible sources and data points found via Google Search that back up the claims."
            },
            draft: { type: "string" }
          },
          required: ["angle", "audience", "hook", "outline", "seoIntent", "sources", "draft"]
        }
      },
      required: ["reply", "suggestions", "plan"]
    };

    const interaction = await gemini.interactions.create({
      model: MODEL,
      input: prompt,
      tools: [{ type: "google_search" }],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: planSchema
      }
    });
    
    if (!interaction.output_text) {
        throw new Error("No output from model");
    }

    const data = JSON.parse(interaction.output_text);
    res.json(data);
  } catch (error) {
    console.error('Error in generate-plan:', error);
    res.status(500).json({ error: 'Failed to generate plan' });
  }
});

export default router;
