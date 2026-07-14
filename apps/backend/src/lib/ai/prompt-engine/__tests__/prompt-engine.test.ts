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

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

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

console.log('Running prompt engine unit tests...');

// Test Case 1: CompositePromptNode ordering (Static first, Dynamic last)
const composite = new CompositePromptNode('test_composite');
composite.addChild(new MockDynamicNode());
composite.addChild(new MockStaticNode());

const renderedText = composite.render({ format: 'text' });
assert(
  renderedText.startsWith('Static Instruction'),
  'CompositePromptNode should place static instructions first'
);
assert(
  renderedText.includes('Dynamic Instruction'),
  'CompositePromptNode should include dynamic instructions'
);

// Test Case 2: XML format serialization
const renderedXml = composite.render({ format: 'xml' });
assert(
  renderedXml.includes('<!-- DYNAMIC CONTEXT & CONSTRAINTS -->'),
  'XML render should include DYNAMIC separator tag'
);

// Test Case 3: SeoPromptComposer generation
const mockProfile = {
  brandName: 'TestBrand',
  positioning: 'Leading test positioning.',
  categories: ['Tech', 'Science'],
  audience: 'Testers',
  tone: ['precise'],
  articleStructure: ['Intro', 'Outro'],
  additionalProhibitedPatterns: ['in today\'s era'],
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

const composer = new SeoPromptComposer(mockProfile);
const composedPrompt = composer.compose('xml');

assert(
  composedPrompt.includes('<editorial_mission>'),
  'Composed prompt must contain editorial mission block'
);
assert(
  composedPrompt.includes('<seo_specialist_role>'),
  'Composed prompt must contain SEO specialist role block'
);
assert(
  composedPrompt.includes('<brand_identity>'),
  'Composed prompt must contain tenant brand identity block'
);
assert(
  composedPrompt.includes('<brand_name>TestBrand</brand_name>'),
  'Composed prompt must contain correct brand name'
);
assert(
  composedPrompt.includes('<tone_calibration>'),
  'Composed prompt must contain tone calibration block'
);

// Test Case 4: ReviewPromptComposer generation
const reviewComposerAuthor = new ReviewPromptComposer('author', mockProfile);
const composedAuthor = reviewComposerAuthor.compose('xml');

assert(
  composedAuthor.includes('<role_instructions>'),
  'Review author prompt must contain role instructions'
);
assert(
  composedAuthor.includes('YOUR ROLE: Writing Co-Pilot'),
  'Review author prompt must contain specific role instructions content'
);
assert(
  composedAuthor.includes('<output_format_contract>'),
  'Review author prompt must contain format contract'
);
assert(
  composedAuthor.includes('<temporal_context_rules>'),
  'Review author prompt must contain temporal context rules'
);
assert(
  composedAuthor.includes('<source_policy>'),
  'Review author prompt must contain source policy'
);

const reviewComposerPolish = new ReviewPromptComposer('polish', mockProfile);
const composedPolish = reviewComposerPolish.compose('xml');
assert(
  composedPolish.includes('YOUR ROLE: Draft Transformation Editor'),
  'Review polish prompt must contain polish role instructions'
);

// Test Case 5: RewritePromptComposer generation
const rewriteComposer = new RewritePromptComposer(mockProfile, {
  isChunkMode: true,
  publishedPosts: [{ title: 'Existing Post', slug: 'existing-post' }]
});
const composedRewrite = rewriteComposer.compose('xml');

assert(
  composedRewrite.includes('<rewrite_role_instructions brand="TestBrand">'),
  'Rewrite prompt must contain role instructions'
);
assert(
  composedRewrite.includes('You are a senior TestBrand editor'),
  'Rewrite prompt must contain specific editor role message'
);
assert(
  composedRewrite.includes('<rewrite_few_shot_demonstration>'),
  'Rewrite prompt must contain few-shot demo'
);
assert(
  composedRewrite.includes('<rewrite_priorities_and_guardrails>'),
  'Rewrite prompt must contain priorities and guardrails'
);
assert(
  composedRewrite.includes('<internal_linking_rules>'),
  'Rewrite prompt must contain internal linking rules'
);
assert(
  composedRewrite.includes('- "Existing Post" (slug: existing-post)'),
  'Rewrite prompt must contain correct internal link data'
);
assert(
  composedRewrite.includes('- Output must process ONLY content from this input chunk'),
  'Rewrite prompt must reflect chunk mode rules'
);

// Test Case 6: RefinementPromptComposer generation
const refineComposerIterative = new RefinementPromptComposer('iterative', mockProfile);
const composedRefineIterative = refineComposerIterative.compose('xml');

assert(
  composedRefineIterative.includes('<refinement_role_instructions type="iterative">'),
  'Refinement prompt must contain role instructions'
);
assert(
  composedRefineIterative.includes('You are a senior TestBrand editor performing iterative refinement'),
  'Refinement prompt must contain specific editor role message'
);
assert(
  composedRefineIterative.includes('<factual_refinement_guardrail>'),
  'Refinement prompt must contain factual refinement guardrail'
);

const refineComposerTargeted = new RefinementPromptComposer('targeted_fix', mockProfile);
const composedRefineTargeted = refineComposerTargeted.compose('xml');
assert(
  composedRefineTargeted.includes('You are a senior TestBrand editor performing one targeted text repair.'),
  'Refinement prompt must contain targeted fix role instructions'
);

// Test Case 7: QualityGatePromptComposer generation
const qualityComposer = new QualityGatePromptComposer(mockProfile);
const composedQuality = qualityComposer.compose('xml');

assert(
  composedQuality.includes('<quality_gate_role_instructions brand="TestBrand">'),
  'Quality gate prompt must contain role instructions'
);
assert(
  composedQuality.includes('You are the final TestBrand editorial quality gate.'),
  'Quality gate prompt must contain specific quality gate message'
);
assert(
  composedQuality.includes('<output_format_contract>'),
  'Quality gate prompt must contain output format contract'
);
assert(
  composedQuality.includes('<temporal_context_rules>'),
  'Quality gate prompt must contain temporal context rules'
);

// Test Case 8: StrategistPromptComposer generation
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

assert(
  composedDraft.includes('<strategist_role_instructions type="draft">'),
  'Strategist draft prompt must contain role instructions'
);
assert(
  composedDraft.includes('You are a writing co-pilot for TestBrand.'),
  'Strategist draft prompt must contain correct brand co-pilot message'
);
assert(
  composedDraft.includes('<editorial_configuration>'),
  'Strategist draft prompt must contain configuration block'
);
assert(
  composedDraft.includes('- Category: Business'),
  'Strategist draft prompt must reflect correct category metadata'
);
assert(
  composedDraft.includes('<press_release_rules>'),
  'Strategist draft prompt must contain press release rules under press release mode'
);

const strategistOutlineComposer = new StrategistPromptComposer('outline', mockMeta, mockProfile);
const composedOutline = strategistOutlineComposer.compose('xml');

assert(
  composedOutline.includes('<strategist_role_instructions type="outline">'),
  'Strategist outline prompt must contain outline role instructions'
);
assert(
  composedOutline.includes('generate a structured, comprehensive article outline'),
  'Strategist outline prompt must contain outline instructions text'
);

// Test Case 9: StrategistChatComposer generation
const chatComposer = new StrategistChatComposer(mockProfile);
const composedChat = chatComposer.compose('xml');
assert(
  composedChat.includes('<strategist_role>'),
  'Strategist chat prompt must contain role tag'
);
assert(
  composedChat.includes('You are a Senior Content Strategist and SEO Editorial Specialist.'),
  'Strategist chat prompt must contain role instructions'
);
assert(
  composedChat.includes('## General Constraints'),
  'Strategist chat prompt must contain constraints'
);

// Test Case 10: StrategistBlueprintComposer generation
const blueprintComposer = new StrategistBlueprintComposer(mockProfile);
const composedBlueprint = blueprintComposer.compose('xml');
assert(
  composedBlueprint.includes('<strategist_role>'),
  'Blueprint prompt must contain role tag'
);
assert(
  composedBlueprint.includes('<instructions>'),
  'Blueprint prompt must contain instructions tag'
);
assert(
  composedBlueprint.includes('Write a brief, conversational summary in the \'reply\' field'),
  'Blueprint prompt must contain blueprint instructions'
);

// Test Case 11: DraftFromNotesComposer generation
const draftFromNotesComposer = new DraftFromNotesComposer(mockProfile);
const composedDraftFromNotes = draftFromNotesComposer.compose('xml');
assert(
  composedDraftFromNotes.includes('<role>'),
  'Draft from notes prompt must contain role tag'
);
assert(
  composedDraftFromNotes.includes('You are an article writing specialist.'),
  'Draft from notes prompt must contain writing specialist role'
);
assert(
  composedDraftFromNotes.includes('<cognitive_framework>'),
  'Draft from notes prompt must contain cognitive framework'
);

console.log('✅ All prompt engine unit tests passed successfully!');
