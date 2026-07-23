import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { softAuth } from './utils/helpers';
import {
  isMockScenario,
  type MockScenario,
  type MockSpeed,
  MOCK_TIMING_PRESETS,
} from './mock-chat-types';
import {
  ChatInputSchema,
  StrategistCancelRequestSchema,
  StrategistCancelResponseSchema,
  StrategistStatusResponseSchema,
  setStrategistSseHeaders,
  writeStrategistSseEvent,
  type StrategistSseEvent,
} from './chat-protocol';

export const mockChatRouter = Router();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface FlushableResponse extends Response {
  flush?: () => void;
}

interface MockDeepResearchInteraction {
  state: 'COMPLETED' | 'CANCELLED';
  output: string;
  cancelToken: string;
}

const mockDeepResearchInteractions = new Map<string, MockDeepResearchInteraction>();

export function resetMockChatStateForTests(): void {
  mockDeepResearchInteractions.clear();
}

function sendMockSSE(res: Response, event: StrategistSseEvent): boolean {
  const written = writeStrategistSseEvent(res, event);
  const flushable = res as FlushableResponse;
  if (written && typeof flushable.flush === 'function') {
    flushable.flush();
  }
  return written;
}

function buildMockTextChunks(scenario: MockScenario, topic: string): string[] {
  const cleanTopic = topic || (
    scenario === 'table' ? 'Content Performance Metrics' :
    scenario === 'code' ? 'API Payload Configuration' :
    scenario === 'sources' || scenario === 'grounding' ? 'Web Search Grounding' :
    scenario === 'long' || scenario === 'long-thinking' ? 'Editorial Strategy' :
    scenario === 'blueprint' ? 'Article Blueprint' :
    scenario === 'deep' ? 'Deep Research Topic' :
    'Content Strategy'
  );

  if (scenario === 'blueprint') {
    return [
      `# Content Blueprint: ${cleanTopic}\n\n`,
      `**Editorial Angle**: Data-Driven Operational Guide  \n`,
      `**Target Audience**: Senior Editors & Content Lead Professionals  \n`,
      `**Primary Search Intent**: Actionable implementation workflow  \n\n`,
      '---\n\n',
      '### Section Outline & Architecture\n\n',
      '1. **H1: Blueprint Master Overview**\n',
      '   - Hook: Address key friction points in scaling editorial operations.\n',
      '   - Key Takeaways: 3 core principles for workflow automation.\n\n',
      '2. **H2: Strategic Implementation & Metrics**\n',
      '   - Data Points: Industry benchmarks and performance indicators.\n',
      '   - Tactical Checklist: Step-by-step editorial verification.\n\n',
      '3. **H2: Quality Control & Publishing Readiness**\n',
      '   - Tone Calibration: Authoritative yet accessible.\n',
      '   - SEO Optimization: Keyword density and structural hierarchy.\n\n',
      `[SUGGESTIONS: Generate Blueprint for ${cleanTopic} | Proceed to Editor | Revise Blueprint Angle]`
    ];
  }

  if (scenario === 'split-frame') {
    return [
      `## SSE Split-Frame Network Test\n\n`,
      'This scenario verifies that the SSE parser handles split TCP packet frames cleanly without corrupting the streamed markdown response.\n\n',
      '### Verification Result\n',
      '1. **Packet Buffering**: Handled successfully.\n',
      '2. **JSON Frame Reassembly**: 100% intact.\n\n',
      `[SUGGESTIONS: Test Grounding Search | Test Blueprint | Test Deep Research]`
    ];
  }

  if (scenario === 'grounding') {
    return [
      `## Grounded Search Insights: ${cleanTopic}\n\n`,
      `Based on real-time web search results retrieved for **${cleanTopic}** [cite: 1]:\n\n`,
      '### Key Verified Findings\n',
      '1. **Industry Growth**: Recent search trends show a 34% increase in user interest for automated content tools [cite: 1].\n',
      '2. **Benchmark Shift**: Leading digital publications are transitioning toward hybrid human-AI editorial workflows [cite: 2].\n',
      '3. **SEO Standard**: Search engines prioritize original research, structured data, and explicit citation attribution [cite: 3].\n\n',
      `[SUGGESTIONS: Generate Blueprint for ${cleanTopic} | Expand Search Query | Draft Grounded Article]`
    ];
  }

  if (scenario === 'deep') {
    return [
      `# Deep Research Report: ${cleanTopic}\n\n`,
      `**Research ID**: \`mock-deep-${crypto.randomUUID().slice(0, 8)}\` | **Status**: Verified  \n`,
      `**Confidence Score**: 98.5% | **Sources Analyzed**: 14 authority publications\n\n`,
      '---\n\n',
      '### 1. Executive Intelligence Summary\n',
      `Our deep research scan for **${cleanTopic}** reveals significant content positioning opportunities. Existing top-ranking articles rely heavily on surface-level summaries, creating an opportunity for high-authority, data-backed execution.\n\n`,
      '### 2. Competitive Landscape & Gap Analysis\n',
      '| Competitor Strategy | Key Limitations | Envoyou Strategic Opportunity |\n',
      '| :--- | :--- | :--- |\n',
      '| Surface Overviews | Lacks actionable step-by-step implementation | Provide clear tactical execution workflows |\n',
      '| Academic Papers | Too complex for quick editorial consumption | Translate complex data into readable insights |\n',
      `| **Target Strategy** | **Niche Focus** | **High Authority + Practical Templates** |\n\n`,
      '### 3. Actionable Content Roadmap\n',
      '1. **Lead with Direct Value**: Answer primary search intent in the opening 150 words.\n',
      '2. **Embed Visual Data Blocks**: Use structured tables and verified benchmarks.\n',
      '3. **Quality Control Check**: Verify all claims against standard citation guides before publication.\n\n',
      `[SUGGESTIONS: Generate Blueprint for ${cleanTopic} | Refine Research Outline | Explore Competitor Gaps]`
    ];
  }

  if (scenario === 'table') {
    return [
      `## Performance Audit: ${cleanTopic}\n\n`,
      'Based on current channel metrics, here is the editorial distribution performance breakdown:\n\n',
      '| Content Pillar | Target Audience | Primary Metric | Frequency |\n',
      '| :--- | :--- | :--- | :--- |\n',
      `| Key Takeaways | Industry Leaders | Engagement Rate | 2x / week |\n`,
      `| In-depth Analysis | Technical Editors | Read Depth % | 1x / week |\n`,
      `| SEO Quick Hits | Organic Search | CTR & Conversions | Daily |\n\n`,
      '### Recommendation\n',
      'Prioritize high-depth technical content to increase reader session duration and organic backlinks.\n\n',
      `[SUGGESTIONS: Generate Blueprint for ${cleanTopic} | Analyze Read Depth % | Optimize SEO Quick Hits]`
    ];
  }

  if (scenario === 'code') {
    return [
      `## Article Payload Specification: ${cleanTopic}\n\n`,
      'Here is the JSON schema configuration for your article publishing workflow:\n\n',
      '```json\n',
      '{\n',
      `  "topic": "${cleanTopic}",\n`,
      '  "targetTone": "Authoritative",\n',
      '  "seoKeywords": ["editorial AI", "workflow", "content strategy"],\n',
      '  "status": "APPROVED"\n',
      '}\n',
      '```\n\n',
      '### Implementation Note\n',
      'Apply this payload directly to your CMS distribution pipeline or workspace settings.\n\n',
      `[SUGGESTIONS: Generate Blueprint for ${cleanTopic} | Customize Tone Settings | Export Payload to Editor]`
    ];
  }

  if (scenario === 'long' || scenario === 'long-thinking') {
    return [
      `## Comprehensive Masterplan: ${cleanTopic}\n\n`,
      '### 1. Executive Summary\n',
      `Executing a high-impact content initiative for **${cleanTopic}** requires aligning audience intent with editorial precision. Focus on high-search-volume keywords with low competitor keyword difficulty.\n\n`,
      '### 2. Content Pillars & Architecture\n',
      '- **Foundational Guides**: Establishing topical authority and organic search presence.\n',
      '- **Data-Driven Insights**: Harnessing analytics to validate key claims.\n',
      '- **Interactive Frameworks**: Engaging readers with practical templates and checklists.\n\n',
      '### 3. Execution Roadmap\n',
      'Ensure strict adherence to quality gates, fact-checking workflows, and SEO metadata standards before publication.\n\n',
      `[SUGGESTIONS: Generate Blueprint for ${cleanTopic} | Add Data-Driven Insights | Review Outline in Editor]`
    ];
  }

  if (scenario === 'sources') {
    return [
      `## Research Analysis: ${cleanTopic}\n\n`,
      `We analyzed real-time web sources regarding **${cleanTopic}** to derive these strategic recommendations [cite: 1]:\n\n`,
      '### Key Findings\n',
      '1. **Market Positioning**: Align messaging with authoritative editorial benchmarks.\n',
      '2. **Source Validation**: Cross-reference key metrics across trusted industry publications [cite: 2].\n',
      '3. **Content Expansion**: Focus on unanswered questions identified in search trends.\n\n',
      `[SUGGESTIONS: Generate Blueprint for ${cleanTopic} | Expand Research Sources | Draft Article Outline]`
    ];
  }

  // Default dynamic topic response matching real AI Strategist tone
  return [
    `## Editorial Strategy: ${cleanTopic}\n\n`,
    `Here is the strategic analysis for **${cleanTopic}**:\n\n`,
    `### Key Takeaways\n`,
    `1. **Audience Alignment**: Tailored for readers interested in *${cleanTopic}*.\n`,
    '2. **SEO & Clustering**: Structured for high-intent search visibility.\n',
    '3. **Quality Control**: Automated fact-checking and brand tone validation.\n\n',
    `[SUGGESTIONS: Generate Blueprint for ${cleanTopic} | Perform Deep Research | Refine Keyword Cluster]`
  ];
}

