import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readFrontend = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Content Memory controlled enforcement UI', () => {
  it('offers override only from the backend enforcement contract', () => {
    const strategist = readFrontend(
      'src/lib/hooks/useContentStrategist.ts'
    );
    const notesAction = readFrontend(
      'src/workspace/actions/strategist.ts'
    );

    expect(strategist).toContain(
      'conflict?.duplicateGuard?.enforcement?.overrideAllowed'
    );
    expect(strategist).toContain(
      'result?.duplicateGuard?.enforcement?.overrideAllowed'
    );
    expect(notesAction).toContain(
      'conflict?.duplicateGuard?.enforcement?.overrideAllowed'
    );
    expect(strategist).not.toContain(
      'confidence >= CONTENT_MEMORY'
    );
  });

  it('collects localized explicit labels after shadow or override flows', () => {
    const strategist = readFrontend(
      'src/lib/hooks/useContentStrategist.ts'
    );
    const feedback = readFrontend(
      'src/lib/content-memory-feedback.ts'
    );
    const english = JSON.parse(
      readFrontend('messages/en.json')
    ) as Record<string, Record<string, string>>;
    const indonesian = JSON.parse(
      readFrontend('messages/id.json')
    ) as Record<string, Record<string, string>>;

    expect(strategist).toContain(
      "enforcement?.mode === 'shadow'"
    );
    expect(feedback).toContain(
      "'/api/content-memory/feedback'"
    );
    expect(english.ContentMemory.feedbackQuestion).toBeTruthy();
    expect(indonesian.ContentMemory.feedbackQuestion).toBeTruthy();
  });
});
