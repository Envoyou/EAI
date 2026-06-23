import { Router } from 'express';
import { ThinkingLevel } from '@google/genai';
import { getDraftGeneratorPrompt, getOutlineGeneratorPrompt, PROMPT_VERSION } from '@/lib/prompts';
import { ArticleMetadata } from '@eai/shared';
import { prisma } from '@/lib/db';
import { verifyToken } from '@clerk/backend';
import {
  extractGeminiText,
  gemini,
  getGeminiSamplingConfig,
  GROQ_MODEL,
  groq,
} from '@/lib/ai/provider-runtime';
import {
  buildEditorialAuditContext,
  ENVOYOU_EDITORIAL_PROFILE,
} from '@eai/shared';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { getWorkspaceState } from '@/lib/user-workspace';
import { getAllFeatureFlags } from '@eai/shared';

const router = Router();

const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.split('=').map((c) => c.trim());
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {} as Record<string, string>);
};

router.post('/', async (req, res) => {
  const featureFlags = await getAllFeatureFlags();
  if (featureFlags.maintenance_mode || !featureFlags.ai_processing_enabled) {
    return res.status(503).json({
      error: featureFlags.maintenance_mode
        ? 'Editorial processing is temporarily paused for maintenance.'
        : 'AI processing is temporarily disabled.',
    });
  }

  let authPayload: any = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      authPayload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
    } catch (err) {
      console.warn('Failed to verify Clerk token in /api/draft:', err);
    }
  }

  const userId = authPayload?.sub;
  const orgId = authPayload?.org_id || null;
  const orgSlug = authPayload?.org_slug || null;
  const orgRole = authPayload?.org_role || null;

  let workspace: any = null;
  let editorialProfile = ENVOYOU_EDITORIAL_PROFILE;

  if (!userId) {
    if (!featureFlags.demo_enabled) {
      return res.status(403).json({ error: 'Demo access is currently unavailable. Please log in.' });
    }

    const cookiesObj = parseCookies(req.headers.cookie);
    const demoCountStr = cookiesObj['eai_demo_count'];
    const demoCount = demoCountStr ? parseInt(demoCountStr, 10) : 0;

    if (demoCount >= 2) {
      return res.status(403).json({ error: 'Create a free account to continue. Get 10 free Editorial Credits.' });
    }

    const nextCount = demoCount + 1;
    res.cookie('eai_demo_count', nextCount.toString(), {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });

    workspace = {
      role: 'guest',
      organizationId: null,
      organization: {
        id: 'demo',
        clerkOrganizationId: null,
        slug: 'demo',
        name: 'Demo Workspace',
        publicationName: 'Demo Publication',
        domain: null,
        isActive: true,
        onboardingStatus: 'completed',
        profiles: [],
      },
      isAdmin: false,
      needsOnboarding: false,
      plan: {
        maxTextLength: 5000,
        creditsRemaining: 2 - nextCount,
        activePlan: 'guest',
        subscriptionStatus: 'none',
      },
    };
  } else {
    const fetchedWorkspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!fetchedWorkspace || fetchedWorkspace.needsOnboarding) {
      return res.status(409).json({ error: 'Workspace onboarding must be completed before drafting.' });
    }
    workspace = fetchedWorkspace;

    try {
      editorialProfile = await resolveEditorialProfileForUser(userId, workspace.organizationId);
    } catch (profileError) {
      console.warn('[Editorial Profile] Falling back to Envoyou default:', profileError);
    }
  }

  const workspaceOrganizationId = workspace.organizationId;
  const editorialAudit = buildEditorialAuditContext(editorialProfile, PROMPT_VERSION);
  const editorialLogFields = {
    editorialProfileVersionId: editorialAudit.editorialProfileVersionId,
    editorialProfileKey: editorialAudit.editorialProfileKey,
    editorialProfileVersionNo: editorialAudit.editorialProfileVersion,
    coreGuardrailsVersion: editorialAudit.coreGuardrailsVersion,
    promptConfigurationHash: editorialAudit.promptConfigurationHash,
  };

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type: string, data: unknown) => {
    res.write(JSON.stringify({ type, data }) + '\n');
  };

  try {
    const {
      topic,
      outline,
      referenceText,
      metadata,
      provider = 'gemini',
      draftMode = 'topic',
      mode = 'draft',
    } = req.body as {
      topic: string;
      outline?: string;
      referenceText?: string;
      metadata?: ArticleMetadata;
      provider?: 'gemini' | 'groq';
      draftMode?: 'topic' | 'outline' | 'reference' | 'press_release';
      mode?: 'draft' | 'outline';
    };

    if (!topic || !topic.trim()) {
      sendEvent('error', 'Topic is required');
      res.end();
      return;
    }

    const systemPrompt = mode === 'outline'
      ? getOutlineGeneratorPrompt(metadata, editorialProfile.config)
      : getDraftGeneratorPrompt(metadata, editorialProfile.config, draftMode);

    const isGeminiMock = provider === 'gemini' && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'empty');
    const isGroqMock = provider === 'groq' && (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'empty');

    if (isGeminiMock || isGroqMock) {
      sendEvent('status', 'generating');
      
      let mockContent = '';
      if (mode === 'outline') {
        mockContent = `## Introduction to ${topic}\n`;
        mockContent += `- Overview and significance of the topic.\n`;
        mockContent += `- Defining key concepts and core questions.\n\n`;
        mockContent += `## Key Pillars and Analysis\n`;
        mockContent += `- Critical analysis of key themes.\n`;
        mockContent += `- Industry benchmarks, practical data points, and context.\n`;
        mockContent += `- Challenges and common pitfalls.\n\n`;
        mockContent += `## Strategic Implications and Conclusion\n`;
        mockContent += `- Future outlook and strategic recommendations.\n`;
        mockContent += `- Actionable takeaways for decision makers.\n`;
      } else {
        let mockDraft = `## introduction to ${topic}\n\n`;
        mockDraft += `This is a mock draft generated for the topic: **${topic}**. In development mode, EAI streams this placeholder text to simulate the drafting process. EAI Drafting Assistant generates a structured draft based on user inputs.\n\n`;
        
        if (outline) {
          mockDraft += `## key outlines\n\n`;
          const lines = outline.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              mockDraft += `- Explored aspect: **${line.trim()}**\n`;
            }
          }
          mockDraft += `\n`;
        }

        if (referenceText) {
          mockDraft += `## data reference details\n\n`;
          mockDraft += `Based on reference notes: ${referenceText.slice(0, 150)}...\n\n`;
        }

        mockDraft += `## conclusion\n\n`;
        mockDraft += `This represents the end of the mock draft. You can now edit this text in the editor, customize it, and then click **Refine Draft** to start the staged AI editorial polishing, keyword checking, and final quality gate audit.\n`;
        
        mockContent = mockDraft;
      }

      const chunks = mockContent.split(' ');
      for (const chunk of chunks) {
        sendEvent('draft_chunk', chunk + ' ');
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      let savedLogId: string | undefined;
      if (userId) {
        try {
          const savedLog = await prisma.analysisLog.create({
            data: {
              userId,
              organizationId: workspaceOrganizationId,
              role: mode === 'outline' ? 'outline_generation' : 'draft_generation',
              content: mockContent,
              metadata: JSON.parse(JSON.stringify({
                topic,
                outline,
                referenceText,
                draftMode,
                metadataInput: metadata,
                provider,
                mode,
              })),
              promptVersion: PROMPT_VERSION,
              modelName: 'dev-mock-model',
              status: 'success',
              ...editorialLogFields,
            }
          });
          savedLogId = savedLog.id;
        } catch (dbError) {
          console.error('Failed to log mock draft/outline to database:', dbError);
        }
      }

      sendEvent('complete', { analysisLogId: savedLogId });
      res.end();
      return;
    }

    sendEvent('status', 'generating');
    const userPrompt = mode === 'outline'
      ? `Generate a structured outline for this topic:\nTOPIC: ${topic}`
      : `Generate a structured rough draft based on this topic:
TOPIC: ${topic}

${outline ? `OUTLINE / KEY POINTS:\n${outline}` : ''}
${referenceText ? `REFERENCE MATERIAL / SOURCE NOTES:\n${referenceText}` : ''}
`;

    let draftText = '';
    let modelName = 'unknown-model';

    if (provider === 'gemini') {
      modelName = 'gemini-3.5-flash';
      const draftStream = await gemini.models.generateContentStream({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          ...getGeminiSamplingConfig(modelName, 0.45),
          candidateCount: 1,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        }
      });

      for await (const chunk of draftStream) {
        const partText = extractGeminiText(chunk);
        draftText += partText;
        sendEvent('draft_chunk', partText);
      }
    } else {
      modelName = GROQ_MODEL;
      const groqStream = await groq.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        temperature: 0.45,
      });

      for await (const chunk of groqStream) {
        const partText = chunk.choices[0]?.delta?.content || '';
        draftText += partText;
        sendEvent('draft_chunk', partText);
      }
    }

    let savedLogId: string | undefined;
    if (userId) {
      try {
        const savedLog = await prisma.analysisLog.create({
          data: {
            userId,
            organizationId: workspaceOrganizationId,
            role: mode === 'outline' ? 'outline_generation' : 'draft_generation',
            content: draftText,
            metadata: JSON.parse(JSON.stringify({
              topic,
              outline,
              referenceText,
              draftMode,
              metadataInput: metadata,
              provider,
              mode,
            })),
            promptVersion: PROMPT_VERSION,
            modelName,
            status: 'success',
            ...editorialLogFields,
          }
        });
        savedLogId = savedLog.id;
      } catch (dbError) {
        console.error('Failed to log live draft/outline to database:', dbError);
      }
    }

    sendEvent('complete', { analysisLogId: savedLogId });
    res.end();
  } catch (error) {
    console.error('Draft generation error:', error);
    sendEvent('error', error instanceof Error ? error.message : String(error));
    res.end();
  }
});

export default router;
