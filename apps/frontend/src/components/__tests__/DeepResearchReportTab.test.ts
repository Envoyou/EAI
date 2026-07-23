import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('Deep Research report workspace contract', () => {
  it('owns the report in a dedicated copilot tab instead of a transient modal', () => {
    const copilot = readSource('../AICopilotPanel.tsx');
    const strategist = readSource('../StrategistTab.tsx');

    expect(copilot).toContain("case 'deep_report'");
    expect(copilot).toContain('<DeepResearchReportTab');
    expect(strategist).not.toContain('showReportModal');
    expect(strategist).not.toContain('View Report');
  });

  it('keeps the report collection available when a new chat session starts', () => {
    const hook = readSource('../../lib/hooks/useContentStrategist.ts');
    const startNewChat = hook.match(
      /const startNewChat = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/
    )?.[1];

    expect(startNewChat).toBeDefined();
    expect(startNewChat).not.toContain('setDeepResearchReport(null)');
    expect(startNewChat).not.toContain('eai_strategist_deep_research_');
  });

  it('stores multiple reports with a bounded library and legacy migration', () => {
    const hook = readSource('../../lib/hooks/useContentStrategist.ts');

    expect(hook).toContain('MAX_DEEP_RESEARCH_REPORTS = 5');
    expect(hook).toContain('eai_strategist_deep_research_reports_');
    expect(hook).toContain('legacyReport');
    expect(hook).toContain('deepResearchReports.length >= MAX_DEEP_RESEARCH_REPORTS');
  });

  it('passes the selected saved report as context for its next follow-up', () => {
    const hook = readSource('../../lib/hooks/useContentStrategist.ts');

    expect(hook).toContain('prepareDeepResearchFollowUp');
    expect(hook).toContain("filename: 'deep-research-report.md'");
    expect(hook).toContain('extractedText: deepResearchFollowUpContent.slice(0, 250_000)');
  });

  it('applies report-card hover color to the full card surface', () => {
    const reportTab = readSource(
      '../strategist-tab/components/DeepResearchReportTab.tsx'
    );
    const strategistStyles = readSource(
      '../../app/styles/workspace/strategist.css'
    );

    expect(reportTab).toContain(
      'transition-colors hover:bg-[var(--surface-2)]'
    );
    expect(reportTab).toContain('strategist-report-card-action');
    expect(strategistStyles).toContain(
      '.strategist-report-card-action.ui-btn-muted:hover:not(:disabled)'
    );
    expect(strategistStyles).not.toMatch(
      /\.strategist-report-card-action[\s\S]*?!important/
    );
  });
});