mockChatRouter.post('/', softAuth, async (req: Request, res: Response) => {
  const body = req.body || {};
  const parsedInput = ChatInputSchema.safeParse(body);
  if (!parsedInput.success) {
    return res.status(400).json({
      error: 'Invalid chat request',
      issues: parsedInput.error.issues,
    });
  }

  const { messages, mode, enableSearch, sessionId: requestedSessionId } = parsedInput.data;
  const chatInput = messages[messages.length - 1]?.content || '';
  const cleanTopic = chatInput.replace(/\[[a-zA-Z0-9_-]+\]/g, '').trim();
  const isDeepMode = mode === 'deep' || chatInput.includes('[deep]');
  const isSearchEnabled =
    enableSearch === true ||
    chatInput.includes('[search]') ||
    chatInput.includes('[grounding]');

  let scenario: MockScenario = 'default';
  if (isMockScenario(body.mockScenario)) {
    scenario = body.mockScenario;
  } else if (chatInput.includes('[split-frame]')) {
    scenario = 'split-frame';
  } else if (chatInput.includes('[blueprint]')) {
    scenario = 'blueprint';
  } else if (chatInput.includes('[thinking]') || chatInput.includes('[long-thinking]')) {
    scenario = 'long-thinking';
  } else if (chatInput.includes('[table]') || chatInput.includes('[tables]')) {
    scenario = 'table';
  } else if (chatInput.includes('[code]') || chatInput.includes('[codes]')) {
    scenario = 'code';
  } else if (chatInput.includes('[sources]') || chatInput.includes('[source]')) {
    scenario = 'sources';
  } else if (chatInput.includes('[grounding]') || chatInput.includes('[search]')) {
    scenario = 'grounding';
  } else if (chatInput.includes('[long]')) {
    scenario = 'long';
  } else if (chatInput.includes('[replace-text]')) {
    scenario = 'replace-text';
  } else if (chatInput.includes('[no-session]')) {
    scenario = 'no-session';
  } else if (chatInput.includes('[error-before-text]')) {
    scenario = 'error-before-text';
  } else if (chatInput.includes('[error-after-text]')) {
    scenario = 'error-after-text';
  } else if (chatInput.includes('[abrupt-close]')) {
    scenario = 'abrupt-close';
  } else if (chatInput.includes('[malformed-event]')) {
    scenario = 'malformed-event';
  } else if (chatInput.includes('[duplicate-done]')) {
    scenario = 'duplicate-done';
  } else if (chatInput.includes('[heartbeat-only]')) {
    scenario = 'heartbeat-only';
  } else if (chatInput.includes('[slow-first-byte]')) {
    scenario = 'slow-first-byte';
  } else if (isDeepMode) {
    scenario = 'deep';
  } else if (isSearchEnabled) {
    scenario = 'grounding';
  }

  const querySpeed =
    typeof req.query.mockSpeed === 'string' &&
    req.query.mockSpeed in MOCK_TIMING_PRESETS
      ? (req.query.mockSpeed as MockSpeed)
      : undefined;
  const bodySpeed =
    typeof body.mockSpeed === 'string' &&
    body.mockSpeed in MOCK_TIMING_PRESETS
      ? (body.mockSpeed as MockSpeed)
      : undefined;
  const speedInput: MockSpeed =
    querySpeed ||
    bodySpeed ||
    (process.env.VITEST === 'true'
      ? 'instant'
      : (process.env.MOCK_CHAT_SPEED as MockSpeed) || 'normal');
  const timing = MOCK_TIMING_PRESETS[speedInput] || MOCK_TIMING_PRESETS.normal;

  let initialDelay = timing.initialDelayMs;
  if (req.query.delay) {
    const parsedDelay = parseInt(String(req.query.delay), 10);
    if (!isNaN(parsedDelay)) {
      initialDelay = Math.min(2000, Math.max(0, parsedDelay));
    }
  }

  if (scenario === 'slow-first-byte') {
    initialDelay = 8000;
  }

  if (initialDelay > 0) {
    await sleep(initialDelay);
  }

  setStrategistSseHeaders(res);
  res.flushHeaders?.();

  if (scenario === 'heartbeat-only') {
    for (let i = 0; i < 3; i++) {
      if (res.writableEnded || res.destroyed) return;
      sendMockSSE(res, { type: 'heartbeat' });
      await sleep(timing.thinkingChunkDelayMs);
    }
    res.end();
    return;
  }

  if (scenario !== 'no-session') {
    const sessionId =
      requestedSessionId && requestedSessionId !== 'new'
        ? requestedSessionId
        : `mock-session-${crypto.randomUUID()}`;
    sendMockSSE(res, { type: 'session_init', sessionId });
  }

  const statusTopic = cleanTopic || 'query';

  if (scenario === 'error-before-text') {
    sendMockSSE(res, {
      type: 'error',
      error: 'Mock error before text generation.',
    });
    res.end();
    return;
  }

  if (isDeepMode) {
    const interactionId = `mock-interaction-${crypto.randomUUID()}`;
    const cancelToken = crypto.randomUUID();
    const output = buildMockTextChunks('deep', cleanTopic).join('');
    mockDeepResearchInteractions.set(interactionId, {
      state: 'COMPLETED',
      output,
      cancelToken,
    });
    sendMockSSE(res, {
      type: 'deep_research_started',
      interaction_id: interactionId,
      cancel_token: cancelToken,
    });
    sendMockSSE(res, { type: 'done' });
    res.end();
    return;
  }

  const thinkingChunks: string[] = scenario === 'grounding'
    ? [
        `Formulating Google Search queries for "${statusTopic}"...\n`,
        `Executing live web search: ["${statusTopic} trends", "${statusTopic} benchmarks 2026"]...\n`,
        `Retrieving & filtering domain authority sources from Google Search...\n`,
        `Extracting inline citations & factual grounding references...\n`,
      ]
    : scenario === 'long-thinking'
    ? [
        `Analyzing intent depth & semantic structure for "${statusTopic}"...\n`,
        `Evaluating reader friction points & bounce rate drivers...\n`,
        `Synthesizing competitive keyword difficulty vs search volume metrics...\n`,
        `Structuring optimal heading hierarchy (H1 -> H2 -> H3) for max readability...\n`,
        `Refining brand voice alignment & editorial tone calibrations...\n`,
        `Verifying factual consistency & citation integrity...\n`,
        `Finalizing strategic editorial recommendations...\n`,
      ]
    : scenario === 'blueprint'
    ? [
        `Initializing Editorial Blueprint Generator for "${statusTopic}"...\n`,
        `Defining target persona & primary search intent...\n`,
        `Drafting compelling opening hook & unique editorial angle...\n`,
        `Structuring 4-tier article section outline...\n`,
        `Finalizing Blueprint payload & follow-up recommendations...\n`,
      ]
    : [
        `Exploring editorial intent for "${statusTopic}"...\n`,
        `Searching content benchmarks for "${statusTopic}"...\n`,
        `Synthesizing structural insights for "${statusTopic}"...\n`,
      ];

  const isAborted = () => res.writableEnded || res.destroyed;
  const thinkingKind = scenario === 'grounding' ? 'grounding' : 'reasoning';

  for (const chunk of thinkingChunks) {
    if (isAborted()) return;
    sendMockSSE(res, { type: 'thinking', kind: thinkingKind, chunk });
    await sleep(timing.thinkingChunkDelayMs);
  }

  const textChunks = buildMockTextChunks(scenario, cleanTopic);
  const output =
    scenario === 'replace-text'
      ? `## Polished Content Strategy: ${cleanTopic || 'Editorial'}\n\nThis is the clean, final response for the Strategist request.\n\n[SUGGESTIONS: Generate Blueprint for ${cleanTopic || 'Editorial'} | Refine Strategy | Open Editor]`
      : textChunks.join('');

  if (scenario === 'error-after-text') {
    sendMockSSE(res, {
      type: 'replace_text',
      text: output.slice(0, Math.max(1, Math.floor(output.length / 2))),
    });
    await sleep(timing.textChunkDelayMs);
    sendMockSSE(res, {
      type: 'error',
      message: 'Stream failed',
    });
    res.end();
    return;
  }

  if (scenario === 'abrupt-close') {
    sendMockSSE(res, {
      type: 'replace_text',
      text: output.slice(0, Math.max(1, Math.floor(output.length / 2))),
    });
    res.destroy();
    return;
  }

  if (scenario === 'malformed-event') {
    res.write('data: { malformed_json: bad...\n\n');
    await sleep(timing.textChunkDelayMs);
  }

  const finalEvent: StrategistSseEvent = {
    type: 'replace_text',
    text: output,
  };
  if (scenario === 'split-frame') {
    const fullEvent = `data: ${JSON.stringify(finalEvent)}\n\n`;
    const half = Math.floor(fullEvent.length / 2);
    res.write(fullEvent.slice(0, half));
    await sleep(timing.textChunkDelayMs);
    res.write(fullEvent.slice(half));
  } else {
    sendMockSSE(res, finalEvent);
  }

  if (scenario === 'sources' || scenario === 'grounding') {
    const domainFromTopic = cleanTopic.includes('.')
      ? cleanTopic.replace(/^https?:\/\//, '').split('/')[0]
      : 'example.com';
    sendMockSSE(res, {
      type: 'sources',
      sources: [
        {
          url: cleanTopic.startsWith('http')
            ? cleanTopic
            : `https://${domainFromTopic}`,
          domain: domainFromTopic,
        },
        {
          url: 'https://ai.google.dev/gemini-api/docs',
          domain: 'ai.google.dev',
        },
        { url: 'https://schema.org/Article', domain: 'schema.org' },
      ],
    });
  }

  await sleep(timing.finalDelayMs);

  sendMockSSE(res, { type: 'done' });

  if (scenario === 'duplicate-done') {
    sendMockSSE(res, { type: 'done' });
  }

  res.end();
});

mockChatRouter.post('/status/:id/cancel', (req, res) => {
  const { id } = req.params;
  const interaction = mockDeepResearchInteractions.get(id);
  const parsedRequest = StrategistCancelRequestSchema.safeParse(req.body);
  if (
    !interaction ||
    !parsedRequest.success ||
    parsedRequest.data.cancelToken !== interaction.cancelToken
  ) {
    return res.status(403).json({ error: 'Invalid cancellation token' });
  }

  interaction.state = 'CANCELLED';
  interaction.output = '';
  return res.json(StrategistCancelResponseSchema.parse({ success: true }));
});

mockChatRouter.get('/status/:id', (req, res) => {
  const { id } = req.params;
  const interaction = mockDeepResearchInteractions.get(id);
  if (!interaction) {
    return res.status(500).json({ error: 'Failed to get status' });
  }

  return res.json(StrategistStatusResponseSchema.parse({
    state: interaction.state,
    output: interaction.output,
  }));
});
