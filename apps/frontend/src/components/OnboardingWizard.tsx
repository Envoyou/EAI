'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  Globe2,
  Rocket,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  RefreshCw,
  Edit2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';

import { EAILogo } from '@/components/EAILogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DEFAULT_ONBOARDING_DATA, type OnboardingData, type OnboardingStep } from '@eai/shared';
import { fetchWithTimeout } from '@/lib/fetch-utils';

const STEPS: Array<{
  id: OnboardingStep;
  label: string;
  eyebrow: string;
  icon: typeof Building2;
}> = [
  { id: 'activation', label: 'Activation Desk', eyebrow: '01 / Setup', icon: Building2 },
  { id: 'discovery', label: 'DNA Discovery', eyebrow: '02 / AI Scan', icon: WandSparkles },
  { id: 'review', label: 'DNA Review', eyebrow: '03 / Review', icon: Rocket },
];

const GOALS = [
  { id: 'grow_traffic', icon: Globe2 },
  { id: 'publish_faster', icon: Rocket },
  { id: 'knowledge_base', icon: BookOpenText },
  { id: 'research', icon: Sparkles },
  { id: 'documentation', icon: FileText },
];

const USER_ROLES = [
  { id: 'editor_in_chief', icon: ShieldCheck },
  { id: 'editor_reviewer', icon: Edit2 },
  { id: 'content_writer', icon: FileText },
  { id: 'it_ops_admin', icon: Building2 },
];

const ACQUISITION_SOURCES = [
  'social_media',
  'colleague_recommendation',
  'google',
  'industry_blog',
  'chatgpt',
  'claude',
  'perplexity',
  'gemini',
  'other',
];

const PREDEFINED_CATEGORIES = [
  'Artificial Intelligence (AI)',
  'Software Engineering & Development',
  'Cybersecurity & Privacy',
  'Blockchain & Web3',
  'Consumer Technology & Gadgets',
  'Startups & Venture Capital',
  'Market Trends & Analysis',
  'E-commerce & Retail',
  'Leadership & Management',
  'Future Economy',
  'Personal Finance',
  'Stock Market & Investing',
  'Cryptocurrency',
  'Macroeconomics',
  'Content Creation & Strategy',
  'Social Media Dynamics',
  'Monetization & Audience Growth',
  'Digital Marketing',
  'SEO & Search Strategy',
  'Career Development',
  'Remote Work Culture',
  'Health & Wellness',
  'Society & Culture'
];

const PREDEFINED_ARTICLE_TYPES = [
  'News & Trend Analysis',
  'Opinion / Op-Ed',
  'In-Depth Guide / Explainer',
  'How-To / Tutorial',
  'Case Study',
  'Listicle',
  'Review & Comparison',
  'Interview / Q&A',
];

