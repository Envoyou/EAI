'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  DatabaseZap,
  Eye,
  FileText,
  Globe2,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { EAILogo } from '@/components/EAILogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_ONBOARDING_DATA,
  type OnboardingData,
  type OnboardingStep,
} from '@eai/shared';
import {
  PREDEFINED_CATEGORIES,
  PREDEFINED_ARTICLE_TYPES,
} from '@eai/shared';

const STEPS: Array<{
  id: OnboardingStep;
  label: string;
  eyebrow: string;
  icon: typeof Building2;
}> = [
  { id: 'organization', label: 'Publication Setup', eyebrow: '01 / Foundation', icon: Building2 },
  { id: 'editorial_profile', label: 'Editorial Identity', eyebrow: '02 / Voice', icon: BookOpenText },
  { id: 'editorial_rules', label: 'Editorial Rules', eyebrow: '03 / Standards', icon: ShieldCheck },
  { id: 'cms_connection', label: 'CMS Connection', eyebrow: '04 / Delivery', icon: DatabaseZap },
  { id: 'review', label: 'Review & Activate', eyebrow: '05 / Launch', icon: Rocket },
];

type ActiveOrganization = {
  id: string;
  clerkOrganizationId?: string | null;
  slug: string;
  name: string;
};

type ValidationIssue = {
  path: Array<string | number>;
  message: string;
};

const isValidationIssue = (value: unknown): value is ValidationIssue => {
  if (!value || typeof value !== 'object') return false;
  const issue = value as Record<string, unknown>;
  return Array.isArray(issue.path) && typeof issue.message === 'string';
};

const formatValidationIssues = (value: unknown) => {
  if (!Array.isArray(value)) return '';
  return value
    .filter(isValidationIssue)
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ');
};

const cloneDefaultData = () => structuredClone(DEFAULT_ONBOARDING_DATA);
const splitList = (value: string) => value.split('\n');
const joinList = (value: string[]) => value.join('\n');
const cleanList = (value: string[]) =>
  value.map((item) => item.trim()).filter(Boolean);
const cleanOnboardingData = (value: OnboardingData): OnboardingData => ({
  ...value,
  organization: {
    ...value.organization,
    name: value.organization.name.trim(),
    slug: value.organization.slug.trim(),
    domain: value.organization.domain.trim(),
    publicationName: value.organization.publicationName.trim(),
  },
  editorialProfile: {
    ...value.editorialProfile,
    brandName: value.editorialProfile.brandName.trim(),
    positioning: value.editorialProfile.positioning.trim(),
    audience: value.editorialProfile.audience.trim(),
    categories: cleanList(value.editorialProfile.categories),
    articleTypes: cleanList(value.editorialProfile.articleTypes || []),
    tone: cleanList(value.editorialProfile.tone),
    articleStructure: cleanList(value.editorialProfile.articleStructure),
    additionalProhibitedPatterns: cleanList(
      value.editorialProfile.additionalProhibitedPatterns
    ),
    internalLinkDomains: cleanList(value.editorialProfile.internalLinkDomains),
    internalLinkBaseUrl: value.editorialProfile.internalLinkBaseUrl?.trim(),
    customInstructions: value.editorialProfile.customInstructions?.trim(),
    allowedEditorialTerms: value.editorialProfile.allowedEditorialTerms ?? [],
  },
  cms: {
    ...value.cms,
    name: value.cms.name.trim(),
    baseUrl: value.cms.baseUrl.trim(),
  },
});

