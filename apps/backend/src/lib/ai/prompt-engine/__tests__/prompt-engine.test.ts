import { describe, it, expect } from 'vitest';
import { CompositePromptNode, PromptNode, RenderContext } from '@eai/shared';
import { SeoPromptComposer } from '../composer/seo-composer';
import { ReviewPromptComposer } from '../composer/review-composer';
import { RewritePromptComposer } from '../composer/rewrite-composer';
import { RefinementPromptComposer } from '../composer/refinement-composer';
import { QualityGatePromptComposer } from '../composer/quality-gate-composer';
import { StrategistPromptComposer } from '../composer/strategist-composer';
import { StrategistChatComposer } from '../composer/strategist-chat-composer';
import { StrategistBlueprintComposer } from '../composer/strategist-blueprint-composer';
import { DraftFromNotesComposer } from '../composer/draft-from-notes-composer';
import {
  StrategistSystemRoleNode,
  StrategistGeneralConstraintsNode,
  StrategistExamplesNode,
  StrategistFastModeInstructionNode,
} from '../core/strategist';

class MockStaticNode implements PromptNode {
  id = 'mock:static';
  type = 'core' as const;
  isStatic = true;
  render(_context: RenderContext): string {
    return 'Static Instruction';
  }
}

class MockDynamicNode implements PromptNode {
  id = 'mock:dynamic';
  type = 'tenant' as const;
  isStatic = false;
  render(_context: RenderContext): string {
    return 'Dynamic Instruction';
  }
}

