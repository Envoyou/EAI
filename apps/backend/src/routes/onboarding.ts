import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { hashEditorialConfiguration, PREDEFINED_CATEGORIES, PREDEFINED_ARTICLE_TYPES } from '@eai/shared/server';
import { buildSandboxEditorialProfile, OnboardingDataSchema, OnboardingSaveSchema } from '@eai/shared';
import { ensureCurrentUserRecord, getWorkspaceState } from '@/lib/user-workspace';
import { gemini, getNativeGeminiConfig } from '@/lib/ai/provider-runtime';
import { getGeminiRequestTimeoutMs } from '@/lib/ai/gemini-request-policy';
import { bindResponseAbort } from '@/lib/request-abort';

const router = Router();

function cleanHtml(html: string): string {
  // Remove script, style, head, nav, footer, and other noisy markup
  const clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const tagRegex = /<(p|h1|h2|h3|h4|h5|h6)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const matches: string[] = [];
  let match;

  while ((match = tagRegex.exec(clean)) !== null) {
    const tag = match[1].toLowerCase();
    let content = match[2]
      .replace(/<[^>]+>/g, '') // Strip remaining inline HTML tags
      .trim();

    // Decode HTML entities
    content = content
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/\s+/g, ' '); // Collapse spaces

    if (content.length > 10) {
      if (tag.startsWith('h')) {
        matches.push(`\n## ${content}\n`);
      } else {
        matches.push(content);
      }
    }
  }

  return matches.join('\n');
}