export function OnboardingWizard() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData>(cloneDefaultData);
  const [step, setStep] = useState<OnboardingStep>('organization');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [testingCms, setTestingCms] = useState(false);
  const [cmsSecret, setCmsSecret] = useState('');
  const [hasStoredCredential, setHasStoredCredential] = useState(false);
  const [cmsSample, setCmsSample] = useState<Array<{ title: string; slug: string }>>([]);
  const [skipping, setSkipping] = useState(false);
  const [activeOrganization, setActiveOrganization] = useState<ActiveOrganization | null>(null);

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
      setData(result.data || cloneDefaultData());
      setStep(result.step || 'organization');
      setHasStoredCredential(Boolean(result.hasStoredCredential));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load onboarding.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  const updateOrganization = (
    key: keyof OnboardingData['organization'],
    value: string
  ) => {
    setData((current) => {
      const nextOrganization = { ...current.organization, [key]: value };
      return { ...current, organization: nextOrganization };
    });
  };

  const updateProfile = <K extends keyof OnboardingData['editorialProfile']>(
    key: K,
    value: OnboardingData['editorialProfile'][K]
  ) => {
    setData((current) => ({
      ...current,
      editorialProfile: { ...current.editorialProfile, [key]: value },
    }));
  };

  const updateCms = <K extends keyof OnboardingData['cms']>(
    key: K,
    value: OnboardingData['cms'][K]
  ) => {
    setData((current) => ({
      ...current,
      cms: {
        ...current.cms,
        [key]: value,
        ...(key === 'baseUrl' || key === 'adapterKey' ? { verified: false } : {}),
      },
    }));
    if (key === 'baseUrl' || key === 'adapterKey') setCmsSample([]);
  };

  const saveDraft = async (nextStep: OnboardingStep) => {
    setSaving(true);
    try {
      const cleanedData = cleanOnboardingData(data);
      const response = await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: nextStep,
          data: cleanedData,
          cmsSecret: cmsSecret || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = formatValidationIssues(result.issues);
        if (details) {
          console.error('[ONBOARDING_SAVE_ERROR] Issues:', result.issues);
        }
        throw new Error(
          (result.error || 'Failed to save onboarding') + (details ? `: ${details}` : '')
        );
      }
      if (cmsSecret) setHasStoredCredential(true);
      setData(cleanedData);
      setStep(nextStep);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save onboarding.');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const validateStep = () => {
    if (step === 'organization') {
      return Boolean(
        data.organization.name.trim() &&
        data.organization.slug.trim() &&
        data.organization.publicationName.trim()
      );
    }
    if (step === 'editorial_profile') {
      return Boolean(
        data.editorialProfile.brandName.trim() &&
        data.editorialProfile.positioning.trim() &&
        data.editorialProfile.audience.trim() &&
        data.editorialProfile.categories.some(Boolean) &&
        data.editorialProfile.articleTypes?.some(Boolean) &&
        data.editorialProfile.tone.some(Boolean)
      );
    }
    if (step === 'editorial_rules') {
      return data.editorialProfile.articleStructure.some(Boolean);
    }
    if (step === 'cms_connection') {
      return data.cms.adapterKey === 'none' || (
        data.cms.verified &&
        Boolean(data.cms.name && data.cms.baseUrl) &&
        (Boolean(cmsSecret) || hasStoredCredential)
      );
    }
    return true;
  };

  const goNext = async () => {
    if (!validateStep()) {
      toast.error('Please complete the required fields in this step.');
      return;
    }
    const next = STEPS[Math.min(currentIndex + 1, STEPS.length - 1)].id;
    await saveDraft(next);
  };

  const goBack = async () => {
    const previous = STEPS[Math.max(currentIndex - 1, 0)].id;
    await saveDraft(previous);
  };

  const testCms = async () => {
    if (!cmsSecret && !hasStoredCredential) {
      toast.error('Please enter the CMS shared secret to test the connection.');
      return;
    }
    if (!cmsSecret) {
      toast.info('Please re-enter the shared secret to perform a new connection test.');
      return;
    }
    setTestingCms(true);
    try {
      const response = await fetch('/api/onboarding/test-cms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adapterKey: 'eai-rest-v1',
          name: data.cms.name,
          baseUrl: data.cms.baseUrl,
          secret: cmsSecret,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'CMS connection failed.');
      setCmsSample(result.samplePosts || []);
      updateCms('verified', true);
      toast.success('CMS connection verified.');
    } catch (error) {
      updateCms('verified', false);
      toast.error(error instanceof Error ? error.message : 'CMS connection failed.');
    } finally {
      setTestingCms(false);
    }
  };

  const activateWorkspace = async () => {
    setActivating(true);
    try {
      await saveDraft('review');
      const response = await fetch('/api/onboarding', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) {
        const details = formatValidationIssues(result.issues);
        if (details) {
          console.error('[ONBOARDING_ACTIVATE_ERROR] Issues:', result.issues);
        }
        throw new Error(
          (result.error || 'Workspace activation failed') + (details ? `: ${details}` : '')
        );
      }
      toast.success('Workspace active. Editorial profile v1 has been created.');
      router.replace('/workspace');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Workspace activation failed.');
    } finally {
      setActivating(false);
    }
  };

  const skipOnboarding = async () => {
    setSkipping(true);
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
      setSkipping(false);
    }
  };

  const handleToggleCategory = (category: string) => {
    const current = data.editorialProfile.categories;
    const next = current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category];
    updateProfile('categories', next);
  };

  const handleToggleArticleType = (type: string) => {
    const current = data.editorialProfile.articleTypes || [];
    const next = current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type];
    updateProfile('articleTypes', next);
  };

  const editorialPreview = useMemo(() => {
    const brand = data.editorialProfile.brandName || data.organization.publicationName || 'Your Publication';
    const positioning = data.editorialProfile.positioning || 'Editorial positioning will appear here.';
    return { brand, positioning };
  }, [data]);

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
      {/* Ambient Radial Glow (Envoyou Brand Identity) */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(13,135,207,0.05),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.03),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_0%,rgba(13,135,207,0.1),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.06),transparent_35%)]" />
      {/* Subtle noise texture for premium material feel */}
      <div 
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.02] dark:opacity-[0.035] mix-blend-overlay"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      />

      <header className="ide-titlebar justify-between px-5 md:px-8 relative z-20 border-b border-[var(--border)] bg-[var(--surface-1)]/80 backdrop-blur-2xl shrink-0">
        <div className="sidebar-header-glow" />
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
        <aside className="border-r border-[var(--border)] p-6 lg:p-8 flex flex-col">
          <div className="mb-8">
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-primary">
              Launch sequence
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">
              Five decisions to transform EAI into your organization&apos;s editorial workspace.
            </p>
          </div>
          <div className="space-y-2">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              const active = item.id === step;
              const complete = index < currentIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => complete && void saveDraft(item.id)}
                  className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--foreground)]'
                      : complete
                        ? 'border-transparent hover:bg-[var(--surface-2)] cursor-pointer text-[var(--foreground)]'
                        : 'cursor-default border-transparent opacity-40 text-[var(--muted-foreground)]'
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
                    <div className={`mt-1 truncate text-xs font-semibold ${active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]'}`}>
                      {item.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex items-center gap-2 text-[var(--success)]">
              <LockKeyhole className="h-3.5 w-3.5" />
              <span className="font-mono text-[9px] uppercase tracking-[0.16em]">Private draft</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--muted-foreground)]">
              Profile v1 will not be created until you click Activate Workspace.
            </p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col p-5 md:p-10 lg:p-12">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
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
                {step === 'organization' && (
                  <div className="space-y-6">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/70 p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--success)]/20 bg-[var(--success)]/10 text-[var(--success)]">
                          <Check className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--muted-foreground)]">
                            Clerk workspace connected
                          </div>
                          <div className="mt-2 truncate text-lg font-semibold text-[var(--foreground)]">
                            {activeOrganization?.name || data.organization.name}
                          </div>
                          <div className="mt-1 truncate font-mono text-xs text-[var(--muted-foreground)]">
                            /{activeOrganization?.slug || data.organization.slug}
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 text-xs leading-5 text-[var(--muted-foreground)]">
                        Workspace identity is managed by Clerk. The publication details below
                        control how EAI identifies and writes for your brand.
                      </p>
                    </div>
                    <WizardField
                      label="Publication name"
                      icon={FileText}
                      hint={`${data.organization.publicationName.length} / 100`}
                    >
                      <Input
                        type="text"
                        value={data.organization.publicationName}
                        onChange={(event) => updateOrganization('publicationName', event.target.value)}
                        placeholder="Acme Journal"
                        className="ui-control ui-input h-11"
                      />
                    </WizardField>
                    <WizardField
                      label="Publication website"
                      icon={Globe2}
                      optional
                      hint={`Optional • ${data.organization.domain.length} / 300`}
                    >
                      <Input
                        type="url"
                        value={data.organization.domain}
                        onChange={(event) => updateOrganization('domain', event.target.value)}
                        placeholder="https://journal.example.com"
                        className="ui-control ui-input h-11"
                      />
                    </WizardField>
                  </div>
                )}                 {step === 'editorial_profile' && (
                  <div className="space-y-6">
                    <WizardField
                      label="Editorial brand"
                      icon={WandSparkles}
                      hint={`${data.editorialProfile.brandName.length} / 80`}
                    >
                      <Input
                        type="text"
                        value={data.editorialProfile.brandName}
                        onChange={(event) => updateProfile('brandName', event.target.value)}
                        placeholder={data.organization.publicationName || 'Publication brand'}
                        className="ui-control ui-input h-11"
                      />
                    </WizardField>
                    <WizardField
                      label="Positioning"
                      icon={Sparkles}
                      hint={`${data.editorialProfile.positioning.length} / 1000`}
                    >
                      <Textarea
                        value={data.editorialProfile.positioning}
                        onChange={(event) => updateProfile('positioning', event.target.value)}
                        placeholder="What makes this publication unique, and what insights are promised to the readers?"
                        className="ui-control ui-textarea min-h-28 leading-6"
                      />
                    </WizardField>
                    <WizardField
                      label="Primary audience"
                      icon={Eye}
                      hint={`${data.editorialProfile.audience.length} / 1000`}
                    >
                      <Textarea
                        value={data.editorialProfile.audience}
                        onChange={(event) => updateProfile('audience', event.target.value)}
                        placeholder="Decision makers, operators, and professional readers..."
                        className="ui-control ui-textarea min-h-24 leading-6"
                      />
                    </WizardField>
                    <div className="space-y-6">
                      <WizardField label="Article Categories" icon={BookOpenText} hint="Select the topics your publication will cover">
                        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 max-h-[380px] overflow-y-auto pr-2 border border-[var(--border)] bg-[var(--surface-2)]/30 rounded-2xl p-4">
                          {PREDEFINED_CATEGORIES.map((pillarObj) => (
                            <div key={pillarObj.pillar} className="space-y-2">
                              <h3 className="text-xs font-bold text-primary font-mono uppercase tracking-wider">
                                {pillarObj.pillar}
                              </h3>
                              <div className="space-y-1.5 pl-1">
                                {pillarObj.items.map((cat) => {
                                  const checked = data.editorialProfile.categories.includes(cat);
                                  return (
                                    <label key={cat} className="flex items-start gap-2.5 cursor-pointer text-xs group py-0.5">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => handleToggleCategory(cat)}
                                        className="mt-0.5 rounded border-[var(--border)] text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                                      />
                                      <span className={`leading-tight ${checked ? 'text-[var(--foreground)] font-medium' : 'text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]'}`}>
                                        {cat}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </WizardField>

                      <WizardField label="Article Types" icon={FileText} hint="Select the formats you want EAI to support">
                        <div className="grid gap-4 md:grid-cols-2 max-h-[340px] overflow-y-auto pr-2 border border-[var(--border)] bg-[var(--surface-2)]/30 rounded-2xl p-4">
                          {PREDEFINED_ARTICLE_TYPES.map((typeObj) => {
                            const checked = (data.editorialProfile.articleTypes || []).includes(typeObj.name);
                            return (
                              <label
                                key={typeObj.name}
                                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left cursor-pointer transition select-none group ${
                                  checked
                                    ? 'border-[var(--primary)]/30 bg-[var(--primary)]/5 text-[var(--foreground)] shadow-sm'
                                    : 'border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--foreground)]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleToggleArticleType(typeObj.name)}
                                  className="mt-0.5 rounded border-[var(--border)] text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                                />
                                <div className="min-w-0">
                                  <div className={`text-xs font-bold ${checked ? 'text-primary' : 'text-[var(--foreground)]'}`}>
                                    {typeObj.name}
                                  </div>
                                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]/90">
                                    {typeObj.description}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </WizardField>

                      <WizardField label="Tone" hint="One tone attribute per line" icon={WandSparkles}>
                        <textarea
                          value={joinList(data.editorialProfile.tone)}
                          onChange={(event) => updateProfile('tone', splitList(event.target.value))}
                          placeholder={'Professional\nStrategic\nConversational'}
                          className="ui-control ui-textarea min-h-24"
                        />
                      </WizardField>
                    </div>
                  </div>
                )}

                {step === 'editorial_rules' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      {(['standard', 'strict'] as const).map((policy) => (
                        <button
                          key={policy}
                          type="button"
                          onClick={() => updateProfile('sourcePolicy', policy)}
                          className={`rounded-2xl border p-5 text-left transition cursor-pointer ${
                            data.editorialProfile.sourcePolicy === policy
                              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                              : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            {data.editorialProfile.sourcePolicy === policy && (
                              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                            )}
                          </div>
                          <div className="mt-5 font-display text-xl capitalize text-[var(--foreground)]">{policy}</div>
                          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                            {policy === 'strict'
                              ? 'Verification and source fidelity are treated as a stricter gate.'
                              : 'Platform guardrails remain active with standard editorial tolerance.'}
                          </p>
                        </button>
                      ))}
                    </div>
                    <WizardField label="Article structure" hint="One step per line" icon={FileText}>
                      <Textarea
                        value={joinList(data.editorialProfile.articleStructure)}
                        onChange={(event) => updateProfile('articleStructure', splitList(event.target.value))}
                        className="ui-control ui-textarea min-h-36"
                      />
                    </WizardField>
                    <WizardField label="Additional prohibited patterns" hint="Optional, one pattern per line" icon={CircleAlert} optional>
                      <Textarea
                        value={joinList(data.editorialProfile.additionalProhibitedPatterns)}
                        onChange={(event) => updateProfile('additionalProhibitedPatterns', splitList(event.target.value))}
                        placeholder={'Specific generic phrases\nSpecific competitor mentions'}
                        className="ui-control ui-textarea min-h-28"
                      />
                    </WizardField>
                    <WizardField
                      label="Custom instructions"
                      icon={WandSparkles}
                      optional
                      hint={`Optional • ${(data.editorialProfile.customInstructions || '').length} / 2000`}
                    >
                      <Textarea
                        value={data.editorialProfile.customInstructions || ''}
                        onChange={(event) => updateProfile('customInstructions', event.target.value)}
                        placeholder="Organization-specific editorial rules..."
                        className="ui-control ui-textarea min-h-28"
                      />
                    </WizardField>
                    <div className="grid gap-5 md:grid-cols-2">
                      <WizardField
                        label="Public article base URL"
                        icon={Link2}
                        optional
                        hint={`Optional • ${(data.editorialProfile.internalLinkBaseUrl || '').length} / 300`}
                      >
                        <Input
                          type="url"
                          value={data.editorialProfile.internalLinkBaseUrl || ''}
                          onChange={(event) => updateProfile('internalLinkBaseUrl', event.target.value)}
                          placeholder="https://journal.example.com/posts"
                          className="ui-control ui-input h-11"
                        />
                      </WizardField>
                      <WizardField label="Trusted internal-link domains" hint="One domain per line" icon={Globe2} optional>
                        <Textarea
                          value={joinList(data.editorialProfile.internalLinkDomains)}
                          onChange={(event) => updateProfile('internalLinkDomains', splitList(event.target.value))}
                          placeholder="journal.example.com"
                          className="ui-control ui-textarea min-h-24"
                        />
                      </WizardField>
                    </div>
                  </div>
                )}

                {step === 'cms_connection' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        { key: 'eai-rest-v1' as const, title: 'EAI REST Adapter', body: 'For CMS supporting the EAI catalog contract and import.' },
                        { key: 'none' as const, title: 'Connect Later', body: 'Activate the editorial workspace now without automatic export.' },
                      ].map((adapter) => (
                        <button
                          key={adapter.key}
                          type="button"
                          onClick={() => updateCms('adapterKey', adapter.key)}
                          className={`rounded-2xl border p-5 text-left transition cursor-pointer ${
                            data.cms.adapterKey === adapter.key
                              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                              : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)]'
                          }`}
                        >
                          <DatabaseZap className="h-5 w-5 text-primary" />
                          <div className="mt-5 text-sm font-bold text-[var(--foreground)]">{adapter.title}</div>
                          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{adapter.body}</p>
                        </button>
                      ))}
                    </div>

                    {data.cms.adapterKey === 'eai-rest-v1' && (
                      <div className="space-y-5 rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] p-5 md:p-6 shadow-sm">
                        <WizardField
                          label="Connection name"
                          icon={DatabaseZap}
                          hint={`${data.cms.name.length} / 100`}
                        >
                          <Input
                            type="text"
                            value={data.cms.name}
                            onChange={(event) => updateCms('name', event.target.value)}
                            placeholder="Production CMS"
                            className="ui-control ui-input h-11"
                          />
                        </WizardField>
                        <WizardField
                          label="CMS base URL"
                          icon={Link2}
                          hint={`${data.cms.baseUrl.length} / 300`}
                        >
                          <Input
                            type="url"
                            value={data.cms.baseUrl}
                            onChange={(event) => updateCms('baseUrl', event.target.value)}
                            placeholder="https://cms.example.com"
                            className="ui-control ui-input h-11"
                          />
                        </WizardField>
                        <WizardField
                          label="Shared secret"
                          hint={hasStoredCredential ? 'Encrypted credentials already stored' : `${cmsSecret.length} / 500`}
                          icon={KeyRound}
                        >
                          <Input
                            type="password"
                            value={cmsSecret}
                            onChange={(event) => {
                              setCmsSecret(event.target.value);
                              updateCms('verified', false);
                            }}
                            placeholder={hasStoredCredential ? '••••••••••••••••' : 'CMS shared secret'}
                            className="ui-control ui-input h-11 font-mono"
                          />
                        </WizardField>
                        <button
                          type="button"
                          onClick={() => void testCms()}
                          disabled={testingCms || !data.cms.baseUrl || !data.cms.name}
                          className="w-full ui-btn ui-btn-surface h-11 border border-[var(--border)] relative z-10"
                        >
                          {testingCms ? <Loader2 className="animate-spin" /> : <DatabaseZap />}
                          {testingCms ? 'Testing connection...' : 'Test Connection'}
                        </button>
                        {data.cms.verified && (
                          <div className="rounded-2xl border border-[var(--success)]/20 bg-[var(--success)]/8 p-4">
                            <div className="flex items-center gap-2 text-xs font-bold text-[var(--success)]">
                              <CheckCircle2 className="h-4 w-4" />
                              Catalog endpoint verified
                            </div>
                            {cmsSample.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {cmsSample.map((post) => (
                                  <div key={post.slug} className="truncate font-mono text-[10px] text-[var(--muted-foreground)]">
                                    /{post.slug} · {post.title}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {step === 'review' && (
                  <div className="space-y-5">
                    <ReviewCard
                      icon={Building2}
                      label="Organization"
                      title={data.organization.name}
                      detail={`${data.organization.publicationName} · /${data.organization.slug}`}
                    />
                    <ReviewCard
                      icon={WandSparkles}
                      label="Editorial identity"
                      title={data.editorialProfile.brandName}
                      detail={`${cleanList(data.editorialProfile.categories).length} categories · ${data.editorialProfile.sourcePolicy} source policy`}
                    />
                    <ReviewCard
                      icon={DatabaseZap}
                      label="CMS delivery"
                      title={data.cms.adapterKey === 'none' ? 'Connect later' : data.cms.name}
                      detail={data.cms.adapterKey === 'none' ? 'Export adapter not configured' : `${data.cms.baseUrl} · catalog verified`}
                    />
                    <div className="rounded-3xl border border-[var(--warning)]/20 bg-[var(--warning)]/8 p-5">
                      <div className="flex items-start gap-3">
                        <LockKeyhole className="mt-0.5 h-5 w-5 text-[var(--warning)]" />
                        <div>
                          <div className="text-sm font-bold text-[var(--foreground)]">Activation is immutable</div>
                          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                            Activation creates EditorialProfile v1. Subsequent changes will always create a new version and not overwrite this snapshot.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-10 flex items-center justify-between border-t border-[var(--border)] pt-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void goBack()}
                  disabled={currentIndex === 0 || saving || activating || skipping}
                  className="ui-btn ui-btn-muted text-sm gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void skipOnboarding()}
                  disabled={saving || activating || skipping}
                  className="ui-btn ui-btn-muted text-xs opacity-60 hover:opacity-100 font-normal underline underline-offset-4 gap-1.5"
                >
                  {skipping ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Use defaults
                </button>
              </div>
              {step === 'review' ? (
                <button
                  type="button"
                  onClick={() => void activateWorkspace()}
                  disabled={activating || saving || skipping}
                  className="ui-btn ui-btn-primary h-11 px-6 shadow-xl shadow-[var(--primary)]/15 text-sm gap-2"
                >
                  {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  {activating ? 'Activating...' : 'Activate Workspace'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void goNext()}
                  disabled={saving || skipping}
                  className="ui-btn ui-btn-primary h-11 px-6 shadow-xl shadow-[var(--primary)]/15 text-sm gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {saving ? 'Saving...' : 'Continue'}
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="hidden border-l border-[var(--border)] p-8 lg:block">
          <div className="sticky top-24">
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              Live editorial signature
            </div>
            <div className="mt-5 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--card)] shadow-2xl shadow-black/10 dark:shadow-black/50">
              <div className="h-1 bg-gradient-to-r from-[var(--primary)] via-sky-400 to-[var(--success)]" />
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
                    Profile v1 preview
                  </span>
                  <Sparkles className="h-4 w-4 text-[var(--gold)]" />
                </div>
                <h2 className="mt-8 font-display text-3xl leading-tight text-[var(--foreground)]">
                  {editorialPreview.brand}
                </h2>
                <p className="mt-4 text-xs leading-6 text-[var(--muted-foreground)]">
                  {editorialPreview.positioning}
                </p>
                <div className="mt-7 space-y-3 border-t border-[var(--border)] pt-5">
                  <SignatureRow label="Audience" value={data.editorialProfile.audience || 'Not defined'} />
                  <SignatureRow label="Source" value={data.editorialProfile.sourcePolicy} />
                  <SignatureRow label="CMS" value={data.cms.adapterKey === 'none' ? 'Later' : 'Connected'} />
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-[11px] leading-5 text-[var(--muted-foreground)]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--success)]" />
              Core factual and verification guardrails stay locked by EAI.
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
      <div className="mb-2 flex items-center justify-between gap-3">
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

function ReviewCard({
  icon: Icon,
  label,
  title,
  detail,
}: {
  icon: typeof Building2;
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</div>
        <div className="mt-1 truncate text-sm font-bold text-[var(--foreground)]">{title || 'Not configured'}</div>
        <div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{detail}</div>
      </div>
    </div>
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