describe('Prompt Engine unit tests', () => {
  const mockProfile = {
    brandName: 'TestBrand',
    positioning: 'Leading test positioning.',
    categories: ['Tech', 'Science'],
    audience: 'Testers',
    tone: ['precise'],
    articleStructure: ['Intro', 'Outro'],
    additionalProhibitedPatterns: ["in today's era"],
    sourcePolicy: 'strict' as const,
    seoRules: {
      titleMaxLength: 100,
      metaTitleMaxLength: 50,
      metaDescriptionMaxLength: 120,
      tagCountMin: 3,
      tagCountMax: 5,
    },
    internalLinkDomains: ['test.com'],
    internalLinkBaseUrl: 'https://test.com',
  };

  it('CompositePromptNode ordering (Static first, Dynamic last)', () => {
    const composite = new CompositePromptNode('test_composite');
    composite.addChild(new MockDynamicNode());
    composite.addChild(new MockStaticNode());

    const renderedText = composite.render({ format: 'text' });
    expect(renderedText.startsWith('Static Instruction')).toBe(true);
    expect(renderedText.includes('Dynamic Instruction')).toBe(true);
  });

  it('XML format serialization', () => {
    const composite = new CompositePromptNode('test_composite');
    composite.addChild(new MockDynamicNode());
    composite.addChild(new MockStaticNode());

    const renderedXml = composite.render({ format: 'xml' });
    expect(renderedXml.includes('<!-- DYNAMIC CONTEXT & CONSTRAINTS -->')).toBe(true);
  });

  it('SeoPromptComposer generation', () => {
    const seoComposer = new SeoPromptComposer(mockProfile);
    const composedPrompt = seoComposer.compose('xml');

    expect(composedPrompt.includes('<editorial_mission>')).toBe(true);
    expect(composedPrompt.includes('<seo_specialist_role>')).toBe(true);
    expect(composedPrompt.includes('<brand_identity>')).toBe(true);
    expect(composedPrompt.includes('<brand_name>TestBrand</brand_name>')).toBe(true);
    expect(composedPrompt.includes('<tone_calibration>')).toBe(true);
  });

  it('ReviewPromptComposer generation', () => {
    const reviewComposerAuthor = new ReviewPromptComposer('author', mockProfile);
    const composedAuthor = reviewComposerAuthor.compose('xml');

    expect(composedAuthor.includes('<role_instructions>')).toBe(true);
    expect(composedAuthor.includes('YOUR ROLE: Writing Co-Pilot')).toBe(true);
    expect(composedAuthor.includes('<output_format_contract>')).toBe(true);
    expect(composedAuthor.includes('<temporal_context_rules>')).toBe(true);
    expect(composedAuthor.includes('<source_policy>')).toBe(true);

    const reviewComposerPolish = new ReviewPromptComposer('polish', mockProfile);
    const composedPolish = reviewComposerPolish.compose('xml');
    expect(composedPolish.includes('YOUR ROLE: Draft Transformation Editor')).toBe(true);
  });

  it('RewritePromptComposer generation', () => {
    const rewriteComposer = new RewritePromptComposer(mockProfile, {
      isChunkMode: true,
      publishedPosts: [{ title: 'Existing Post', slug: 'existing-post' }]
    });
    const composedRewrite = rewriteComposer.compose('xml');

    expect(composedRewrite.includes('<rewrite_role_instructions brand="TestBrand">')).toBe(true);
    expect(composedRewrite.includes('You are a senior TestBrand editor')).toBe(true);
    expect(composedRewrite.includes('<rewrite_few_shot_demonstration>')).toBe(true);
    expect(composedRewrite.includes('<rewrite_priorities_and_guardrails>')).toBe(true);
    expect(composedRewrite.includes('<internal_linking_rules>')).toBe(true);
    expect(composedRewrite.includes('- "Existing Post" (slug: existing-post)')).toBe(true);
    expect(composedRewrite.includes('- Output must process ONLY content from this input chunk')).toBe(true);
  });

  it('RefinementPromptComposer generation', () => {
    const refineComposerIterative = new RefinementPromptComposer('iterative', mockProfile);
    const composedRefineIterative = refineComposerIterative.compose('xml');

    expect(composedRefineIterative.includes('<refinement_role_instructions type="iterative">')).toBe(true);
    expect(composedRefineIterative.includes('You are a senior TestBrand editor performing iterative refinement')).toBe(true);
    expect(composedRefineIterative.includes('<factual_refinement_guardrail>')).toBe(true);

    const refineComposerTargeted = new RefinementPromptComposer('targeted_fix', mockProfile);
    const composedRefineTargeted = refineComposerTargeted.compose('xml');
    expect(composedRefineTargeted.includes('You are a senior TestBrand editor performing one targeted text repair.')).toBe(true);
  });

  it('QualityGatePromptComposer generation', () => {
    const qualityComposer = new QualityGatePromptComposer(mockProfile);
    const composedQuality = qualityComposer.compose('xml');

    expect(composedQuality.includes('<quality_gate_role_instructions brand="TestBrand">')).toBe(true);
    expect(composedQuality.includes('You are the final TestBrand editorial quality gate.')).toBe(true);
    expect(composedQuality.includes('<output_format_contract>')).toBe(true);
    expect(composedQuality.includes('<temporal_context_rules>')).toBe(true);
  });

  it('StrategistPromptComposer generation', () => {
    const mockMeta = {
      category: 'Business',
      type: 'Analysis',
      targetAudience: 'Executives',
      targetLength: '1200 words'
    };
    const strategistDraftComposer = new StrategistPromptComposer(
      'draft',
      mockMeta,
      mockProfile,
      { draftMode: 'press_release' }
    );
    const composedDraft = strategistDraftComposer.compose('xml');

    expect(composedDraft.includes('<strategist_role_instructions type="draft">')).toBe(true);
    expect(composedDraft.includes('You are a writing co-pilot for TestBrand.')).toBe(true);
    expect(composedDraft.includes('<editorial_configuration>')).toBe(true);
    expect(composedDraft.includes('- Category: Business')).toBe(true);
    expect(composedDraft.includes('<press_release_rules>')).toBe(true);

    const strategistOutlineComposer = new StrategistPromptComposer('outline', mockMeta, mockProfile);
    const composedOutline = strategistOutlineComposer.compose('xml');

    expect(composedOutline.includes('<strategist_role_instructions type="outline">')).toBe(true);
    expect(composedOutline.includes('generate a structured, comprehensive article outline')).toBe(true);
  });

  it('StrategistChatComposer generation', () => {
    const chatComposer = new StrategistChatComposer(mockProfile);
    const composedChat = chatComposer.compose('xml');
    expect(composedChat.includes('<strategist_role>')).toBe(true);
    expect(composedChat.includes('<behavioral_anchors>')).toBe(true);
    expect(composedChat.includes('## General Constraints')).toBe(true);
    expect(composedChat.includes('Reasoning Scaffolding (CoT)')).toBe(false);
    expect(composedChat.includes('write down a brief mental analysis inside <thinking> tags')).toBe(false);
    expect(composedChat.includes('Response Discipline')).toBe(true);
  });

  it('StrategistBlueprintComposer generation', () => {
    const blueprintComposer = new StrategistBlueprintComposer(mockProfile);
    const composedBlueprint = blueprintComposer.compose('xml');
    expect(composedBlueprint.includes('<strategist_role>')).toBe(true);
    expect(composedBlueprint.includes('<instructions>')).toBe(true);
    expect(composedBlueprint.includes("Write a brief, conversational summary in the 'reply' field")).toBe(true);
  });

  it('DraftFromNotesComposer generation', () => {
    const draftFromNotesComposer = new DraftFromNotesComposer(mockProfile);
    const composedDraftFromNotes = draftFromNotesComposer.compose('xml');
    expect(composedDraftFromNotes.includes('<role>')).toBe(true);
    expect(composedDraftFromNotes.includes('You are an article writing specialist.')).toBe(true);
    expect(composedDraftFromNotes.includes('<cognitive_framework>')).toBe(true);
    expect(composedDraftFromNotes.includes('[PROHIBITED]')).toBe(true);
    expect(composedDraftFromNotes.includes('❌')).toBe(false);
    const selfCheckIdx = composedDraftFromNotes.indexOf('<self_check>');
    const writingSpecIdx = composedDraftFromNotes.indexOf('<writing_spec>');
    expect(selfCheckIdx < writingSpecIdx).toBe(true);
  });

  it('StrategistExamplesNode — runtime date injection', () => {
    const examplesNode = new StrategistExamplesNode();
    const todayDate = '2026-07-15';
    const renderedWithDate = examplesNode.render({ format: 'xml', today: todayDate });
    expect(renderedWithDate.includes(todayDate)).toBe(true);
    expect(renderedWithDate.includes('2026-07-07')).toBe(false);
    const renderedWithoutDate = examplesNode.render({ format: 'xml' });
    expect(renderedWithoutDate.includes('CURRENT_DATE')).toBe(true);
    expect(renderedWithDate.includes('negative_avoidance')).toBe(true);
  });

  it('StrategistGeneralConstraintsNode — no manual CoT, has Response Discipline', () => {
    const constraintsNode = new StrategistGeneralConstraintsNode();
    const renderedConstraints = constraintsNode.render({ format: 'xml' });
    expect(renderedConstraints.includes('Reasoning Scaffolding')).toBe(false);
    expect(renderedConstraints.includes('Response Discipline')).toBe(true);
  });

  it('StrategistFastModeInstructionNode', () => {
    const fastModeNode = new StrategistFastModeInstructionNode();
    const renderedFastMode = fastModeNode.render({ format: 'xml' });
    expect(renderedFastMode.includes('<instructions>')).toBe(true);
    expect(renderedFastMode.includes('FAST MODE')).toBe(true);
    expect(renderedFastMode.includes('[SUGGESTIONS:')).toBe(true);
    expect(fastModeNode.isStatic).toBe(true);
  });

  it('StrategistSystemRoleNode — behavioral anchors', () => {
    const roleNode = new StrategistSystemRoleNode();
    const renderedRole = roleNode.render({ format: 'xml' });
    expect(renderedRole.includes('<behavioral_anchors>')).toBe(true);
    expect(renderedRole.includes('<expertise>')).toBe(true);
  });
});