async function scrapeWebsiteWithTimeout(url: string, _timeoutMs: number = 8000): Promise<string> {
  // 1. Try Jina Reader API first (free, returns clean markdown for modern JS/CSR sites and bypasses Cloudflare)
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4500); // 4.5 seconds timeout for Jina

    const jinaUrl = `https://r.jina.ai/${url}`;
    const jinaRes = await fetch(jinaUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain',
      },
    });
    clearTimeout(id);

    if (jinaRes.ok) {
      const text = await jinaRes.text();
      if (text && text.trim().length > 50) {
        console.log(`[ONBOARDING_SCRAPER] Successfully scraped via Jina Reader: ${url} (${text.length} chars)`);
        return text.slice(0, 10000);
      }
    }
  } catch (jinaErr) {
    console.warn('[ONBOARDING_SCRAPER] Jina Reader failed, falling back to basic fetch:', jinaErr);
  }

  // 2. Fallback: Direct basic fetch & clean HTML regex parser
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 3500); // 3.5 seconds timeout for direct fetch

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(id);

    if (!response.ok) {
      throw new Error(`Scrape HTTP Error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error('Unsupported content type');
    }

    const html = await response.text();
    const cleanText = cleanHtml(html);
    return cleanText.slice(0, 10000); // limit to 10k chars for LLM safety
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

function getFallbackProfile(workspaceName: string, primaryGoal: string, defaultLanguage: string) {
  const isId = defaultLanguage === 'id';
  const brandName = workspaceName || 'My Publication';

  let positioning = isId
    ? `Workspace editorial praktis untuk meningkatkan produktivitas konten ${brandName}.`
    : `A practical editorial workspace to accelerate content creation for ${brandName}.`;
  let audience = isId
    ? `Pembaca profesional dan pembuat keputusan yang mencari wawasan terpercaya.`
    : `Professional readers and decision-makers looking for reliable insights.`;
  let categories = ['Technology & AI', 'Business & Economy'];
  let articleTypes = ['News & Trend Analysis', 'Opinion / Op-Ed', 'In-Depth Guide / Explainer', 'How-To / Tutorial'];
  let tone = ['professional', 'clear', 'insightful'];

  if (primaryGoal === 'grow_traffic') {
    positioning = isId
      ? `Menggerakkan pertumbuhan lalu lintas organik melalui konten SEO berkualitas tinggi untuk ${brandName}.`
      : `Driving organic traffic growth through high-quality, SEO-optimized content for ${brandName}.`;
    audience = isId
      ? `Pengguna internet umum, peminat teknologi, dan konsumen digital.`
      : `General online readers, tech enthusiasts, and digital consumers.`;
    categories = ['Marketing & Growth', 'Technology & AI', 'Business & Economy'];
    articleTypes = ['Listicle', 'In-Depth Guide / Explainer', 'News & Trend Analysis'];
    tone = ['professional', 'conversational', 'engaging'];
  } else if (primaryGoal === 'research') {
    positioning = isId
      ? `Analisis mendalam dan riset berbasis data untuk mendukung pembaca ${brandName}.`
      : `In-depth analysis and data-driven research to empower ${brandName} readers.`;
    audience = isId
      ? `Para peneliti, analis, pendiri startup, dan eksekutif bisnis.`
      : `Researchers, analysts, founders, and business executives.`;
    categories = ['Data & Insight', 'Technology & AI', 'Business & Economy'];
    articleTypes = ['Case Study', 'In-Depth Guide / Explainer'];
    tone = ['analytical', 'data-driven', 'professional'];
  }

  return {
    brandName,
    positioning,
    audience,
    categories,
    articleTypes,
    tone,
    articleStructure: ['Hook', 'Context', 'Body', 'Strategic Closing'],
    additionalProhibitedPatterns: [],
    sourcePolicy: 'strict' as const,
    seoRules: {
      titleMaxLength: 120,
      metaTitleMaxLength: 60,
      metaDescriptionMaxLength: 155,
      tagCountMin: 3,
      tagCountMax: 5,
    },
    internalLinkDomains: [],
    internalLinkBaseUrl: '',
    customInstructions: '',
    allowedEditorialTerms: [],
  };
}

const buildOnboardingDataFromWorkspace = (
  workspace: Awaited<ReturnType<typeof getWorkspaceState>>
) => {
  const organization = workspace?.organization;
  const publicationName = organization?.publicationName || organization?.name || '';

  return {
    activation: {
      workspaceName: publicationName,
      website: organization?.domain || '',
      userRole: 'editor_in_chief' as const,
      acquisitionSource: 'google' as const,
      primaryGoal: 'grow_traffic' as const,
      defaultLanguage: 'auto' as const,
    },
    editorialProfile: null,
  };
};

const cannotConfigureClerkOrganization = (
  workspace: Awaited<ReturnType<typeof getWorkspaceState>>
) => Boolean(workspace?.organization?.clerkOrganizationId && !workspace.isAdmin);

const hasActiveClerkOrganization = (
  workspace: Awaited<ReturnType<typeof getWorkspaceState>>,
  clerkOrganizationId?: string | null
) => Boolean(
  clerkOrganizationId &&
  workspace?.organizationId &&
  workspace.organization?.clerkOrganizationId === clerkOrganizationId
);

// GET /api/onboarding
router.get('/', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const user = await ensureCurrentUserRecord(userId);
    if (!user) {
      return res.status(500).json({ error: 'Unable to sync user account' });
    }

    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!hasActiveClerkOrganization(workspace, orgId)) {
      return res.status(409).json({ error: 'Create or select a Clerk organization before starting onboarding.' });
    }
    const activeOrganizationId = workspace!.organizationId!;
    const activeOrganization = workspace!.organization!;
    if (cannotConfigureClerkOrganization(workspace)) {
      return res.status(403).json({ error: 'Only organization admins can configure this workspace.' });
    }
    if (!workspace?.needsOnboarding) {
      return res.json({
        completed: true,
        organization: workspace?.organization,
      });
    }

    const draft = await prisma.onboardingDraft.findUnique({
      where: { userId },
    });
    const activeDraft = draft?.organizationId === activeOrganizationId ? draft : null;
    return res.json({
      completed: false,
      step: activeDraft?.step || 'activation',
      organization: activeOrganization,
      data: activeDraft?.data || buildOnboardingDataFromWorkspace(workspace),
      hasStoredCredential: false,
    });
  } catch (error: unknown) {
    console.error('[ONBOARDING_GET]', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
  }
});

// PUT /api/onboarding
router.put('/', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    await ensureCurrentUserRecord(userId);
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!hasActiveClerkOrganization(workspace, orgId)) {
      return res.status(409).json({ error: 'Create or select a Clerk organization before starting onboarding.' });
    }
    const activeOrganizationId = workspace!.organizationId!;
    if (cannotConfigureClerkOrganization(workspace)) {
      return res.status(403).json({ error: 'Only organization admins can configure this workspace.' });
    }
    if (workspace && !workspace.needsOnboarding) {
      return res.status(409).json({ error: 'Workspace is already active.' });
    }

    const parsed = OnboardingSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error('[ONBOARDING_PUT_VALIDATION_ERROR] Detailed issues:', JSON.stringify(parsed.error.issues, null, 2));
      return res.status(400).json({ error: 'Invalid onboarding draft', issues: parsed.error.issues });
    }

    await prisma.onboardingDraft.upsert({
      where: { userId },
      update: {
        organizationId: activeOrganizationId,
        step: parsed.data.step,
        data: parsed.data.data,
      },
      create: {
        userId,
        organizationId: activeOrganizationId,
        step: parsed.data.step,
        data: parsed.data.data,
      },
    });

    return res.json({ success: true });
  } catch (error: unknown) {
    console.error('[ONBOARDING_PUT]', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
  }
});

// POST /api/onboarding/discover (SSE Stream)
router.post('/discover', requireAuth, async (req, res) => {
  const requestAbort = bindResponseAbort(res, 'Onboarding discovery');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (event: Record<string, unknown>) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });

    if (!hasActiveClerkOrganization(workspace, orgId)) {
      sendEvent({ type: 'error', error: 'Create or select a Clerk organization.' });
      return res.end();
    }

    const { workspaceName, website, primaryGoal, defaultLanguage } = req.body;
    if (!workspaceName) {
      sendEvent({ type: 'error', error: 'Workspace Name is required' });
      return res.end();
    }

    sendEvent({ type: 'thought_delta', text: `Analyzing parameters for "${workspaceName}"...\n` });

    let scrapedText = '';
    if (website && website.trim()) {
      sendEvent({ type: 'thought_delta', text: `Extracting brand identity from ${website.trim()}...\n` });
      try {
        scrapedText = await scrapeWebsiteWithTimeout(website.trim(), 8000);
        if (scrapedText) {
          sendEvent({ type: 'thought_delta', text: `Extracted ${scrapedText.length} characters from website.\n` });
        }
      } catch (err) {
        console.warn(`Scrape failed for ${website}, falling back directly to metadata generation:`, err);
        sendEvent({ type: 'thought_delta', text: `Website scrape bypassed, generating profile from workspace details.\n` });
      }
    } else {
      sendEvent({ type: 'thought_delta', text: `Generating brand identity for "${workspaceName}"...\n` });
    }

    const categoryList = PREDEFINED_CATEGORIES.flatMap((c) => c.items);
    const typeList = PREDEFINED_ARTICLE_TYPES.map((t) => t.name);

    const systemInstruction = `
You are an expert editorial strategist. Your task is to analyze the provided website text (if any) or workspace details to generate a highly customized and professional Editorial Profile for the brand.

Output a valid JSON object matching the following structure:
{
  "brandName": "Name of the brand/publication",
  "positioning": "A single-line or brief multi-line positioning statement (max 1000 chars) explaining what makes this brand unique and the value promised to readers.",
  "audience": "A description of the target audience (max 1000 chars) including demographics, interests, and professional roles.",
  "categories": ["Category 1", "Category 2"], // Choose 3-5 categories that best represent the brand from: ${JSON.stringify(categoryList)}
  "articleTypes": ["Type 1", "Type 2"], // Choose 2-4 article types that match the content style from: ${JSON.stringify(typeList)}
  "tone": ["tone1", "tone2", "tone3"] // Choose 3-5 tone words that describe the brand voice (e.g. professional, analytical, conversational, bold, data-driven, etc.)
}

Rules:
1. Conformance: All fields are mandatory in the output JSON.
2. categories MUST be exact matches of items from the provided category list.
3. articleTypes MUST be exact matches of items from the provided article types list.
4. If a website text is provided, analyze the brand name, topics, tone, and audience from the text.
5. If no website text is provided or if it is empty, generate appropriate guidelines based ONLY on the Workspace Name, Primary Goal, and Default Language.
6. The language of the positioning and audience fields should match the Default Language requested (English if 'en', Indonesian if 'id', and auto-detected or default language based on the scraped content if 'auto').
`;

    let generatedProfile;

    try {
      const promptContent = `
Workspace Name: ${workspaceName}
Primary Goal: ${primaryGoal}
Default Language: ${defaultLanguage}
${scrapedText ? `Scraped Website Content:\n${scrapedText}` : 'No website provided or scraping failed.'}
`;

      const requestTimeoutMs = getGeminiRequestTimeoutMs() ?? 15_000;
      const aiSignal = AbortSignal.any([
        requestAbort.signal,
        AbortSignal.timeout(requestTimeoutMs),
      ]);

      sendEvent({ type: 'thought_delta', text: `Synthesizing writing tone and categories with Gemini AI...\n` });

      const responseStream = await gemini.models.generateContentStream({
        model: 'gemini-3.5-flash',
        contents: promptContent,
        config: {
          abortSignal: aiSignal,
          systemInstruction,
          ...getNativeGeminiConfig(),
          thinkingConfig: {
            includeThoughts: true,
          },
          candidateCount: 1,
          responseMimeType: 'application/json',
        },
      });

      let rawText = '';
      for await (const chunk of responseStream) {
        if (requestAbort.signal.aborted) break;
        const candidate = chunk.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        for (const part of parts) {
          if ('thought' in part && part.thought && typeof part.text === 'string' && part.text) {
            sendEvent({ type: 'thought_delta', text: part.text });
          } else if (typeof part.text === 'string') {
            rawText += part.text;
          }
        }
        if (chunk.text && parts.length === 0) {
          rawText += chunk.text;
        }
      }

      if (!rawText.trim()) throw new Error('Empty response from LLM');

      sendEvent({ type: 'thought_delta', text: `\nFinalizing Editorial DNA and structure...\n` });

      const parsedJson = JSON.parse(rawText.trim());

      generatedProfile = {
        brandName: parsedJson.brandName || workspaceName,
        positioning: parsedJson.positioning || `Editorial workspace for ${workspaceName}`,
        audience: parsedJson.audience || 'General readers and professionals.',
        categories: Array.isArray(parsedJson.categories) && parsedJson.categories.length > 0
          ? parsedJson.categories.filter((c: string) => categoryList.includes(c))
          : ['Technology & AI', 'Business & Economy'],
        articleTypes: Array.isArray(parsedJson.articleTypes) && parsedJson.articleTypes.length > 0
          ? parsedJson.articleTypes.filter((t: string) => typeList.includes(t))
          : ['News & Trend Analysis', 'Opinion / Op-Ed'],
        tone: Array.isArray(parsedJson.tone) && parsedJson.tone.length > 0
          ? parsedJson.tone
          : ['professional', 'clear'],
        articleStructure: ['Hook', 'Context', 'Body', 'Strategic Closing'],
        additionalProhibitedPatterns: [],
        sourcePolicy: 'strict' as const,
        seoRules: {
          titleMaxLength: 120,
          metaTitleMaxLength: 60,
          metaDescriptionMaxLength: 155,
          tagCountMin: 3,
          tagCountMax: 5,
        },
        internalLinkDomains: website ? [new URL(website).hostname] : [],
        internalLinkBaseUrl: website ? `${website.replace(/\/$/, '')}/posts` : '',
        customInstructions: '',
        allowedEditorialTerms: [],
        primaryGoal,
        defaultLanguage,
      };
    } catch (err) {
      if (!requestAbort.signal.aborted) {
        console.error('Failed to generate editorial DNA with Gemini, falling back to defaults:', err);
        sendEvent({ type: 'thought', text: `Generated fallback profile for ${workspaceName}.` });
        generatedProfile = getFallbackProfile(workspaceName, primaryGoal, defaultLanguage);
      }
    }

    if (generatedProfile) {
      sendEvent({ type: 'profile', profile: generatedProfile });
    }
    sendEvent({ type: 'done' });
    return res.end();
  } catch (error) {
    if (requestAbort.signal.aborted) return;
    console.error('[ONBOARDING_DISCOVER_ERROR]', error);
    sendEvent({ type: 'error', error: 'Failed to generate editorial DNA profile' });
    return res.end();
  } finally {
    requestAbort.dispose();
  }
});

// POST /api/onboarding
router.post('/', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!hasActiveClerkOrganization(workspace, orgId)) {
      return res.status(409).json({ error: 'Create or select a Clerk organization before starting onboarding.' });
    }
    if (cannotConfigureClerkOrganization(workspace)) {
      return res.status(403).json({ error: 'Only organization admins can configure this workspace.' });
    }
    if (workspace && !workspace.needsOnboarding) {
      const existingProfile = await prisma.editorialProfile.findUnique({
        where: {
          organizationId_key: {
            organizationId: workspace.organizationId!,
            key: workspace.organization!.slug,
          },
        },
        select: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { id: true },
          },
        },
      });
      return res.json({
        success: true,
        alreadyCompleted: true,
        organization: workspace.organization,
        profileVersionId: existingProfile?.versions[0]?.id || null,
      });
    }

    const body = req.body || {};

    if (body.skip) {
      const publicationName =
        workspace?.organization?.publicationName ||
        workspace?.organization?.name ||
        'Publication';
      const sandboxProfileConfig = buildSandboxEditorialProfile(publicationName);

      try {
        const activated = await prisma.$transaction(async (tx) => {
          const organization = await tx.organization.update({
            where: { id: workspace!.organizationId! },
            data: {
              publicationName,
              isActive: true,
              onboardingStatus: 'completed',
              onboardingCompletedAt: new Date(),
              activatedAt: new Date(),
              acquisitionSource: null,
              acquisitionSourceOther: null,
              primaryGoal: null,
            },
          });
          const profile = await tx.editorialProfile.upsert({
            where: {
              organizationId_key: {
                organizationId: organization.id,
                key: organization.slug,
              },
            },
            update: {
              name: `${publicationName} Default`,
              isActive: true,
            },
            create: {
              organizationId: organization.id,
              key: organization.slug,
              name: `${publicationName} Default`,
              isActive: true,
            },
          });
          const latestVersion = await tx.editorialProfileVersion.findFirst({
            where: { profileId: profile.id },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const nextVersion = (latestVersion?.version || 0) + 1;
          const configHash = hashEditorialConfiguration(
            profile.key,
            nextVersion,
            sandboxProfileConfig
          );
          const version = await tx.editorialProfileVersion.create({
            data: {
              profileId: profile.id,
              version: nextVersion,
              config: sandboxProfileConfig,
              configHash,
            },
          });

          await tx.user.update({
            where: { id: userId },
            data: {
              organizationId: organization.id,
              role: 'admin',
              onboardingRole: null,
            },
          });

          await tx.onboardingDraft.deleteMany({ where: { userId } });

          return {
            organization,
            profileVersionId: version.id,
          };
        });

        return res.json({ success: true, ...activated });
      } catch (error) {
        console.error('[ONBOARDING_SKIP]', error);
        return res.status(500).json({ error: 'Failed to skip onboarding' });
      }
    }

    const draft = await prisma.onboardingDraft.findUnique({
      where: { userId },
    });
    if (!draft) {
      return res.status(404).json({ error: 'Onboarding draft not found' });
    }
    if (draft.organizationId !== workspace?.organizationId) {
      return res.status(409).json({ error: 'This onboarding draft belongs to a different organization.' });
    }

    const parsed = OnboardingDataSchema.safeParse(draft.data);
    if (!parsed.success) {
      console.error('[ONBOARDING_POST_VALIDATION_ERROR] Detailed issues:', JSON.stringify(parsed.error.issues, null, 2));
      return res.status(400).json({ error: 'Onboarding data is incomplete', issues: parsed.error.issues });
    }

    const { activation, editorialProfile } = parsed.data;

    // Use default sandbox profile if no profile was generated or confirmed
    const confirmedProfile = editorialProfile || buildSandboxEditorialProfile(activation.workspaceName);

    try {
      const activated = await prisma.$transaction(async (tx) => {
        const activatedOrganization = await tx.organization.update({
          where: { id: workspace!.organizationId! },
          data: {
            publicationName: activation.workspaceName ?? null,
            domain: activation.website ? activation.website : null,
            onboardingStatus: 'completed',
            acquisitionSource: activation.acquisitionSource ?? null,
            acquisitionSourceOther: activation.acquisitionSource === 'other' ? (activation.acquisitionSourceOther ?? null) : null,
            primaryGoal: activation.primaryGoal ?? null,
            onboardingCompletedAt: new Date(),
            activatedAt: new Date(),
          },
        });
        const profile = await tx.editorialProfile.upsert({
          where: {
            organizationId_key: {
              organizationId: activatedOrganization.id,
              key: activatedOrganization.slug,
            },
          },
          update: {
            name: `${activation.workspaceName} Default`,
            isActive: true,
          },
          create: {
            organizationId: activatedOrganization.id,
            key: activatedOrganization.slug,
            name: `${activation.workspaceName} Default`,
            isActive: true,
          },
        });
        const latestVersion = await tx.editorialProfileVersion.findFirst({
          where: { profileId: profile.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const nextVersion = (latestVersion?.version ?? 0) + 1;
        const configHash = hashEditorialConfiguration(profile.key, nextVersion, confirmedProfile);
        const version = await tx.editorialProfileVersion.create({
          data: {
            profileId: profile.id,
            version: nextVersion,
            config: confirmedProfile,
            configHash,
          },
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            organizationId: activatedOrganization.id,
            role: 'admin',
            onboardingRole: activation.userRole ?? null,
          },
        });
        await tx.onboardingDraft.delete({ where: { userId } });

        return {
          organization: activatedOrganization,
          profileVersionId: version.id,
        };
      });

      return res.json({ success: true, ...activated });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        return res.status(409).json({ error: 'Organization slug is already in use.' });
      }
      console.error('[ONBOARDING_ACTIVATE]', error);
      return res.status(500).json({ error: 'Failed to activate workspace' });
    }
  } catch (error) {
    console.error('[ONBOARDING_POST]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
