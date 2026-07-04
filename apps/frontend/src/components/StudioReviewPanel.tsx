'use client';

import React, { useState } from 'react';
import { 
  Sparkles, Bookmark, Wand2, FileText, ChevronDown, ChevronUp, Trash2, 
  Send, Loader2, CheckCircle2, AlertTriangle,
  Copy, Layers, Zap, Rocket, X,
  ChevronRight
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { AnalysisResult, EditorialProcessStage, ArticleMetadata, ResearchNote, Attachment } from '@eai/shared';
import { canAutoApplyFeedback } from '@eai/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type SeoEdits = NonNullable<AnalysisResult['generatedMetadata']>;

const generateStudioId = (prefix: string) => prefix + '-' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

interface StudioReviewPanelProps {
  // Global Workspace Mode
  isDemoMode?: boolean;

  // Research Notes Studio
  researchNotes: ResearchNote[];
  onNotesChange: (notes: ResearchNote[]) => void;
  onGenerateDraftFromNotes: () => void;
  isGeneratingDraft: boolean;
  onInsertNoteToDraft: (content: string) => void;
  attachments?: Attachment[];
  selectedAttachmentIds?: string[];

  // AI Refinement Control
  draftContent: string;
  analysisSpeed: 'fast' | 'publish';
  onAnalysisSpeedChange: (speed: 'fast' | 'publish') => void;
  onAnalyze: () => void;
  isStreaming: boolean;
  isRefining: boolean;
  processStage: EditorialProcessStage;
  processStartedAt: number | null;
  onRefineAgain: (instruction: string) => void;
  onReanalyze: () => void;

  // Editorial Review & Feedback
  analysis: AnalysisResult;
  hoveredFeedbackIndex: number | null;
  onHoveredFeedbackChange: (index: number | null) => void;
  activeFeedbackIndex: number | null;
  onActiveFeedbackChange: (index: number | null) => void;
  onApplyFix: (target: string, replacement: string, operation: 'replace' | 'insert_before' | 'insert_after' | 'manual', index: number) => boolean;
  onApplyAll: () => void;
  onAcceptFeedback: (index: number) => void;
  onRemoveFeedbackAddition: (index: number) => Promise<void>;
  onAddFeedbackSource: (index: number, url: string) => void;
  onMarkFeedbackVerified: (index: number) => void;
  onFixFeedbackWithEAI: (index: number) => Promise<void>;
  isTargetedFixing: number | null;
  activeHistoryId: string | null;
  refreshTrigger: number;

  // SEO Pack & Export
  articleMetadata: ArticleMetadata;
  onSeoMetadataChange: (updates: Partial<SeoEdits>) => void;
  cmsExportEnabled: boolean;
  onExport: () => void;
  isExporting: boolean;
  isRefineCountMaxed?: boolean;
  onShowSignupModal?: () => void;
}

export default function StudioReviewPanel({
  isDemoMode = false,
  researchNotes,
  onNotesChange,
  onGenerateDraftFromNotes,
  isGeneratingDraft,
  onInsertNoteToDraft,
  attachments: _attachments = [],
  selectedAttachmentIds: _selectedAttachmentIds = [],
  draftContent,
  analysisSpeed,
  onAnalysisSpeedChange,
  onAnalyze,
  isStreaming,
  isRefining,
  processStage: _processStage,
  processStartedAt: _processStartedAt,
  onRefineAgain,
  onReanalyze: _onReanalyze,
  analysis,
  hoveredFeedbackIndex: _hoveredFeedbackIndex,
  onHoveredFeedbackChange,
  activeFeedbackIndex: _activeFeedbackIndex,
  onActiveFeedbackChange: _onActiveFeedbackChange,
  onApplyFix,
  onApplyAll,
  onAcceptFeedback,
  onRemoveFeedbackAddition,
  onAddFeedbackSource: _onAddFeedbackSource,
  onMarkFeedbackVerified: _onMarkFeedbackVerified,
  onFixFeedbackWithEAI,
  isTargetedFixing: _isTargetedFixing,
  activeHistoryId: _activeHistoryId,
  refreshTrigger: _refreshTrigger,
  articleMetadata,
  onSeoMetadataChange,
  cmsExportEnabled,
  onExport,
  isExporting,
  isRefineCountMaxed = false,
  onShowSignupModal,
}: StudioReviewPanelProps) {
  const [refineInput, setRefineInput] = useState('');
  const [unselectedNoteIds, setUnselectedNoteIds] = useState<string[]>([]);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [activePopupFeature, setActivePopupFeature] = useState<string | null>(null);
  const [expandedBpId, setExpandedBpId] = useState<string | null>(null);

  // SEO state — read from analysis.generatedMetadata (backend) with local overrides
  const [editedSeoTitle, setEditedSeoTitleLocal] = useState<string | null>(null);
  const [editedSeoSlug, setEditedSeoSlugLocal] = useState<string | null>(null);
  const [editedSeoMetaDescription, setEditedSeoMetaDescriptionLocal] = useState<string | null>(null);
  const [editedSeoFocusKeyword, setEditedSeoFocusKeywordLocal] = useState<string | null>(null);

  // Sync SEO edits to parent so Export uses the user-edited values
  const setEditedSeoTitle = (v: string) => {
    setEditedSeoTitleLocal(v);
    onSeoMetadataChange({ title: v });
  };
  const setEditedSeoSlug = (v: string) => {
    setEditedSeoSlugLocal(v);
    onSeoMetadataChange({ slug: v });
  };
  const setEditedSeoMetaDescription = (v: string) => {
    setEditedSeoMetaDescriptionLocal(v);
    onSeoMetadataChange({ metaDescription: v });
  };
  const setEditedSeoFocusKeyword = (v: string) => {
    setEditedSeoFocusKeywordLocal(v);
    onSeoMetadataChange({ focusKeyword: v });
  };

  const metadata = analysis.generatedMetadata || {};

  const seoTitle = editedSeoTitle !== null ? editedSeoTitle : (metadata.title || '');
  const seoSlug = editedSeoSlug !== null ? editedSeoSlug : (metadata.slug || '');
  const seoMetaDescription = editedSeoMetaDescription !== null ? editedSeoMetaDescription : (metadata.metaDescription || '');
  const seoFocusKeyword = editedSeoFocusKeyword !== null ? editedSeoFocusKeyword : (metadata.focusKeyword || '');

  const getBlueprintFromSession = () => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem('eai_strategist_current_plan');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const EAI_STUDIO_CARDS = [
    { id: 'blueprint', label: 'Blueprint Draf', shortLabel: 'Blueprint Draf', icon: FileText, desc: 'Lihat sudut pandang, target pembaca, dan outline draf.' },
    { id: 'refinement_control', label: 'AI Refinement Control', shortLabel: 'Refinement', icon: Sparkles, desc: 'Poles draf instan atau mendalam menggunakan AI.' },
    { id: 'editorial_review', label: 'Editorial Review & Feedback', shortLabel: 'Editorial Review', icon: Layers, desc: 'Cek kesalahan ejaan, tata bahasa, dan gaya bahasa.' },
    { id: 'seo_pack_export', label: 'SEO Pack & Export', shortLabel: 'SEO & Ekspor', icon: Rocket, desc: 'Kelola metadata SEO dan ekspor langsung ke WordPress/Ghost.' }
  ];
  // Feedback states
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set());
  const [expandedFeedback, setExpandedFeedback] = useState<Set<number>>(new Set());

  const toggleFeedbackItem = (index: number) => {
    setExpandedFeedback(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleApplyClick = (target: string, replacement: string, operation: 'replace' | 'insert_before' | 'insert_after' | 'manual', index: number) => {
    const success = onApplyFix(target, replacement, operation, index);
    if (success) {
      setAppliedSuggestions(prev => new Set(prev).add(index));
      toast.success('Applied suggestion!');
    }
  };
  // --- Badge indicator data for card grid ---
  const hasAnalysis = analysis.status === 'success';
  const openIssues = analysis.feedback?.filter(x => !x.isAccepted && !x.isVerified && x.status !== 'pass') ?? [];
  const criticalIssues = openIssues.filter(x => x.status === 'fail').length;
  const warningIssues = openIssues.filter(x => x.status === 'warning').length;
  const editorialBadgeColor = !hasAnalysis
    ? 'bg-[var(--muted-foreground)]/20 text-[var(--muted-foreground)]'
    : criticalIssues > 0
      ? 'bg-red-500/15 text-red-500'
      : warningIssues > 0
        ? 'bg-amber-500/15 text-amber-500'
        : 'bg-emerald-500/15 text-emerald-500';
  const editorialBadgeLabel = !hasAnalysis
    ? '—'
    : criticalIssues > 0
      ? `${criticalIssues} kritis`
      : warningIssues > 0
        ? `${warningIssues} peringatan`
        : 'Bersih';
  const seoFieldsFilled = [seoTitle, seoSlug, seoMetaDescription].filter(Boolean).length;
  const seoBadgeColor = !hasAnalysis || seoFieldsFilled === 0
    ? 'bg-[var(--muted-foreground)]/20 text-[var(--muted-foreground)]'
    : seoFieldsFilled >= 3
      ? 'bg-emerald-500/15 text-emerald-500'
      : 'bg-amber-500/15 text-amber-500';
  const seoBadgeLabel = !hasAnalysis
    ? '—'
    : seoFieldsFilled === 0
      ? 'Belum diisi'
      : seoFieldsFilled >= 3
        ? 'SEO Siap'
        : `${seoFieldsFilled}/3 field`;

  const cardBadges: Record<string, { label: string; color: string } | null> = {
    blueprint: null,
    refinement_control: null,
    editorial_review: { label: editorialBadgeLabel, color: editorialBadgeColor },
    seo_pack_export: { label: seoBadgeLabel, color: seoBadgeColor },
  };

  const autoApplicableCount = analysis.feedback?.filter(canAutoApplyFeedback).length || 0;
  const isManualFallback = analysis.responseMode === 'manual_fallback';

  const readiness = analysis.readiness;
  const readinessClass =
    readiness === 'ready' ? 'ui-badge-success' :
    readiness === 'needs_review' ? 'ui-badge-warning' :
    readiness === 'blocked' ? 'ui-badge-danger' : 'ui-badge-muted';
  const readinessLabel =
    readiness === 'ready' ? 'Ready for Review' :
    readiness === 'needs_review' ? 'Needs Review' :
    readiness === 'blocked' ? 'Blocked' : 'Legacy Review';

  const canExport =
    !isDemoMode &&
    cmsExportEnabled &&
    analysis.status === 'success' &&
    readiness === 'ready' &&
    analysis.analysisLogId &&
    analysis.sourceRef &&
    analysis.generatedMetadata?.title &&
    analysis.generatedMetadata?.excerpt &&
    analysis.generatedMetadata?.metaTitle &&
    analysis.generatedMetadata?.metaDescription &&
    draftContent.trim();

  const exportUnavailableReason = isDemoMode
    ? 'Sign up to export to CMS'
    : !cmsExportEnabled
      ? 'Connect CMS in settings'
      : analysis.status !== 'success'
        ? 'Refine draft first'
        : readiness !== 'ready'
          ? 'Pass quality gate first'
          : !analysis.analysisLogId
            ? 'Requires saved log'
            : !analysis.sourceRef
              ? 'Missing source reference'
              : !analysis.generatedMetadata?.title || !analysis.generatedMetadata?.excerpt || !analysis.generatedMetadata?.metaTitle || !analysis.generatedMetadata?.metaDescription
                ? 'Complete SEO metadata first'
                : !draftContent.trim()
                  ? 'Refined draft required'
                  : null;

  return (
    <TooltipProvider delay={300}>
      <div className="flex-1 flex flex-col h-full min-h-0 bg-[var(--surface-1)] border-l border-[var(--border)] overflow-hidden">
        
        {/* Header with Title and Toggle */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
            Studio
          </span>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--primary)]" />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          
            {/* Grid of EAI Studio Cards */}
          <div className="grid grid-cols-2 gap-3 p-4 bg-[var(--surface-1)] border-b border-[var(--border)] shrink-0">
            {EAI_STUDIO_CARDS.map((opt) => {
              const Icon = opt.icon;
              const badge = cardBadges[opt.id];
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActivePopupFeature(opt.id)}
                  className="relative flex flex-col justify-between p-3.5 h-[68px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] active:bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl text-left cursor-pointer transition-all hover:scale-[1.02] group min-w-0"
                  title={opt.label}
                >
                  <div className="flex items-center justify-between w-full">
                    <Icon className="w-4 h-4 text-[var(--primary)] shrink-0" />
                    {badge ? (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${badge.color}`}>
                        {badge.label}
                      </span>
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--muted-foreground)] opacity-50 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-[var(--foreground)] truncate w-full leading-tight select-none">
                    {opt.shortLabel}
                  </p>
                </button>
              );
            })}
          </div>

          {/* List of outputs and notes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 flex flex-col min-h-0">
            
            {/* Dynamic Draft from Notes & Clear Controls */}
            {researchNotes.length > 0 && (
              <div className="flex justify-between items-center gap-2 shrink-0">
                <button
                  onClick={onGenerateDraftFromNotes}
                  disabled={isGeneratingDraft || researchNotes.filter(n => !unselectedNoteIds.includes(n.id)).length === 0}
                  className="flex-1 ui-btn ui-btn-primary ui-btn-xs flex justify-center gap-1.5"
                >
                  {isGeneratingDraft ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  <span>Draft from Notes</span>
                </button>
                <button
                  onClick={() => {
                    onNotesChange([]);
                    toast.success('All notes cleared');
                  }}
                  className="ui-btn ui-btn-danger ui-btn-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Outputs List */}
            {researchNotes.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 my-auto">
                <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] flex items-center justify-center border border-[var(--border)]">
                  <Sparkles className="w-6 h-6 text-[var(--muted-foreground)]" />
                </div>
                <div className="space-y-1">
                  <p className="text-[13px] font-semibold text-[var(--foreground)]">
                    Output studio akan disimpan di sini.
                  </p>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed max-w-[280px]">
                    Simpan catatan dari chat AI Strategist atau gunakan tombol grid EAI di atas untuk menganalisis draf.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pr-1 flex-1">
                {researchNotes.map((note, idx) => {
                  const isExpanded = expandedNoteId === note.id;
                  const lines = note.content.split('\n').map(l => l.trim()).filter(Boolean);
                  const firstLine = lines[0] || '';
                  const cleanTitle = firstLine.startsWith('#') 
                    ? firstLine.replace(/^[#\s*]+/, '') 
                    : `Note ${idx + 1}`;

                  return (
                    <div key={note.id} className="relative bg-[var(--background)] border border-[var(--border)] rounded-xl p-3 group shadow-sm hover:shadow-md transition-all">
                      <button
                        type="button"
                        onClick={() => {
                          onNotesChange(researchNotes.filter(n => n.id !== note.id));
                          toast.success('Note deleted');
                        }}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-red-500 transition-all bg-[var(--background)]/85 border-none cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-2 mb-1.5">
                        <input
                          type="checkbox"
                          checked={!unselectedNoteIds.includes(note.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setUnselectedNoteIds(prev => prev.filter(id => id !== note.id));
                            } else {
                              setUnselectedNoteIds(prev => [...prev, note.id]);
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-[var(--border)] text-[var(--primary)] cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                          className="flex items-center gap-1 bg-transparent text-left cursor-pointer hover:bg-[var(--surface-2)] px-1.5 py-0.5 rounded-md text-[10px] font-bold text-[var(--primary)] uppercase"
                        >
                          <span className="truncate max-w-[180px]">{cleanTitle}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-2 space-y-2.5">
                          <div className="font-sans prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed text-[var(--foreground)] prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5 break-words">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {note.content}
                            </ReactMarkdown>
                          </div>
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => onInsertNoteToDraft(note.content)}
                              className="ui-btn ui-btn-outline ui-btn-xs"
                            >
                              Insert to Draft
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pill-shaped bottom button "Tambahkan catatan" */}
          <div className="p-4 bg-[var(--surface-1)] border-t border-[var(--border)] flex justify-center shrink-0">
            {isAddingNote ? (
              <div className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl p-3 space-y-3 shadow-lg">
                <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase">Catatan Baru</span>
                <textarea
                  placeholder="Tulis atau tempel catatan Anda di sini..."
                  value={newNoteContent}
                  onChange={e => setNewNoteContent(e.target.value)}
                  className="w-full h-24 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-2.5 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNote(false);
                      setNewNoteContent('');
                    }}
                    className="ui-btn ui-btn-outline ui-btn-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (newNoteContent.trim()) {
                        onNotesChange([...researchNotes, {
                          id: generateStudioId('manual'),
                          content: newNoteContent,
                          savedAt: new Date().toISOString(),
                          sources: []
                        }]);
                        setNewNoteContent('');
                        setIsAddingNote(false);
                        toast.success('Catatan berhasil ditambahkan');
                      }
                    }}
                    className="ui-btn ui-btn-primary ui-btn-xs"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingNote(true)}
                className="flex items-center gap-2 px-5 py-2 bg-white text-black hover:bg-neutral-100 rounded-full shadow-lg border border-neutral-200 cursor-pointer text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] select-none"
              >
                <Bookmark className="w-3.5 h-3.5 text-black" />
                <span>Tambahkan catatan</span>
              </button>
            )}
          </div>

        </div>

        {/* --- MODAL POPUPS FOR GRID FEATURES --- */}
        {activePopupFeature && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[var(--surface-1)] border border-[var(--border)] w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
                <h3 className="font-bold text-[14px] text-[var(--foreground)] flex items-center gap-2">
                  {(() => {
                    const card = EAI_STUDIO_CARDS.find(x => x.id === activePopupFeature);
                    if (!card) return null;
                    const Icon = card.icon;
                    return (
                      <>
                        <Icon className="w-4 h-4 text-[var(--primary)]" />
                        <span>{card.label}</span>
                      </>
                    );
                  })()}
                </h3>
                <button
                  type="button"
                  onClick={() => setActivePopupFeature(null)}
                  className="p-1 rounded-md hover:bg-[var(--surface-3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-none bg-transparent cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {activePopupFeature === 'blueprint' && (() => {
                  const activeBp = getBlueprintFromSession();
                  const bpNotes = researchNotes.filter(n => 
                    n.content.toLowerCase().includes('blueprint') || 
                    n.content.toLowerCase().includes('outline') ||
                    n.content.startsWith('#')
                  );

                  interface BlueprintItem {
                    id: string;
                    title: string;
                    angle?: string;
                    audience?: string;
                    hook?: string;
                    outline?: string;
                    content?: string;
                  }
                  const allBlueprints: BlueprintItem[] = [];
                  if (activeBp) {
                    allBlueprints.push({
                      id: 'session-bp',
                      title: 'Active Blueprint (AI Strategist)',
                      angle: activeBp.angle,
                      audience: activeBp.audience,
                      hook: activeBp.hook,
                      outline: activeBp.outline
                    });
                  }
                  bpNotes.forEach((n, idx) => {
                    const lines = n.content.split('\n').map(l => l.trim()).filter(Boolean);
                    const titleLine = lines[0] || '';
                    const cleanTitle = titleLine.startsWith('#') ? titleLine.replace(/^[#\s*]+/, '') : `Blueprint Note ${idx + 1}`;
                    allBlueprints.push({
                      id: n.id,
                      title: cleanTitle,
                      content: n.content
                    });
                  });

                  if (allBlueprints.length === 0) {
                    return (
                      <div className="text-center py-8 text-xs text-[var(--muted-foreground)] bg-[var(--surface-2)] rounded-xl border border-dashed border-[var(--border)]">
                        Belum ada blueprint draf yang dirancang. Silakan buka tab Chat untuk merancang blueprint bersama EAI.
                      </div>
                    );
                  }

                  const currentExpandedId = expandedBpId || allBlueprints[0].id;

                  return (
                    <div className="space-y-3">
                      <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed mb-1">
                        Ditemukan {allBlueprints.length} blueprint draf. Klik blueprint untuk menampilkan detail outline.
                      </p>
                      <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                        {allBlueprints.map((bp) => {
                          const isExpanded = currentExpandedId === bp.id;
                          return (
                            <div key={bp.id} className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface-2)]">
                              <button
                                type="button"
                                onClick={() => setExpandedBpId(isExpanded ? null : bp.id)}
                                className="w-full flex justify-between items-center px-4 py-3 bg-[var(--surface-3)] border-none text-left cursor-pointer hover:bg-[var(--surface-2)] transition-colors text-xs font-bold text-[var(--foreground)]"
                              >
                                <span>{bp.title}</span>
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--muted-foreground)]" /> : <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />}
                              </button>
                              {isExpanded && (
                                <div className="p-4 space-y-3.5 border-t border-[var(--border)] text-xs">
                                  {bp.id === 'session-bp' ? (
                                    <>
                                      <div>
                                        <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block mb-1">Angle / Topic</span>
                                        <p className="text-[12px] text-[var(--foreground)] font-medium bg-[var(--surface-1)] p-2.5 rounded-lg border border-[var(--border)]">{bp.angle}</p>
                                      </div>
                                      <div>
                                        <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block mb-1">Target Audience</span>
                                        <p className="text-[12px] text-[var(--foreground)] bg-[var(--surface-1)] p-2.5 rounded-lg border border-[var(--border)]">{bp.audience || 'N/A'}</p>
                                      </div>
                                      {bp.hook && (
                                        <div>
                                          <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block mb-1">Hook</span>
                                          <p className="text-[12px] text-[var(--foreground)] bg-[var(--surface-1)] p-2.5 rounded-lg border border-[var(--border)]">{bp.hook}</p>
                                        </div>
                                      )}
                                      <div>
                                        <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block mb-1">Outline Structure</span>
                                        <div className="bg-[var(--surface-1)] p-3 rounded-lg border border-[var(--border)] font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                                          {bp.outline}
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="font-sans prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed text-[var(--foreground)] break-words">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {bp.content}
                                      </ReactMarkdown>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {activePopupFeature === 'refinement_control' && (
                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between bg-[var(--surface-2)] p-1 rounded-xl border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => onAnalysisSpeedChange('fast')}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border-none cursor-pointer ${
                          analysisSpeed === 'fast' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'bg-transparent text-[var(--muted-foreground)]'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Fast Review (Tanpa SEO)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isDemoMode && isRefineCountMaxed) {
                            if (onShowSignupModal) onShowSignupModal();
                            return;
                          }
                          onAnalysisSpeedChange('publish');
                        }}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border-none cursor-pointer ${
                          analysisSpeed === 'publish' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'bg-transparent text-[var(--muted-foreground)]'
                        }`}
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        Publish Ready (Dengan SEO)
                      </button>
                    </div>
                    
                    <div className="bg-[var(--surface-2)] p-4 rounded-xl text-center text-xs text-[var(--muted-foreground)] border border-[var(--border)] leading-relaxed">
                      {analysisSpeed === 'fast' 
                        ? 'Mode Fast Review memproses polesan draf instan (ejaan, tata bahasa, dan readability) dengan sangat cepat.' 
                        : 'Mode Publish Ready melakukan pemulasan komprehensif, memeriksa fakta sumber rujukan, serta menghasilkan metadata SEO siap publikasi.'
                      }
                    </div>

                    {/* Iterative Prompt Box */}
                    <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                      <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider block">Instruksi Poles Tambahan (Opsional)</span>
                      <textarea
                        placeholder="Tambahkan instruksi polesan (misal: 'buat lebih pendek', 'nadanya ramah')..."
                        value={refineInput}
                        onChange={e => setRefineInput(e.target.value)}
                        disabled={isRefining || isStreaming}
                        className="w-full h-24 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] resize-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (refineInput.trim()) {
                          onRefineAgain(refineInput);
                          setRefineInput('');
                        } else {
                          onAnalyze();
                        }
                        setActivePopupFeature(null);
                      }}
                      disabled={!draftContent.trim() || isStreaming || isRefining}
                      className="w-full ui-btn ui-btn-primary ui-btn-sm py-3 justify-center font-bold flex items-center gap-2"
                    >
                      {isStreaming || isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      <span>{isStreaming || isRefining ? 'Pemulasan Berlangsung...' : 'Refine Draft'}</span>
                    </button>
                  </div>
                )}

                {activePopupFeature === 'editorial_review' && (
                  <div className="space-y-4 text-xs">

                    {/* Empty state: belum di-analyze */}
                    {!hasAnalysis ? (
                      <div className="text-center py-10 space-y-4">
                        <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] flex items-center justify-center border border-[var(--border)] mx-auto">
                          <Layers className="w-6 h-6 text-[var(--muted-foreground)]" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[13px] font-semibold text-[var(--foreground)]">Belum Ada Hasil Review</p>
                          <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                            Jalankan Refine Draft terlebih dahulu untuk mendapatkan feedback editorial dari AI.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePopupFeature('refinement_control');
                          }}
                          className="ui-btn ui-btn-primary ui-btn-sm inline-flex items-center gap-1.5 mx-auto"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Buka Refinement Control
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Quality Gate Status */}
                        <div className="grid grid-cols-2 gap-3 bg-[var(--surface-2)] p-3.5 rounded-xl border border-[var(--border)]">
                          <div>
                            <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block">Skor Kualitas</span>
                            <span className={`ui-badge ui-badge-sm mt-1.5 inline-block ${readinessClass}`}>
                              {readinessLabel}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block">Keputusan Gate</span>
                            <span className={`font-bold text-[12px] mt-1.5 block ${
                              readiness === 'ready' ? 'text-emerald-500' : readiness === 'needs_review' ? 'text-amber-500' : 'text-red-500'
                            }`}>
                              {readiness === 'ready' ? 'Approve (Siap Rilis)' : readiness === 'needs_review' ? 'Revise (Butuh Perbaikan)' : 'Reject (Ditolak)'}
                            </span>
                          </div>
                        </div>

                        {/* Verdict Summary */}
                        {analysis.summary && (
                          <div className="bg-[var(--surface-2)] p-3.5 rounded-xl border border-[var(--border)]">
                            <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block mb-1">Verdict Summary</span>
                            <p className="leading-relaxed text-[var(--foreground)] italic">
                              &ldquo;{analysis.summary}&rdquo;
                            </p>
                          </div>
                        )}

                        {/* Revision Stats / Diff Stats */}
                        <div className="bg-[var(--surface-2)] p-3.5 rounded-xl border border-[var(--border)] space-y-2">
                          <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block">Statistik Revisi (Diff Stats)</span>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="bg-[var(--surface-3)] p-2 rounded-lg">
                              <span className="block font-bold text-[13px] text-emerald-500">{appliedSuggestions.size}</span>
                              <span className="text-[9px] text-[var(--muted-foreground)]">Diterapkan</span>
                            </div>
                            <div className="bg-[var(--surface-3)] p-2 rounded-lg">
                              <span className="block font-bold text-[13px] text-[var(--primary)]">
                                {openIssues.length}
                              </span>
                              <span className="text-[9px] text-[var(--muted-foreground)]">Tersisa</span>
                            </div>
                            <div className="bg-[var(--surface-3)] p-2 rounded-lg">
                              <span className="block font-bold text-[13px] text-amber-500">
                                {analysis.feedback?.filter(x => x.category === 'Spelling' || x.category === 'Grammar').length || 0}
                              </span>
                              <span className="text-[9px] text-[var(--muted-foreground)]">Ejaan/Grammar</span>
                            </div>
                            <div className="bg-[var(--surface-3)] p-2 rounded-lg">
                              <span className="block font-bold text-[13px] text-purple-500">
                                {analysis.feedback?.filter(x => x.category === 'Style' || x.category === 'Readability').length || 0}
                              </span>
                              <span className="text-[9px] text-[var(--muted-foreground)]">Readability</span>
                            </div>
                          </div>
                        </div>

                        {/* Feedback Checklist */}
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-xs text-[var(--foreground)]">Daftar Feedback Highlight</span>
                            {onApplyAll && autoApplicableCount > 0 && !isManualFallback && (
                              <button
                                type="button"
                                onClick={() => {
                                  onApplyAll();
                                  setActivePopupFeature(null);
                                }}
                                className="ui-btn ui-btn-primary ui-btn-xs flex items-center gap-1.5"
                              >
                                <Wand2 className="w-3.5 h-3.5" />
                                Apply All ({autoApplicableCount})
                              </button>
                            )}
                          </div>

                          {(!analysis.feedback || analysis.feedback.length === 0) ? (
                            <div className="text-center py-6 text-xs text-[var(--muted-foreground)] bg-[var(--surface-2)] rounded-xl border border-dashed border-[var(--border)]">
                              Tidak ada masukan editorial. Draf sudah bersih!
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                              {analysis.feedback.map((item, idx) => {
                                const isApplied = appliedSuggestions.has(idx);
                                const isExpanded = expandedFeedback.has(idx);
                                const isAccepted = item.isAccepted;
                            const isVerified = item.isVerified;
                            const isResolved = isAccepted || isVerified || item.status === 'pass';
                            const showApplyFeature = (item.status === 'warning' || item.status === 'fail') && canAutoApplyFeedback(item);
                            const borderColor = isResolved ? 'var(--success)' : item.status === 'warning' ? 'var(--warning)' : 'var(--error)';
                            
                            return (
                              <div
                                key={idx}
                                onMouseEnter={() => onHoveredFeedbackChange(idx)}
                                onMouseLeave={() => onHoveredFeedbackChange(null)}
                                className="bg-[var(--surface-2)] border rounded-xl p-3 space-y-2.5 transition-all hover:bg-[var(--surface-3)]"
                                style={{ borderLeftWidth: '3.5px', borderLeftColor: borderColor }}
                              >
                                <div className="flex justify-between items-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleFeedbackItem(idx)}
                                    className="font-bold text-xs bg-transparent border-none text-[var(--foreground)] text-left cursor-pointer hover:underline p-0"
                                  >
                                    {item.category}
                                  </button>
                                  <span className={`ui-badge ui-badge-xs ${isResolved ? 'ui-badge-success' : item.status === 'warning' ? 'ui-badge-warning' : 'ui-badge-danger'}`}>
                                    {isResolved ? 'Pass' : item.status}
                                  </span>
                                </div>
                                
                                <p className="leading-relaxed opacity-90">{item.message}</p>

                                {isExpanded && (
                                  <div className="space-y-2.5 pt-2 border-t border-[var(--border)]/30 text-xs">
                                    {item.targetText && !showApplyFeature && (
                                      <div className="bg-[var(--surface-3)] p-2 rounded-lg">
                                        <span className="text-[9px] font-bold uppercase tracking-wider block mb-1 text-[var(--primary)]">Target Sentence</span>
                                        <p className="font-mono text-[10px] leading-relaxed break-words italic">
                                          &ldquo;{item.targetText}&rdquo;
                                        </p>
                                      </div>
                                    )}

                                    {showApplyFeature && (
                                      <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                                        <div className="p-2 space-y-1.5 bg-[var(--surface-3)]">
                                          <p className="line-through text-red-500/80 font-mono text-[10px] break-words">&ldquo;{item.targetText}&rdquo;</p>
                                          <p className="text-emerald-500 font-mono text-[10px] break-words">&ldquo;{item.replacementText}&rdquo;</p>
                                          <div className="flex justify-end pt-1">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleApplyClick(item.targetText!, item.replacementText!, item.operation!, idx);
                                              }}
                                              disabled={isApplied}
                                              className="ui-btn ui-btn-primary ui-btn-xs"
                                            >
                                              {isApplied ? 'Applied' : 'Apply'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {!isResolved && (
                                      <div className="flex gap-1.5 pt-1">
                                        {item.category === 'Editorial Addition' && (
                                          <>
                                            <button type="button" onClick={() => onAcceptFeedback(idx)} className="ui-btn ui-btn-success ui-btn-xs">Accept</button>
                                            <button type="button" onClick={() => onRemoveFeedbackAddition(idx)} className="ui-btn ui-btn-muted ui-btn-xs">Remove</button>
                                          </>
                                        )}
                                        {item.category === 'Internal Linking' && (
                                          <button type="button" onClick={() => onAcceptFeedback(idx)} className="ui-btn ui-btn-success ui-btn-xs">Accept Link</button>
                                        )}
                                        {item.targetText && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              onFixFeedbackWithEAI(idx);
                                              setActivePopupFeature(null);
                                            }}
                                            className="ui-btn ui-btn-primary ui-btn-xs ml-auto"
                                          >
                                            Rewrite
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activePopupFeature === 'seo_pack_export' && (
                  <div className="space-y-4 text-xs">
                    <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider block">Pengaturan SEO Pack & Metadata</span>
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block">Title</label>
                        <input
                          type="text"
                          value={seoTitle}
                          onChange={e => setEditedSeoTitle(e.target.value)}
                          placeholder="Masukkan judul SEO..."
                          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block">Slug</label>
                        <input
                          type="text"
                          value={seoSlug}
                          onChange={e => setEditedSeoSlug(e.target.value)}
                          placeholder="slug-artikel-seo"
                          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block">Meta Description</label>
                        <textarea
                          value={seoMetaDescription}
                          onChange={e => setEditedSeoMetaDescription(e.target.value)}
                          placeholder="Masukkan deskripsi penelusuran search engine..."
                          className="w-full h-20 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-2.5 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block">Focus Keyword</label>
                        <input
                          type="text"
                          value={seoFocusKeyword}
                          onChange={e => setEditedSeoFocusKeyword(e.target.value)}
                          placeholder="e.g. kecerdasan buatan, editorial workspace"
                          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => {
                          const textToCopy = `Title: ${seoTitle}\nSlug: ${seoSlug}\nMeta Description: ${seoMetaDescription}\nFocus Keyword: ${seoFocusKeyword}`;
                          navigator.clipboard.writeText(textToCopy);
                          toast.success('SEO Pack copied to clipboard!');
                        }}
                        className="flex-1 ui-btn ui-btn-outline ui-btn-sm py-2.5 justify-center flex items-center gap-1.5 font-bold"
                      >
                        <Copy className="w-4 h-4" />
                        Salin SEO Pack
                      </button>
                    </div>

                    {/* Direct Export to CMS Block */}
                    <div className="space-y-3 pt-2.5 border-t border-[var(--border)]">
                      <div className="bg-[var(--surface-2)] p-3 rounded-xl border border-[var(--border)] space-y-1.5">
                        <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block">CMS Checklist & Export</span>
                        <div className="space-y-1 text-[11px] leading-relaxed">
                          <div className="flex items-center gap-1.5">
                            {draftContent.trim() ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-[var(--error)] shrink-0" />}
                            <span>Draf konten terisi</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {readiness === 'ready' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />}
                            <span>Lolos Kualitas (Ready)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {seoTitle ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />}
                            <span>Judul SEO terisi</span>
                          </div>
                        </div>
                      </div>

                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              onClick={() => {
                                onExport();
                                setActivePopupFeature(null);
                              }}
                              disabled={!canExport || isExporting}
                              className={`w-full ui-btn ui-btn-sm py-3 justify-center font-bold flex items-center gap-2 ${
                                canExport && !isExporting ? 'ui-btn-primary' : 'ui-btn-surface'
                              }`}
                            >
                              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              <span>{isExporting ? 'Exporting...' : 'Export to CMS'}</span>
                            </button>
                          }
                        />
                        <TooltipContent side="top" className="text-xs">
                          {exportUnavailableReason || 'Ekspor langsung artikel ke WordPress atau Ghost Anda.'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </TooltipProvider>
  );
}
