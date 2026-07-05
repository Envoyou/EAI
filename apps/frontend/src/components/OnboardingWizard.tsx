'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
  Loader2,
  Rocket,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  RefreshCw,
  Edit2
} from 'lucide-react';
import { toast } from 'sonner';

import { EAILogo } from '@/components/EAILogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_ONBOARDING_DATA, type OnboardingData, type OnboardingStep } from '@eai/shared';

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
  { id: 'grow_traffic', label: 'Grow Organic Traffic', desc: 'Fokus pada optimasi SEO dan menarik pengunjung baru.', icon: Globe2 },
  { id: 'publish_faster', label: 'Publish Faster', desc: 'Mempercepat produksi draf siap publikasi.', icon: Rocket },
  { id: 'knowledge_base', label: 'Build Knowledge Base', desc: 'Mengorganisir informasi dan dokumentasi internal.', icon: BookOpenText },
  { id: 'research', label: 'Research & Copilot', desc: 'Melakukan riset mendalam terhadap topik tertentu.', icon: Sparkles },
  { id: 'documentation', label: 'Documentation', desc: 'Membuat petunjuk teknis dan dokumentasi terstruktur.', icon: FileText },
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
  const [data, setData] = useState<OnboardingData>(() => structuredClone(DEFAULT_ONBOARDING_DATA));
  const [step, setStep] = useState<OnboardingStep>('activation');
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activeOrganization, setActiveOrganization] = useState<{ name: string; slug: string } | null>(null);
  
  // Loading dynamic micro-copy stages
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const discoverCancelledRef = useRef(false);

  const currentIndex = STEPS.findIndex((item) => item.id === step);
  const currentStep = STEPS[currentIndex] || STEPS[0];

  const loadDraft = useCallback(async () => {
    try {
      const response = await fetch('/api/onboarding', { cache: 'no-store' });
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
    discoverCancelledRef.current = false;
    setDiscovering(true);
    setLoadingPhase(0);
    setStep('discovery');

    // Simulate phases animation
    const interval = setInterval(() => {
      setLoadingPhase((p) => Math.min(p + 1, 3));
    }, 2500);

    try {
      const response = await fetch('/api/onboarding/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.activation),
      });
      const result = await response.json();
      clearInterval(interval);

      if (discoverCancelledRef.current) {
        console.log('[ONBOARDING] Discovery response ignored because it was cancelled.');
        return;
      }

      if (!response.ok) throw new Error(result.error || 'Discovery failed.');

      // Complete phases immediately
      setLoadingPhase(3);
      
      setData((current) => ({
        ...current,
        editorialProfile: result.profile,
      }));

      // Wait a bit for the animation to look complete before moving to review
      setTimeout(() => {
        if (discoverCancelledRef.current) return;
        setStep('review');
        setDiscovering(false);
      }, 800);

    } catch (error) {
      if (discoverCancelledRef.current) return;
      clearInterval(interval);
      toast.error(error instanceof Error ? error.message : 'Discovery failed. Loading defaults.');
      
      // Fallback
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

      setTimeout(() => {
        if (discoverCancelledRef.current) return;
        setStep('review');
        setDiscovering(false);
      }, 1000);
    }
  };

  const saveDraft = async (nextStep: OnboardingStep, updatedData?: OnboardingData) => {
    setSaving(true);
    try {
      const dataToSave = updatedData || data;
      const response = await fetch('/api/onboarding', {
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
      // First save the current data as review draft
      await saveDraft('review');
      const response = await fetch('/api/onboarding', { method: 'POST' });
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
      const response = await fetch('/api/onboarding', {
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

  const dynamicLoadingCopy = useMemo(() => {
    const website = data.activation.website;
    const workspaceName = data.activation.workspaceName || activeOrganization?.name || 'Workspace';
    const lang = data.activation.defaultLanguage === 'id' ? 'Bahasa Indonesia' : data.activation.defaultLanguage === 'en' ? 'English' : 'Otomatis';

    return [
      { text: `Analyzing primary goals for "${workspaceName}"...`, complete: loadingPhase > 0 },
      { text: website ? `Extracting brand identity from ${website}...` : `Generating brand identity for "${workspaceName}"...`, complete: loadingPhase > 1 },
      { text: `Synthesizing writing tone and categories for ${lang}...`, complete: loadingPhase > 2 },
      { text: `Finalizing Editorial DNA and structure...`, complete: loadingPhase >= 3 }
    ];
  }, [data.activation, activeOrganization, loadingPhase]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Preparing launch desk
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] relative flex flex-col">
      {/* Ambient Radial Glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(13,135,207,0.05),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.03),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_0%,rgba(13,135,207,0.1),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.06),transparent_35%)]" />
      
      {/* Subtle Noise Material */}
      <div 
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.02] dark:opacity-[0.035] mix-blend-overlay"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      />

      <header className="ide-titlebar justify-between px-5 md:px-8 relative z-20 border-b border-[var(--border)] bg-[var(--surface-1)]/80 backdrop-blur-2xl shrink-0">
        <div className="flex items-center gap-3 relative z-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-primary">
            <EAILogo className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold text-[var(--foreground)] text-lg leading-none">Publication Launch Desk</div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              EAI workspace onboarding
            </div>
          </div>
        </div>
        <div className="relative z-10">
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-0 flex-1 w-full max-w-[1500px] lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* Navigation Sidebar */}
        <aside className="border-r border-[var(--border)] p-6 lg:p-8 flex flex-col">
          <div className="mb-8">
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-primary">
              Launch sequence
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">
              Sederhana, cepat, berbasis kecerdasan buatan. Biarkan EAI menganalisis brand Anda secara instan.
            </p>
          </div>
          <div className="space-y-2">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              const active = item.id === step;
              const complete = index < currentIndex;
              return (
                <div
                  key={item.id}
                  className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition select-none ${
                    active
                      ? 'border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--foreground)]'
                      : complete
                        ? 'border-transparent text-[var(--foreground)]'
                        : 'border-transparent opacity-40 text-[var(--muted-foreground)]'
                  }`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    complete
                      ? 'bg-[var(--success)]/10 text-[var(--success)]'
                      : active
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'bg-[var(--surface-2)] text-[var(--muted-foreground)]'
                  }`}>
                    {complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                      {item.eyebrow}
                    </div>
                    <div className={`mt-1 truncate text-xs font-semibold ${active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
                      {item.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Wizard Main Content Canvas */}
        <section className="flex min-w-0 flex-col p-5 md:p-10 lg:p-12">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center">
            <div className="mb-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                {currentStep.eyebrow}
              </div>
              <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl text-[var(--foreground)]">
                {currentStep.label}
              </h1>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20, filter: 'blur(5px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -20, filter: 'blur(5px)' }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="flex-1"
              >
                {step === 'activation' && (
                  <div className="space-y-6">
                    <WizardField label="Nama Workspace" icon={Building2}>
                      <Input
                        type="text"
                        value={data.activation.workspaceName}
                        onChange={(event) => updateActivation('workspaceName', event.target.value)}
                        placeholder="Nama Publikasi / Workspace Anda (misal: EAI Blog)"
                        className="ui-control ui-input h-11"
                      />
                    </WizardField>

                    <WizardField label="Website Publikasi" icon={Globe2} optional>
                      <Input
                        type="url"
                        value={data.activation.website}
                        onChange={(event) => updateActivation('website', event.target.value)}
                        placeholder="https://blog.envoyou.com (opsional)"
                        className="ui-control ui-input h-11"
                      />
                    </WizardField>

                    <WizardField label="Tujuan Utama (Primary Goal)" icon={Sparkles}>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {GOALS.map((goal) => {
                          const active = data.activation.primaryGoal === goal.id;
                          const GoalIcon = goal.icon;
                          return (
                            <button
                              key={goal.id}
                              type="button"
                              onClick={() => updateActivation('primaryGoal', goal.id)}
                              className={`rounded-2xl border p-4 text-left transition select-none flex flex-col justify-between h-32 cursor-pointer ${
                                active
                                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                                  : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)]'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <GoalIcon className={`h-5 w-5 ${active ? 'text-primary' : 'text-[var(--muted-foreground)]'}`} />
                                {active && <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />}
                              </div>
                              <div>
                                <div className="text-xs font-bold">{goal.label}</div>
                                <p className="mt-1 text-[10px] leading-normal text-[var(--muted-foreground)]">
                                  {goal.desc}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </WizardField>

                    <WizardField label="Bahasa Utama" icon={Globe2}>
                      <select
                        value={data.activation.defaultLanguage}
                        onChange={(event) => updateActivation('defaultLanguage', event.target.value)}
                        className="w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="auto">Auto-detect (Otomatis)</option>
                        <option value="en">English</option>
                        <option value="id">Bahasa Indonesia</option>
                      </select>
                    </WizardField>
                  </div>
                )}

                {step === 'discovery' && (
                  <div className="flex flex-col items-center justify-center py-10 space-y-8">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary relative z-10">
                        <Loader2 className="h-10 w-10 animate-spin" />
                      </div>
                    </div>

                    <div className="w-full max-w-md space-y-3.5 bg-[var(--surface-2)]/60 border border-[var(--border)] p-6 rounded-3xl backdrop-blur-xl">
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary text-center">
                        AI Scanning Progress
                      </h3>
                      <div className="space-y-3 pt-3">
                        {dynamicLoadingCopy.map((phase, idx) => (
                          <div key={idx} className="flex items-center gap-3 text-xs leading-normal">
                            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                              phase.complete
                                ? 'bg-[var(--success)]/10 text-[var(--success)]'
                                : loadingPhase === idx
                                  ? 'bg-primary/20 text-primary animate-pulse'
                                  : 'bg-[var(--surface-3)] text-[var(--muted-foreground)]'
                            }`}>
                              {phase.complete ? <Check className="size-3" /> : idx + 1}
                            </span>
                            <span className={phase.complete ? 'text-[var(--foreground)]' : loadingPhase === idx ? 'text-primary font-medium' : 'text-[var(--muted-foreground)]'}>
                              {phase.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        discoverCancelledRef.current = true;
                        setStep('activation');
                        setDiscovering(false);
                        try {
                          await saveDraft('activation');
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="px-6 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all font-medium font-mono"
                    >
                      Batal & Kembali
                    </button>
                  </div>
                )}

                {step === 'review' && data.editorialProfile && (
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] shadow-xl overflow-hidden">
                      <div className="h-1.5 bg-gradient-to-r from-[var(--primary)] via-sky-400 to-[var(--success)]" />
                      <div className="p-6 md:p-8 space-y-6">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
                              Editorial DNA Profile v1
                            </span>
                            {isEditing ? (
                              <div className="mt-3">
                                <label className="block text-[10px] font-mono text-[var(--muted-foreground)] uppercase mb-1">Brand Name</label>
                                <Input
                                  value={data.editorialProfile.brandName}
                                  onChange={(e) => updateProfile('brandName', e.target.value)}
                                  className="h-10 text-xl font-bold font-display"
                                />
                              </div>
                            ) : (
                              <h2 className="mt-2 font-display text-3xl leading-tight text-[var(--foreground)]">
                                {data.editorialProfile.brandName}
                              </h2>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsEditing(!isEditing)}
                              className="ui-btn ui-btn-muted text-xs gap-1.5 px-3 h-8 border border-[var(--border)]"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              {isEditing ? 'Done' : 'Edit'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void runDiscovery()}
                              className="ui-btn ui-btn-muted text-xs gap-1.5 px-3 h-8 border border-[var(--border)] text-primary hover:bg-primary/5"
                              disabled={discovering}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${discovering ? 'animate-spin' : ''}`} />
                              Regenerate
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-5 border-t border-[var(--border)] pt-5">
                          <div>
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--muted-foreground)] block mb-2">
                              Positioning
                            </span>
                            {isEditing ? (
                              <Textarea
                                value={data.editorialProfile.positioning}
                                onChange={(e) => updateProfile('positioning', e.target.value)}
                                className="min-h-24 text-sm leading-normal"
                              />
                            ) : (
                              <p className="text-sm leading-6 text-[var(--foreground)]">
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
                                value={data.editorialProfile.audience}
                                onChange={(e) => updateProfile('audience', e.target.value)}
                                className="min-h-20 text-sm leading-normal"
                              />
                            ) : (
                              <p className="text-sm leading-6 text-[var(--foreground)]">
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
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--surface-2)] text-[var(--foreground)] border border-[var(--border)] group"
                                >
                                  {cat}
                                  {isEditing && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCategory(cat)}
                                      className="hover:text-red-500 font-bold ml-0.5 text-xs"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>

                            {isEditing && (
                              <div className="mt-3">
                                <label className="block text-[10px] font-mono text-[var(--muted-foreground)] uppercase mb-1">Add categories</label>
                                <div className="max-h-28 overflow-y-auto border border-[var(--border)] bg-[var(--surface-2)] p-2.5 rounded-xl flex flex-wrap gap-1.5">
                                  {PREDEFINED_CATEGORIES.map((cat) => {
                                    const active = data.editorialProfile?.categories.includes(cat);
                                    return (
                                      <button
                                        key={cat}
                                        type="button"
                                        onClick={() => handleToggleCategory(cat)}
                                        className={`px-2 py-0.5 rounded-lg text-[9px] border transition ${
                                          active
                                            ? 'bg-primary/10 border-primary/40 text-primary'
                                            : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]'
                                        }`}
                                      >
                                        {cat}
                                      </button>
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
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--surface-2)] text-[var(--foreground)] border border-[var(--border)] group"
                                >
                                  {type}
                                  {isEditing && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleArticleType(type)}
                                      className="hover:text-red-500 font-bold ml-0.5 text-xs"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>

                            {isEditing && (
                              <div className="mt-3">
                                <label className="block text-[10px] font-mono text-[var(--muted-foreground)] uppercase mb-1">Add Article Types</label>
                                <div className="max-h-28 overflow-y-auto border border-[var(--border)] bg-[var(--surface-2)] p-2.5 rounded-xl flex flex-wrap gap-1.5">
                                  {PREDEFINED_ARTICLE_TYPES.map((type) => {
                                    const active = data.editorialProfile?.articleTypes?.includes(type);
                                    return (
                                      <button
                                        key={type}
                                        type="button"
                                        onClick={() => handleToggleArticleType(type)}
                                        className={`px-2 py-0.5 rounded-lg text-[9px] border transition ${
                                          active
                                            ? 'bg-primary/10 border-primary/40 text-primary'
                                            : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]'
                                        }`}
                                      >
                                        {type}
                                      </button>
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
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--primary)]/10 text-primary border border-primary/20 capitalize"
                                >
                                  {tn}
                                  {isEditing && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTone(tn)}
                                      className="hover:text-red-500 font-bold ml-0.5 text-xs"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>

                            {isEditing && (
                              <div className="mt-3 space-y-2">
                                <label className="block text-[10px] font-mono text-[var(--muted-foreground)] uppercase">Quick Add Tone</label>
                                <div className="flex flex-wrap gap-1 bg-[var(--surface-2)] p-2 rounded-xl border border-[var(--border)]">
                                  {['professional', 'clear', 'analytical', 'conversational', 'bold', 'data-driven', 'insightful', 'strategic', 'academic'].map((tn) => {
                                    const active = data.editorialProfile?.tone.includes(tn);
                                    return (
                                      <button
                                        key={tn}
                                        type="button"
                                        onClick={() => handleToggleTone(tn)}
                                        className={`px-2 py-0.5 rounded-lg text-[9px] border transition capitalize ${
                                          active
                                            ? 'bg-primary/10 border-primary/40 text-primary'
                                            : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]'
                                        }`}
                                      >
                                        {tn}
                                      </button>
                                    );
                                  })}
                                </div>
                                <Input
                                  placeholder="Type custom tone and press Enter..."
                                  onKeyDown={handleAddCustomTone}
                                  className="h-9 text-xs"
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

            <div className="mt-10 flex items-center justify-between border-t border-[var(--border)] pt-6">
              <div className="flex items-center gap-3">
                {step === 'review' ? (
                  <button
                    type="button"
                    onClick={() => void goBack()}
                    disabled={saving || activating}
                    className="ui-btn ui-btn-muted text-sm gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void skipOnboarding()}
                    disabled={saving || activating}
                    className="ui-btn ui-btn-muted text-xs opacity-60 hover:opacity-100 font-normal underline underline-offset-4 gap-1.5"
                  >
                    Use defaults
                  </button>
                )}
              </div>
              
              {step === 'review' ? (
                <button
                  type="button"
                  onClick={() => void activateWorkspace()}
                  disabled={activating || saving}
                  className="ui-btn ui-btn-primary h-11 px-6 shadow-xl shadow-[var(--primary)]/15 text-sm gap-2"
                >
                  {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  {activating ? 'Activating...' : 'Activate Workspace'}
                </button>
              ) : step === 'activation' ? (
                <button
                  type="button"
                  onClick={() => void goNext()}
                  disabled={saving}
                  className="ui-btn ui-btn-primary h-11 px-6 shadow-xl shadow-[var(--primary)]/15 text-sm gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {saving ? 'Saving...' : 'Continue'}
                </button>
              ) : (
                <div className="h-11" /> // space placeholder for discovery loading
              )}
            </div>
          </div>
        </section>

        {/* Live Editorial DNA Preview Sidebar */}
        <aside className="hidden border-l border-[var(--border)] p-8 lg:block">
          <div className="sticky top-24">
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              Live DNA preview
            </div>
            <div className="mt-5 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--card)] shadow-2xl shadow-black/10 dark:shadow-black/50">
              <div className="h-1 bg-gradient-to-r from-[var(--primary)] via-sky-400 to-[var(--success)]" />
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
                    Workspace DNA
                  </span>
                  <Sparkles className="h-4 w-4 text-[var(--gold)]" />
                </div>
                <h2 className="mt-8 font-display text-3xl leading-tight text-[var(--foreground)] truncate">
                  {data.activation.workspaceName || activeOrganization?.name || 'Your Brand'}
                </h2>
                <div className="mt-7 space-y-3 border-t border-[var(--border)] pt-5">
                  <SignatureRow label="Goal" value={data.activation.primaryGoal.replace('_', ' ')} />
                  <SignatureRow label="Language" value={data.activation.defaultLanguage} />
                  <SignatureRow label="Website" value={data.activation.website ? 'Provided' : 'None'} />
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-[11px] leading-5 text-[var(--muted-foreground)]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--success)]" />
              Core factual integrity guardrails stay locked automatically by EAI.
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function WizardField({
  label,
  hint,
  icon: Icon,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  icon: typeof Building2;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3 font-medium">
        <span className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {label}
        </span>
        <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          {hint || (optional ? 'Optional' : 'Required')}
        </span>
      </div>
      {children}
    </label>
  );
}

function SignatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{label}</span>
      <span className="max-w-[150px] truncate text-right text-[11px] capitalize text-[var(--foreground)]">{value}</span>
    </div>
  );
}