export function OnboardingWizard() {
  const router = useRouter();
  const t = useTranslations('Onboarding');
  const [data, setData] = useState<OnboardingData>(() => structuredClone(DEFAULT_ONBOARDING_DATA));
  const [step, setStep] = useState<OnboardingStep>('activation');
  const [activationSubStep, setActivationSubStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activeOrganization, setActiveOrganization] = useState<{ name: string; slug: string } | null>(null);
  
  // Loading dynamic micro-copy & SSE thinking stream
  const [streamText, setStreamText] = useState('');
  const incomingQueueRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const discoverCancelledRef = useRef(false);
  const discoveryAbortControllerRef = useRef<AbortController | null>(null);
  const discoveryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discoveryTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth typewriter ticker loop
  useEffect(() => {
    if (!discovering && !incomingQueueRef.current) return;

    const timer = setInterval(() => {
      if (incomingQueueRef.current.length > 0) {
        const chunkSize = incomingQueueRef.current.length > 80 ? 6 : incomingQueueRef.current.length > 30 ? 3 : 1;
        const nextChars = incomingQueueRef.current.slice(0, chunkSize);
        incomingQueueRef.current = incomingQueueRef.current.slice(chunkSize);

        setStreamText((prev) => prev + nextChars);

        if (scrollRef.current) {
          scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
      }
    }, 18);

    return () => clearInterval(timer);
  }, [discovering]);

  const currentIndex = STEPS.findIndex((item) => item.id === step);
  const currentStep = STEPS[currentIndex] || STEPS[0];

  const loadDraft = useCallback(async () => {
    try {
      const response = await fetchWithTimeout('/api/onboarding', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to load onboarding.');
      if (result.completed) {
        router.replace('/workspace');
        return;
      }
      setActiveOrganization(result.organization || null);
      if (result.data) {
        setData(result.data);
      }
      setStep(result.step || 'activation');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load onboarding.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  useEffect(() => () => {
    discoveryAbortControllerRef.current?.abort();
    if (discoveryIntervalRef.current) clearInterval(discoveryIntervalRef.current);
    if (discoveryTransitionRef.current) clearTimeout(discoveryTransitionRef.current);
  }, []);

  const updateActivation = (
    key: keyof OnboardingData['activation'],
    value: string
  ) => {
    setData((current) => {
      const nextActivation = { ...current.activation, [key]: value };
      return { ...current, activation: nextActivation };
    });
  };

  const updateProfile = <K extends keyof NonNullable<OnboardingData['editorialProfile']>>(
    key: K,
    value: NonNullable<OnboardingData['editorialProfile']>[K]
  ) => {
    setData((current) => {
      if (!current.editorialProfile) return current;
      return {
        ...current,
        editorialProfile: { ...current.editorialProfile, [key]: value },
      };
    });
  };

  const runDiscovery = async () => {
    discoveryAbortControllerRef.current?.abort();
    const controller = new AbortController();
    discoveryAbortControllerRef.current = controller;
    discoverCancelledRef.current = false;
    setDiscovering(true);
    setStreamText('');
    incomingQueueRef.current = '';
    setStep('discovery');

    try {
      const response = await fetch('/api/onboarding/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(data.activation),
      });

      if (discoverCancelledRef.current) return;

      if (!response.ok || !response.body) {
        throw new Error('Discovery stream failed to start.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done || discoverCancelledRef.current) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if ((event.type === 'thought_delta' || event.type === 'thought') && event.text) {
                incomingQueueRef.current += event.text;
              } else if (event.type === 'profile' && event.profile) {
                setData((current) => ({
                  ...current,
                  editorialProfile: event.profile,
                }));
              } else if (event.type === 'done') {
                discoveryTransitionRef.current = setTimeout(() => {
                  if (discoverCancelledRef.current) return;
                  setStep('review');
                  setDiscovering(false);
                }, 800);
              } else if (event.type === 'error') {
                throw new Error(event.error || 'Discovery stream error');
              }
            } catch (err) {
              if (err instanceof Error && err.message.includes('Discovery stream error')) throw err;
              console.error('[ONBOARDING_SSE_PARSE_ERROR]', err);
            }
          }
        }
      }
    } catch (error) {
      if (discoverCancelledRef.current || controller.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : 'Discovery failed. Loading defaults.');
      
      const workspaceName = data.activation.workspaceName || activeOrganization?.name || 'Publication';
      const fallbackProfile = {
        brandName: workspaceName,
        positioning: `A practical editorial workspace for ${workspaceName}.`,
        audience: 'General readers and professionals.',
        categories: ['Technology & AI', 'Business & Economy'],
        articleTypes: ['News & Trend Analysis', 'Opinion / Op-Ed'],
        tone: ['professional', 'clear'],
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
        primaryGoal: data.activation.primaryGoal,
        defaultLanguage: data.activation.defaultLanguage,
      };

      setData((current) => ({
        ...current,
        editorialProfile: fallbackProfile,
      }));

      discoveryTransitionRef.current = setTimeout(() => {
        if (discoverCancelledRef.current) return;
        setStep('review');
        setDiscovering(false);
      }, 1000);
    } finally {
      if (discoveryAbortControllerRef.current === controller) {
        discoveryAbortControllerRef.current = null;
      }
    }
  };

  const saveDraft = async (nextStep: OnboardingStep, updatedData?: OnboardingData) => {
    setSaving(true);
    try {
      const dataToSave = updatedData || data;
      const response = await fetchWithTimeout('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: nextStep,
          data: dataToSave,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save onboarding draft');
      }
      setData(dataToSave);
      setStep(nextStep);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  const validateActivation = () => {
    return Boolean(data.activation.workspaceName.trim());
  };

  const goNext = async () => {
    if (step === 'activation') {
      if (!validateActivation()) {
        toast.error('Please enter a Workspace Name.');
        return;
      }
      await saveDraft('discovery');
      void runDiscovery();
    }
  };

  const goBack = async () => {
    const previous = step === 'review' ? 'activation' : 'activation';
    await saveDraft(previous as OnboardingStep);
  };

  const activateWorkspace = async () => {
    setActivating(true);
    try {
      await saveDraft('review');
      const response = await fetchWithTimeout('/api/onboarding', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Workspace activation failed.');
      }
      toast.success('Workspace active. Editorial DNA profile v1 has been created!');
      router.replace('/workspace');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Workspace activation failed.');
    } finally {
      setActivating(false);
    }
  };

  const skipOnboarding = async () => {
    setSaving(true);
    try {
      const response = await fetchWithTimeout('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to skip onboarding.');
      toast.success('Onboarding skipped. Default sandbox workspace activated.');
      router.replace('/workspace');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to skip onboarding.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCategory = (category: string) => {
    if (!data.editorialProfile) return;
    const current = data.editorialProfile.categories || [];
    const next = current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category];
    updateProfile('categories', next);
  };

  const handleToggleArticleType = (articleType: string) => {
    if (!data.editorialProfile) return;
    const current = data.editorialProfile.articleTypes || [];
    const next = current.includes(articleType)
      ? current.filter((item) => item !== articleType)
      : [...current, articleType];
    updateProfile('articleTypes', next);
  };

  const handleToggleTone = (tone: string) => {
    if (!data.editorialProfile) return;
    const current = data.editorialProfile.tone || [];
    const next = current.includes(tone)
      ? current.filter((item) => item !== tone)
      : [...current, tone];
    updateProfile('tone', next);
  };

  const handleAddCustomTone = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const target = event.currentTarget;
    const newTone = target.value.trim().toLowerCase();
    if (!newTone || !data.editorialProfile) return;
    const current = data.editorialProfile.tone || [];
    if (!current.includes(newTone)) {
      updateProfile('tone', [...current, newTone]);
    }
    target.value = '';
    event.preventDefault();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)] font-sans">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          <EAILoaderStatusIcon className="h-4 w-4 text-[var(--primary)]" />
          Preparing launch desk
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] font-sans">
      {/* Titlebar Header */}
      <header className="ide-titlebar relative z-20 flex h-[48px] shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-5 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--primary)]">
            <EAILogo className="size-5" />
          </div>
          <div>
            <div className="font-sans text-sm font-bold text-[var(--foreground)]">Publication Launch Desk</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              EAI workspace onboarding
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Multi-Island Shell Body */}
      <main className="relative z-10 flex min-h-0 flex-1 gap-3 overflow-hidden p-2.5 md:p-3">
        {/* Navigation Sidebar Island */}
        <aside className="hidden lg:flex w-[280px] shrink-0 flex-col justify-between rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-[inset_0_0_0_1px_var(--card-border),0_2px_8px_rgba(0,0,0,0.12)]">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
              Launch sequence
            </div>
            <p className="mt-2 font-sans text-xs leading-relaxed text-[var(--muted-foreground)]">
              Simple, fast, with AI. Let EAI analyze your brand instantly.
            </p>

            <div className="mt-6 space-y-2">
              {STEPS.map((item, index) => {
                const Icon = item.icon;
                const active = item.id === step;
                const complete = index < currentIndex;
                return (
                  <div
                    key={item.id}
                    className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition select-none ${
                      active
                        ? 'border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--foreground)]'
                        : complete
                          ? 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)]'
                          : 'border-transparent opacity-50 text-[var(--muted-foreground)]'
                    }`}
                  >
                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                      complete
                        ? 'bg-[var(--success)]/10 text-[var(--success)]'
                        : active
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                          : 'bg-[var(--surface-3)] text-[var(--muted-foreground)]'
                    }`}>
                      {complete ? <Check className="size-4" /> : <Icon className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                        {item.eyebrow}
                      </div>
                      <div className={`mt-0.5 truncate font-sans text-xs font-semibold ${active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
                        {item.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 font-sans text-xs leading-relaxed text-[var(--muted-foreground)]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
            <span>
              All publication settings can be re-configured anytime from workspace settings.
            </span>
          </div>
        </aside>

        {/* Wizard Main Content Canvas Island */}
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 md:p-10 shadow-[inset_0_0_0_1px_var(--card-border),0_2px_8px_rgba(0,0,0,0.12)]">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-between">
            <div>
              <div className="mb-6">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
                  {currentStep.eyebrow}
                </div>
                <h1 className="mt-2 font-sans text-2xl font-bold tracking-tight text-[var(--foreground)] md:text-3xl">
                  {currentStep.label}
                </h1>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="flex-1"
                >
                  {step === 'activation' && (
                    <div className="space-y-6">
                      {/* Sub-step Progress Bar & Indicator */}
                      <div className="space-y-2 mb-6">
                        <div className="flex items-center justify-between text-xs font-mono text-[var(--muted-foreground)]">
                          <span className="flex items-center gap-1.5 font-semibold text-[var(--primary)]">
                            <Sparkles className="size-3.5" />
                            {t('questions.progress', { current: activationSubStep + 1, total: 6 })}
                          </span>
                          <span>{t('questions.completed', { percent: Math.round(((activationSubStep + 1) / 6) * 100) })}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[var(--surface-3)] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--success)] transition-all duration-300 ease-out rounded-full"
                            style={{ width: `${((activationSubStep + 1) / 6) * 100}%` }}
                          />
                        </div>
                      </div>

                      <AnimatePresence mode="wait">
                        <motion.div
                          key={activationSubStep}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="space-y-6"
                        >
                          {/* Q1: Workspace Name */}
                          {activationSubStep === 0 && (
                            <div className="space-y-4">
                              <h2 className="text-xl font-bold font-sans text-[var(--foreground)] md:text-2xl">
                                {t('questions.q1.title')}
                              </h2>
                              <p className="text-sm font-sans text-[var(--muted-foreground)] leading-relaxed">
                                {t('questions.q1.desc')}
                              </p>
                              <Input
                                variant="surface"
                                type="text"
                                autoFocus
                                value={data.activation.workspaceName}
                                onChange={(event) => updateActivation('workspaceName', event.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && data.activation.workspaceName.trim()) {
                                    e.preventDefault();
                                    setActivationSubStep(1);
                                  }
                                }}
                                placeholder={t('questions.q1.placeholder')}
                                className="h-12 font-sans text-base md:text-lg px-4"
                              />
                            </div>
                          )}

                          {/* Q2: Publication Website */}
                          {activationSubStep === 1 && (
                            <div className="space-y-4">
                              <h2 className="text-xl font-bold font-sans text-[var(--foreground)] md:text-2xl">
                                {t('questions.q2.title')} <span className="text-xs font-mono font-normal text-[var(--muted-foreground)] uppercase ml-2">{t('questions.q2.optional')}</span>
                              </h2>
                              <p className="text-sm font-sans text-[var(--muted-foreground)] leading-relaxed">
                                {t('questions.q2.desc')}
                              </p>
                              <Input
                                variant="surface"
                                type="url"
                                autoFocus
                                value={data.activation.website}
                                onChange={(event) => updateActivation('website', event.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    setActivationSubStep(2);
                                  }
                                }}
                                placeholder={t('questions.q2.placeholder')}
                                className="h-12 font-sans text-base md:text-lg px-4"
                              />
                            </div>
                          )}

                          {/* Q3: User Role */}
                          {activationSubStep === 2 && (
                            <div className="space-y-4">
                              <h2 className="text-xl font-bold font-sans text-[var(--foreground)] md:text-2xl">
                                {t('questions.q3.title')}
                              </h2>
                              <p className="text-sm font-sans text-[var(--muted-foreground)] leading-relaxed">
                                {t('questions.q3.desc')}
                              </p>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {USER_ROLES.map((role) => {
                                  const active = data.activation.userRole === role.id;
                                  const RoleIcon = role.icon;
                                  return (
                                    <Button
                                      key={role.id}
                                      type="button"
                                      onClick={() => {
                                        updateActivation('userRole', role.id);
                                        setTimeout(() => setActivationSubStep(3), 150);
                                      }}
                                      variant="surface"
                                      aria-pressed={active}
                                      className={`onboarding-card-option transition cursor-pointer select-none border ${
                                        active
                                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] ring-1 ring-[var(--primary)]/50'
                                          : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)]'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between w-full mb-2">
                                        <div className="flex items-center gap-2.5">
                                          <div className={`p-2 rounded-lg ${active ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'bg-[var(--surface-3)] text-[var(--muted-foreground)]'}`}>
                                            <RoleIcon className="size-4" />
                                          </div>
                                          <span className="font-sans text-sm font-bold text-[var(--foreground)]">{t(`questions.q3.roles.${role.id}.title`)}</span>
                                        </div>
                                        {active && <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" />}
                                      </div>
                                      <p className="font-sans text-xs leading-relaxed text-[var(--muted-foreground)] whitespace-normal">
                                        {t(`questions.q3.roles.${role.id}.desc`)}
                                      </p>
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Q4: Acquisition Source */}
                          {activationSubStep === 3 && (
                            <div className="space-y-4">
                              <h2 className="text-xl font-bold font-sans text-[var(--foreground)] md:text-2xl">
                                {t('questions.q4.title')}
                              </h2>
                              <p className="text-sm font-sans text-[var(--muted-foreground)] leading-relaxed">
                                {t('questions.q4.desc')}
                              </p>
                              <div className="grid gap-2.5 sm:grid-cols-3">
                                {ACQUISITION_SOURCES.map((srcId) => {
                                  const active = data.activation.acquisitionSource === srcId;
                                  return (
                                    <Button
                                      key={srcId}
                                      type="button"
                                      onClick={() => {
                                        updateActivation('acquisitionSource', srcId);
                                        if (srcId !== 'other') {
                                          setTimeout(() => setActivationSubStep(4), 150);
                                        }
                                      }}
                                      variant="surface"
                                      aria-pressed={active}
                                      className={`onboarding-card-option transition cursor-pointer select-none border ${
                                        active
                                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] ring-1 ring-[var(--primary)]/50'
                                          : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)]'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between w-full mb-1">
                                        <span className="font-sans text-xs font-bold text-[var(--foreground)]">{t(`questions.q4.sources.${srcId}.label`)}</span>
                                        {active && <CheckCircle2 className="size-3.5 shrink-0 text-[var(--success)]" />}
                                      </div>
                                      <span className="font-sans text-[10px] text-[var(--muted-foreground)] truncate">{t(`questions.q4.sources.${srcId}.hint`)}</span>
                                    </Button>
                                  );
                                })}
                              </div>

                              {data.activation.acquisitionSource === 'other' && (
                                <div className="mt-3 space-y-1.5 animate-fade-in">
                                  <label className="text-xs font-semibold text-[var(--foreground)]">Please specify channel details:</label>
                                  <Input
                                    variant="surface"
                                    type="text"
                                    placeholder="e.g. Reddit, YouTube, Product Hunt, Podcast..."
                                    value={data.activation.acquisitionSourceOther || ''}
                                    onChange={(e) => updateActivation('acquisitionSourceOther', e.target.value)}
                                    className="text-xs"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Q5: Primary Goal */}
                          {activationSubStep === 4 && (
                            <div className="space-y-4">
                              <h2 className="text-xl font-bold font-sans text-[var(--foreground)] md:text-2xl">
                                {t('questions.q5.title')}
                              </h2>
                              <p className="text-sm font-sans text-[var(--muted-foreground)] leading-relaxed">
                                {t('questions.q5.desc')}
                              </p>
                              <div className="grid gap-3.5 sm:grid-cols-2">
                                {GOALS.map((goal) => {
                                  const active = data.activation.primaryGoal === goal.id;
                                  const GoalIcon = goal.icon;
                                  return (
                                    <Button
                                      key={goal.id}
                                      type="button"
                                      onClick={() => {
                                        updateActivation('primaryGoal', goal.id);
                                        setTimeout(() => setActivationSubStep(5), 150);
                                      }}
                                      variant="surface"
                                      aria-pressed={active}
                                      className={`onboarding-card-option transition cursor-pointer select-none border ${
                                        active
                                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] ring-1 ring-[var(--primary)]/50'
                                          : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)]'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between w-full mb-2">
                                        <div className="flex items-center gap-2">
                                          <GoalIcon className={`size-5 shrink-0 ${active ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`} />
                                          <span className="font-sans text-sm font-bold text-[var(--foreground)]">{t(`goals.${goal.id}.label`)}</span>
                                        </div>
                                        {active && <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" />}
                                      </div>
                                      <p className="font-sans text-xs leading-relaxed text-[var(--muted-foreground)] whitespace-normal">
                                        {t(`goals.${goal.id}.desc`)}
                                      </p>
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Q6: Default Language */}
                          {activationSubStep === 5 && (
                            <div className="space-y-4">
                              <h2 className="text-xl font-bold font-sans text-[var(--foreground)] md:text-2xl">
                                {t('questions.q6.title')}
                              </h2>
                              <p className="text-sm font-sans text-[var(--muted-foreground)] leading-relaxed">
                                {t('questions.q6.desc')}
                              </p>
                              <div className="grid gap-3 sm:grid-cols-3">
                                {['auto', 'id', 'en'].map((langId) => {
                                  const active = data.activation.defaultLanguage === langId;
                                  return (
                                    <Button
                                      key={langId}
                                      type="button"
                                      onClick={() => updateActivation('defaultLanguage', langId)}
                                      variant="surface"
                                      aria-pressed={active}
                                      className={`onboarding-card-option transition cursor-pointer select-none border ${
                                        active
                                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] ring-1 ring-[var(--primary)]/50'
                                          : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)]'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between w-full mb-2">
                                        <span className="font-sans text-sm font-bold text-[var(--foreground)]">{t(`questions.q6.options.${langId}.title`)}</span>
                                        {active && <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" />}
                                      </div>
                                      <p className="font-sans text-xs leading-relaxed text-[var(--muted-foreground)] whitespace-normal">
                                        {t(`questions.q6.options.${langId}.desc`)}
                                      </p>
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  )}

                  {step === 'discovery' && (
                    <div className="flex flex-col items-center justify-center py-8 space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-[var(--primary)]/20 blur-xl animate-pulse" />
                        <div className="flex size-20 items-center justify-center rounded-full border border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)] relative z-10">
                          <EAILoaderStatusIcon className="size-10 text-[var(--primary)]" />
                        </div>
                      </div>

                      <div className="w-full space-y-4 py-2">
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.15em] text-[var(--primary)]">
                            <Sparkles className="size-3.5 animate-pulse text-[var(--primary)]" />
                            Gemini AI Reasoning Stream
                          </div>
                          <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
                            Live Stream
                          </span>
                        </div>

                        <div ref={scrollRef} className="max-h-72 overflow-y-auto space-y-2.5 pr-1 font-mono text-xs leading-relaxed text-[var(--foreground)] scrollbar-thin">
                          {streamText.trim().length === 0 ? (
                            <div className="flex items-center gap-2 text-[var(--muted-foreground)] py-4 justify-center">
                              <EAILoaderStatusIcon className="size-3.5 text-[var(--primary)]" />
                              Initializing Gemini AI Reasoning Engine...
                            </div>
                          ) : (
                            streamText
                              .split('\n')
                              .map((line) => line.trim())
                              .filter(Boolean)
                              .map((line, idx, arr) => {
                                const isLatest = idx === arr.length - 1;
                                return (
                                  <div key={idx} className="flex items-start gap-2.5 transition-all">
                                    <span className="mt-0.5 shrink-0">
                                      {isLatest ? (
                                        <span className="relative flex size-2.5">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-75"></span>
                                          <span className="relative inline-flex rounded-full size-2.5 bg-[var(--primary)]"></span>
                                        </span>
                                      ) : (
                                        <Check className="size-3.5 text-[var(--success)] shrink-0" />
                                      )}
                                    </span>
                                    <span className={isLatest ? 'text-[var(--primary)] font-semibold' : 'text-[var(--muted-foreground)]'}>
                                      <ReactMarkdown
                                        components={{
                                          p: ({ children }) => <span className="inline">{children}</span>,
                                          strong: ({ children }) => <strong className="font-bold text-[var(--foreground)]">{children}</strong>,
                                          code: ({ children }) => <code className="px-1 py-0.5 rounded bg-[var(--surface-3)] font-mono text-xs">{children}</code>,
                                        }}
                                      >
                                        {line}
                                      </ReactMarkdown>
                                    </span>
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </div>

                      <Button
                        type="button"
                        onClick={async () => {
                          discoverCancelledRef.current = true;
                          discoveryAbortControllerRef.current?.abort();
                          discoveryAbortControllerRef.current = null;
                          if (discoveryTransitionRef.current) {
                            clearTimeout(discoveryTransitionRef.current);
                            discoveryTransitionRef.current = null;
                          }
                          setStep('activation');
                          setDiscovering(false);
                          try {
                            await saveDraft('activation');
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        variant="muted"
                        className="px-5 py-2 rounded-xl text-xs font-mono font-medium text-[var(--muted-foreground)]"
                      >
                        {t('actions.cancelAndBack')}
                      </Button>
                    </div>
                  )}

                  {step === 'review' && data.editorialProfile && (
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] shadow-sm overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-[var(--primary)] to-[var(--success)]" />
                        <div className="p-6 md:p-8 space-y-6">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--primary)]">
                                Editorial DNA Profile v1
                              </span>
                              {isEditing ? (
                                <div className="mt-3">
                                  <label className="block text-[10px] font-mono text-[var(--muted-foreground)] uppercase mb-1">Brand Name</label>
                                  <Input
                                    variant="surface"
                                    value={data.editorialProfile.brandName}
                                    onChange={(e) => updateProfile('brandName', e.target.value)}
                                    className="h-10 font-sans text-xl font-bold"
                                  />
                                </div>
                              ) : (
                                <h2 className="mt-1 font-sans text-2xl font-bold leading-tight text-[var(--foreground)] md:text-3xl">
                                  {data.editorialProfile.brandName}
                                </h2>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                onClick={() => setIsEditing(!isEditing)}
                                variant="muted"
                                size="sm"
                                aria-pressed={isEditing}
                                className="font-sans text-xs gap-1.5 px-3 border border-[var(--border)]"
                              >
                                <Edit2 className="size-3.5" />
                                {isEditing ? 'Done' : 'Edit'}
                              </Button>
                              <Button
                                type="button"
                                onClick={() => void runDiscovery()}
                                variant="muted"
                                size="sm"
                                className="font-sans text-xs gap-1.5 px-3 border border-[var(--border)] text-[var(--primary)]"
                                disabled={discovering}
                              >
                                <RefreshCw className={`size-3.5 ${discovering ? 'animate-spin' : ''}`} />
                                Regenerate
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-5 border-t border-[var(--border)] pt-5">
                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--muted-foreground)] block mb-2">
                                Positioning
                              </span>
                              {isEditing ? (
                                <Textarea
                                  variant="surface"
                                  value={data.editorialProfile.positioning}
                                  onChange={(e) => updateProfile('positioning', e.target.value)}
                                  className="min-h-24 font-sans text-sm leading-relaxed"
                                />
                              ) : (
                                <p className="font-sans text-sm md:text-base leading-relaxed text-[var(--foreground)]">
                                  {data.editorialProfile.positioning}
                                </p>
                              )}
                            </div>

                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--muted-foreground)] block mb-2">
                                Target Audience
                              </span>
                              {isEditing ? (
                                <Textarea
                                  variant="surface"
                                  value={data.editorialProfile.audience}
                                  onChange={(e) => updateProfile('audience', e.target.value)}
                                  className="min-h-20 font-sans text-sm leading-relaxed"
                                />
                              ) : (
                                <p className="font-sans text-sm md:text-base leading-relaxed text-[var(--foreground)]">
                                  {data.editorialProfile.audience}
                                </p>
                              )}
                            </div>

                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--muted-foreground)] block mb-2.5">
                                Topics & Categories
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {data.editorialProfile.categories.map((cat) => (
                                  <span
                                    key={cat}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full font-sans text-xs font-semibold bg-[var(--surface-3)] text-[var(--foreground)] border border-[var(--border)]"
                                  >
                                    {cat}
                                    {isEditing && (
                                      <Button
                                        type="button"
                                        onClick={() => handleToggleCategory(cat)}
                                        variant="ghost"
                                        size="icon-xs"
                                        className="hover:text-[var(--error)] font-bold ml-0.5 text-xs border-none p-0 h-auto"
                                      >
                                        ×
                                      </Button>
                                    )}
                                  </span>
                                ))}
                              </div>

                              {isEditing && (
                                <div className="mt-3">
                                  <label className="block font-mono text-[10px] text-[var(--muted-foreground)] uppercase mb-1">Add categories</label>
                                  <div className="max-h-28 overflow-y-auto border border-[var(--border)] bg-[var(--surface-3)] p-2.5 rounded-xl flex flex-wrap gap-1.5">
                                    {PREDEFINED_CATEGORIES.map((cat) => {
                                      const active = data.editorialProfile?.categories.includes(cat);
                                      return (
                                        <Button
                                          key={cat}
                                          type="button"
                                          onClick={() => handleToggleCategory(cat)}
                                          variant={active ? 'primary' : 'surface'}
                                          className={`px-2.5 py-1 rounded-lg font-sans text-xs border transition h-auto ${
                                            active
                                              ? 'bg-[var(--primary)]/10 border-[var(--primary)]/40 text-[var(--primary)]'
                                              : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]'
                                          }`}
                                        >
                                          {cat}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--muted-foreground)] block mb-2.5">
                                Article Types
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {(data.editorialProfile.articleTypes || []).map((type) => (
                                  <span
                                    key={type}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full font-sans text-xs font-semibold bg-[var(--surface-3)] text-[var(--foreground)] border border-[var(--border)]"
                                  >
                                    {type}
                                    {isEditing && (
                                      <Button
                                        type="button"
                                        onClick={() => handleToggleArticleType(type)}
                                        variant="ghost"
                                        size="icon-xs"
                                        className="hover:text-[var(--error)] font-bold ml-0.5 text-xs border-none p-0 h-auto"
                                      >
                                        ×
                                      </Button>
                                    )}
                                  </span>
                                ))}
                              </div>

                              {isEditing && (
                                <div className="mt-3">
                                  <label className="block font-mono text-[10px] text-[var(--muted-foreground)] uppercase mb-1">Add Article Types</label>
                                  <div className="max-h-28 overflow-y-auto border border-[var(--border)] bg-[var(--surface-3)] p-2.5 rounded-xl flex flex-wrap gap-1.5">
                                    {PREDEFINED_ARTICLE_TYPES.map((type) => {
                                      const active = data.editorialProfile?.articleTypes?.includes(type);
                                      return (
                                        <Button
                                          key={type}
                                          type="button"
                                          onClick={() => handleToggleArticleType(type)}
                                          variant={active ? 'primary' : 'surface'}
                                          className={`px-2.5 py-1 rounded-lg font-sans text-xs border transition h-auto ${
                                            active
                                              ? 'bg-[var(--primary)]/10 border-[var(--primary)]/40 text-[var(--primary)]'
                                              : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]'
                                          }`}
                                        >
                                          {type}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--muted-foreground)] block mb-2.5">
                                Writing Style & Tone
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {data.editorialProfile.tone.map((tn) => (
                                  <span
                                    key={tn}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full font-sans text-xs font-semibold bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 capitalize"
                                  >
                                    {tn}
                                    {isEditing && (
                                      <Button
                                        type="button"
                                        onClick={() => handleToggleTone(tn)}
                                        variant="ghost"
                                        size="icon-xs"
                                        className="hover:text-[var(--error)] font-bold ml-0.5 text-xs border-none p-0 h-auto"
                                      >
                                        ×
                                      </Button>
                                    )}
                                  </span>
                                ))}
                              </div>

                              {isEditing && (
                                <div className="mt-3 space-y-2">
                                  <label className="block font-mono text-[10px] text-[var(--muted-foreground)] uppercase">Quick Add Tone</label>
                                  <div className="flex flex-wrap gap-1 bg-[var(--surface-3)] p-2 rounded-xl border border-[var(--border)]">
                                    {['professional', 'clear', 'analytical', 'conversational', 'bold', 'data-driven', 'insightful', 'strategic', 'academic'].map((tn) => {
                                      const active = data.editorialProfile?.tone.includes(tn);
                                      return (
                                        <Button
                                          key={tn}
                                          type="button"
                                          onClick={() => handleToggleTone(tn)}
                                          variant={active ? 'primary' : 'surface'}
                                          className={`px-2.5 py-1 rounded-lg font-sans text-xs border transition capitalize h-auto ${
                                            active
                                              ? 'bg-[var(--primary)]/10 border-[var(--primary)]/40 text-[var(--primary)]'
                                              : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]'
                                          }`}
                                        >
                                          {tn}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                  <Input
                                    variant="surface"
                                    placeholder="Type custom tone and press Enter..."
                                    onKeyDown={handleAddCustomTone}
                                    className="h-9 font-sans text-xs"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-6">
              <div className="flex items-center gap-3">
                {step === 'review' ? (
                  <Button
                    type="button"
                    onClick={() => void goBack()}
                    disabled={saving || activating}
                    variant="muted"
                    className="font-sans text-sm gap-2"
                  >
                    <ArrowLeft className="size-4" />
                    {t('buttons.back')}
                  </Button>
                ) : step === 'activation' && activationSubStep > 0 ? (
                  <Button
                    type="button"
                    onClick={() => setActivationSubStep((prev) => prev - 1)}
                    disabled={saving}
                    variant="muted"
                    className="font-sans text-sm gap-2"
                  >
                    <ArrowLeft className="size-4" />
                    {t('buttons.back')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void skipOnboarding()}
                    disabled={saving || activating}
                    variant="link"
                    size="sm"
                    className="font-sans text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] gap-1.5"
                  >
                    {t('buttons.useDefaults')}
                  </Button>
                )}
              </div>
              
              {step === 'review' ? (
                <Button
                  type="button"
                  onClick={() => void activateWorkspace()}
                  disabled={activating || saving}
                  variant="primary"
                  size="lg"
                  className="px-6 font-sans text-sm gap-2 font-semibold"
                >
                  {activating ? <EAILoaderStatusIcon className="size-4" /> : <Rocket className="size-4" />}
                  {activating ? t('buttons.activating') : t('buttons.activate')}
                </Button>
              ) : step === 'activation' ? (
                activationSubStep < 5 ? (
                  <Button
                    type="button"
                    onClick={() => {
                      if (activationSubStep === 0 && !data.activation.workspaceName.trim()) {
                        toast.error(t('questions.q1.placeholder'));
                        return;
                      }
                      setActivationSubStep((prev) => prev + 1);
                    }}
                    disabled={saving}
                    variant="primary"
                    size="lg"
                    className="px-6 font-sans text-sm gap-2 font-semibold"
                  >
                    {t('buttons.next')}
                    <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void goNext()}
                    disabled={saving}
                    variant="primary"
                    size="lg"
                    className="px-6 font-sans text-sm gap-2 font-semibold"
                  >
                    {saving ? <EAILoaderStatusIcon className="size-4" /> : <Sparkles className="size-4" />}
                    {saving ? t('buttons.saving') : t('buttons.startAi')}
                  </Button>
                )
              ) : (
                <div className="h-11" />
              )}
            </div>
          </div>
        </section>

        {/* Live Editorial DNA Preview Sidebar Island */}
        <aside className="hidden lg:flex w-[320px] shrink-0 flex-col overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-[inset_0_0_0_1px_var(--card-border),0_2px_8px_rgba(0,0,0,0.12)]">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            Live DNA preview
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] shadow-sm">
            <div className="h-1 bg-gradient-to-r from-[var(--primary)] to-[var(--success)]" />
            <div className="p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--primary)] font-semibold">
                  Workspace DNA
                </span>
                <Sparkles className="size-4 text-[var(--gold)]" />
              </div>
              <h2 className="mt-4 font-sans text-2xl font-bold leading-tight text-[var(--foreground)] truncate">
                {data.activation.workspaceName || activeOrganization?.name || 'Your Brand'}
              </h2>
              <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
                <SignatureRow label="Role" value={(data.activation.userRole || 'editor_in_chief').replace('_', ' ')} />
                <SignatureRow
                  label="Source"
                  value={
                    data.activation.acquisitionSource === 'other' && data.activation.acquisitionSourceOther
                      ? `Other (${data.activation.acquisitionSourceOther})`
                      : (data.activation.acquisitionSource || 'google').replace('_', ' ')
                  }
                />
                <SignatureRow label="Goal" value={data.activation.primaryGoal.replace('_', ' ')} />
                <SignatureRow label="Language" value={data.activation.defaultLanguage} />
                <SignatureRow label="Website" value={data.activation.website ? 'Provided' : 'None'} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 font-sans text-xs leading-relaxed text-[var(--muted-foreground)]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
            <span>Core factual integrity guardrails stay locked automatically by EAI.</span>
          </div>
        </aside>
      </main>
    </div>
  );
}

function SignatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 font-sans">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{label}</span>
      <span className="max-w-[150px] truncate text-right text-xs capitalize text-[var(--foreground)] font-semibold">{value}</span>
    </div>
  );
}
