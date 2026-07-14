import { CompositePromptNode, PromptNode, RenderContext } from '@eai/shared';
import { SeoPromptComposer } from '../composer/seo-composer';
import { ReviewPromptComposer } from '../composer/review-composer';

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

console.log('✅ All prompt engine unit tests passed successfully!');
