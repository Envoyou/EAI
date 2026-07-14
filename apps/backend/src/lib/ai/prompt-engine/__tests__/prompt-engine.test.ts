import { CompositePromptNode, PromptNode, RenderContext } from '@eai/shared';
import { SeoPromptComposer } from '../composer/seo-composer';
import { ReviewPromptComposer } from '../composer/review-composer';
import { RewritePromptComposer } from '../composer/rewrite-composer';
import { RefinementPromptComposer } from '../composer/refinement-composer';
import { QualityGatePromptComposer } from '../composer/quality-gate-composer';

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

console.log('✅ All prompt engine unit tests passed successfully!');
