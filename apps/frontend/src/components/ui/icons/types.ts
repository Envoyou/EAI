import type React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * A tree-shakeable icon component exported under a feature-oriented name.
 * Tokens stay as static component references instead of runtime string lookups.
 */
export type SemanticIconToken = LucideIcon | React.ComponentType<{ className?: string }>;

