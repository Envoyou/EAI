import { Router } from 'express';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/middleware/auth';
import { getWorkspaceState } from '@/lib/user-workspace';
import { isOwnerUser } from '@eai/shared';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';

type StoredTelemetry = {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  retryCount?: number;
  fallbackCount?: number;
  failedCallCount?: number;
  estimatedCostUsd?: number;
  estimatedCostIdr?: number;
  pricingVersion?: string;
  stages?: unknown[];
};

const getTelemetry = (metadata: unknown): StoredTelemetry | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const system = (metadata as Record<string, unknown>)._system;
  if (!system || typeof system !== 'object') return null;
  const telemetry = (system as Record<string, unknown>).telemetry;
  if (!telemetry || typeof telemetry !== 'object') return null;
  const storedTelemetry = telemetry as StoredTelemetry;
  return Array.isArray(storedTelemetry.stages) && storedTelemetry.stages.length > 0
    ? storedTelemetry
    : null;
};

const finiteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const router = Router();

const getMetadataRecord = (metadata: unknown): Record<string, any> =>
  metadata && typeof metadata === 'object'
    ? (metadata as Record<string, any>)
    : {};

function getDateRanges(range: string, start?: string | null, end?: string | null) {
  const now = new Date();
  
  let endDate = new Date(now);
  let startDate = new Date(now);
  let prevEndDate = new Date(now);
  let prevStartDate = new Date(now);
  let hasComparison = true;

  endDate.setHours(23, 59, 59, 999);

  switch (range) {
    case '7d': {
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      prevEndDate.setTime(startDate.getTime() - 1);
      prevStartDate.setDate(startDate.getDate() - 7);
      prevStartDate.setHours(0, 0, 0, 0);
      break;
    }
    case '30d': {
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      prevEndDate.setTime(startDate.getTime() - 1);
      prevStartDate.setDate(startDate.getDate() - 30);
      prevStartDate.setHours(0, 0, 0, 0);
      break;
    }
    case '90d': {
      startDate.setDate(now.getDate() - 90);
      startDate.setHours(0, 0, 0, 0);
      prevEndDate.setTime(startDate.getTime() - 1);
      prevStartDate.setDate(startDate.getDate() - 90);
      prevStartDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'this-month': {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
    case 'last-month': {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
      prevEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
      break;
    }
    case 'custom': {
      if (start) {
        startDate = new Date(start);
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate.setDate(now.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
      }
      if (end) {
        endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
      }
      
      const durationMs = endDate.getTime() - startDate.getTime();
      prevEndDate.setTime(startDate.getTime() - 1);
      prevStartDate.setTime(startDate.getTime() - durationMs);
      break;
    }
    case 'all':
    default: {
      startDate = new Date(0);
      hasComparison = false;
      break;
    }
  }

  return {
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    hasComparison,
  };
}

// GET /api/analytics
router.get('/', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }

    const range = (req.query.range as string) || '30d';
    const customStart = req.query.startDate as string | undefined;
    const customEnd = req.query.endDate as string | undefined;

    const { startDate, endDate, prevStartDate, prevEndDate, hasComparison } = getDateRanges(range, customStart, customEnd);

    // Fetch only logs needed for the time period to calculate tenant metrics
    const logs = await prisma.analysisLog.findMany({
      where: range === 'all'
        ? {
            organizationId: workspace.organizationId,
          }
        : {
            organizationId: workspace.organizationId,
            createdAt: {
              gte: prevStartDate,
              lte: endDate,
            },
          },
      select: {
        id: true,
        createdAt: true,
        verdict: true,
        flags: true,
        editorStatus: true,
        userId: true,
        metadata: true,
        user: {
          select: {
            name: true,
            email: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' }
    });

    // Partition logs into current and previous periods
    let currentPeriodLogs = logs;
    let previousPeriodLogs: typeof logs = [];

    if (range !== 'all') {
      currentPeriodLogs = logs.filter(log => {
        const time = new Date(log.createdAt).getTime();
        return time >= startDate.getTime() && time <= endDate.getTime();
      });
      previousPeriodLogs = logs.filter(log => {
        const time = new Date(log.createdAt).getTime();
        return time >= prevStartDate.getTime() && time <= prevEndDate.getTime();
      });
    }

    // 1. Line Chart Data: Final-draft ready rate per day
    const readinessByDay: Record<string, { ready: number; count: number }> = {};
    
    // 2. Pie Chart Data: Final-draft readiness
    let ready = 0;
    let needsReview = 0;
    let blocked = 0;

    // 3. Bar Chart Data: Top Flags
    const flagCounts: Record<string, number> = {};

    currentPeriodLogs.forEach(log => {
      // Aggregate Date
      const dateKey = new Date(log.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      if (!readinessByDay[dateKey]) readinessByDay[dateKey] = { ready: 0, count: 0 };
      const normalizedReadiness =
        log.verdict === 'ready' || log.verdict === 'approve' ? 'ready' :
        log.verdict === 'needs_review' || log.verdict === 'revise' ? 'needs_review' :
        log.verdict === 'blocked' || log.verdict === 'reject' ? 'blocked' : null;
      if (normalizedReadiness) {
        readinessByDay[dateKey].count += 1;
        if (normalizedReadiness === 'ready') readinessByDay[dateKey].ready += 1;
      }

      if (normalizedReadiness === 'ready') ready++;
      else if (normalizedReadiness === 'needs_review') needsReview++;
      else if (normalizedReadiness === 'blocked') blocked++;

      // Aggregate Flags
      if (log.flags && Array.isArray(log.flags)) {
        log.flags.forEach(flag => {
          const flagStr = String(flag);
          flagCounts[flagStr] = (flagCounts[flagStr] || 0) + 1;
        });
      }
    });

    const trendData = Object.entries(readinessByDay).map(([date, data]) => ({
      date,
      readyRate: data.count > 0 ? Math.round((data.ready / data.count) * 100) : 0
    }));

    const verdictData = [
      { name: 'Ready', value: ready, fill: '#10b981' },
      { name: 'Needs Review', value: needsReview, fill: '#f59e0b' },
      { name: 'Blocked', value: blocked, fill: '#ef4444' }
    ].filter(v => v.value > 0);

    const flagsData = Object.entries(flagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Tenant-specific metrics calculations:
    
    // a) Drafts processed in selected period
    const draftsThisMonth = currentPeriodLogs.length;

    // b) Avg articles per user
    const uniqueUsers = new Set(currentPeriodLogs.map(log => log.userId).filter(Boolean)).size;
    const avgArticlesPerUser = uniqueUsers > 0 ? Math.round(currentPeriodLogs.length / uniqueUsers) : currentPeriodLogs.length;

    // c) Completion / Polished rate
    const completedDraftsCount = currentPeriodLogs.filter(log => log.editorStatus === 'refined' || log.editorStatus === 'exported').length;
    const polishedRate = currentPeriodLogs.length > 0 ? Math.round((completedDraftsCount / currentPeriodLogs.length) * 100) : 0;

    // d) Voice match rate (POV Match) & grouping
    const logsBySourceRef: Record<string, typeof currentPeriodLogs> = {};
    currentPeriodLogs.forEach(log => {
      const meta = getMetadataRecord(log.metadata);
      const sourceRef = typeof meta.sourceRef === 'string' ? meta.sourceRef : log.id;
      if (!logsBySourceRef[sourceRef]) {
        logsBySourceRef[sourceRef] = [];
      }
      logsBySourceRef[sourceRef].push(log);
    });

    let exportedGroups = 0;
    let directExportGroups = 0;

    Object.values(logsBySourceRef).forEach(group => {
      const hasBeenExported = group.some(log => log.editorStatus === 'exported');
      if (hasBeenExported) {
        exportedGroups++;
        if (group.length === 1) {
          directExportGroups++;
        }
      }
    });

    const povMatchRate = exportedGroups > 0 ? Math.round((directExportGroups / exportedGroups) * 100) : 0;

    const totalVerdicts = ready + needsReview + blocked;
    const editorAcceptanceRate = totalVerdicts > 0 ? Math.round((ready / totalVerdicts) * 100) : 0;

    // e) SEO pack completion
    const logsWithSeo = currentPeriodLogs.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      const generatedMetadata = getMetadataRecord(meta.generatedMetadata);
      return Boolean(generatedMetadata.title || generatedMetadata.metaTitle);
    }).length;
    const seoCompletionRate = currentPeriodLogs.length > 0 ? Math.round((logsWithSeo / currentPeriodLogs.length) * 100) : 0;

    // f) CMS directly publishable rate
    const publishedLogs = currentPeriodLogs.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      return meta.publishStatus === 'published';
    });
    const directlyPublishableLogs = publishedLogs.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      return typeof meta.aiRetentionRate === 'number' && meta.aiRetentionRate >= 90;
    });
    const publishableRate = publishedLogs.length > 0
      ? Math.round((directlyPublishableLogs.length / publishedLogs.length) * 100)
      : 0;

    // g) CMS export success rate
    const totalExports = currentPeriodLogs.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      return Boolean(meta.exportStatus);
    });
    const successExports = totalExports.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      const exportStatus = getMetadataRecord(meta.exportStatus);
      return exportStatus.lastExportStatus === 'success';
    });
    const cmsExportSuccessRate = totalExports.length > 0 
      ? Math.round((successExports.length / totalExports.length) * 100) 
      : 0;

    // Weekly/Monthly comparison
    let periodComparison = null;
    if (hasComparison) {
      const totalLogsChange = previousPeriodLogs.length > 0
        ? Math.round(((currentPeriodLogs.length - previousPeriodLogs.length) / previousPeriodLogs.length) * 100)
        : 0;

      const getReadyRate = (periodLogs: typeof logs) => {
        let r = 0;
        let count = 0;
        periodLogs.forEach(log => {
          const normalizedReadiness =
            log.verdict === 'ready' || log.verdict === 'approve' ? 'ready' :
            log.verdict === 'needs_review' || log.verdict === 'revise' ? 'needs_review' :
            log.verdict === 'blocked' || log.verdict === 'reject' ? 'blocked' : null;
          if (normalizedReadiness) {
            count++;
            if (normalizedReadiness === 'ready') r++;
          }
        });
        return count > 0 ? Math.round((r / count) * 100) : 0;
      };

      const currentReadyRate = getReadyRate(currentPeriodLogs);
      const previousReadyRate = getReadyRate(previousPeriodLogs);
      const readyRateChange = currentReadyRate - previousReadyRate;

      const getFlagsCount = (periodLogs: typeof logs) => {
        let fCount = 0;
        periodLogs.forEach(log => {
          if (log.flags && Array.isArray(log.flags)) {
            fCount += log.flags.length;
          }
        });
        return fCount;
      };

      const currentFlagsCount = getFlagsCount(currentPeriodLogs);
      const previousFlagsCount = getFlagsCount(previousPeriodLogs);
      const flagsChange = previousFlagsCount > 0
        ? Math.round(((currentFlagsCount - previousFlagsCount) / previousFlagsCount) * 100)
        : 0;

      periodComparison = {
        totalLogsChange,
        readyRateChange,
        flagsChange,
      };
    }

    // Avg revisions per article
    const articleGroups = Object.values(logsBySourceRef);
    const avgRevisionsPerArticle = articleGroups.length > 0
      ? Number((currentPeriodLogs.length / articleGroups.length).toFixed(1))
      : 1.0;

    // Time-to-publish
    const publishTimes: number[] = [];
    articleGroups.forEach(group => {
      const sortedGroup = [...group].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const firstLog = sortedGroup[0];
      const exportedLog = sortedGroup.find(log => log.editorStatus === 'exported');
      if (exportedLog) {
        const durationMs = new Date(exportedLog.createdAt).getTime() - new Date(firstLog.createdAt).getTime();
        const durationMin = durationMs / (1000 * 60);
        publishTimes.push(durationMin);
      }
    });
    const avgTimeToPublish = publishTimes.length > 0
      ? Math.round(publishTimes.reduce((a, b) => a + b, 0) / publishTimes.length)
      : 0;

    // Category breakdown
    const categoryCounts: Record<string, number> = {};
    currentPeriodLogs.forEach(log => {
      const meta = getMetadataRecord(log.metadata);
      const category = typeof meta.category === 'string' && meta.category.trim()
        ? meta.category.trim()
        : 'Uncategorized';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    const categoryBreakdown = Object.entries(categoryCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Per-user breakdown
    const userMetrics: Record<string, {
      userId: string;
      name: string;
      email: string;
      imageUrl: string;
      logsCount: number;
      readyCount: number;
      verdictCount: number;
    }> = {};

    currentPeriodLogs.forEach(log => {
      const uId = log.userId;
      if (!uId) return;
      if (!userMetrics[uId]) {
        userMetrics[uId] = {
          userId: uId,
          name: log.user?.name || 'Unknown User',
          email: log.user?.email || '',
          imageUrl: log.user?.imageUrl || '',
          logsCount: 0,
          readyCount: 0,
          verdictCount: 0,
        };
      }
      const metrics = userMetrics[uId];
      metrics.logsCount++;

      const normalizedReadiness =
        log.verdict === 'ready' || log.verdict === 'approve' ? 'ready' :
        log.verdict === 'needs_review' || log.verdict === 'revise' ? 'needs_review' :
        log.verdict === 'blocked' || log.verdict === 'reject' ? 'blocked' : null;
      if (normalizedReadiness) {
        metrics.verdictCount++;
        if (normalizedReadiness === 'ready') {
          metrics.readyCount++;
        }
      }
    });

    const userRevisionsMap: Record<string, number[]> = {};
    articleGroups.forEach(group => {
      const revisionCount = group.length;
      const userIdsInGroup = new Set(group.map(l => l.userId).filter(Boolean) as string[]);
      userIdsInGroup.forEach(uId => {
        if (!userRevisionsMap[uId]) userRevisionsMap[uId] = [];
        userRevisionsMap[uId].push(revisionCount);
      });
    });

    const userBreakdown = Object.entries(userMetrics).map(([uId, metrics]) => {
      const revs = userRevisionsMap[uId] || [];
      const avgRevisions = revs.length > 0 ? Number((revs.reduce((a, b) => a + b, 0) / revs.length).toFixed(1)) : 1.0;
      return {
        userId: uId,
        name: metrics.name,
        email: metrics.email,
        imageUrl: metrics.imageUrl,
        logsCount: metrics.logsCount,
        readyRate: metrics.verdictCount > 0 ? Math.round((metrics.readyCount / metrics.verdictCount) * 100) : 0,
        avgRevisions
      };
    }).sort((a, b) => b.logsCount - a.logsCount);

    return res.json({
      totalLogs: currentPeriodLogs.length,
      readyRate: editorAcceptanceRate,
      trendData,
      verdictData,
      flagsData,
      draftsThisMonth,
      polishedRate,
      seoCompletionRate,
      povMatchRate,
      publishableRate,
      cmsExportSuccessRate,
      avgArticlesPerUser,
      userBreakdown,
      avgTimeToPublish,
      avgRevisionsPerArticle,
      categoryBreakdown,
      periodComparison
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// GET /api/analytics/validation
router.get('/validation', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    if (!isOwnerUser(userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }

    const isDemo = req.query.demo === 'true';

    // Fetch all logs to calculate metrics
    const logs = await prisma.analysisLog.findMany({
      where: {
        organizationId: workspace.organizationId,
      },
      orderBy: { createdAt: 'asc' }
    });

    let ready = 0;
    let needsReview = 0;
    let blocked = 0;

    logs.forEach(log => {
      const normalizedReadiness =
        log.verdict === 'ready' || log.verdict === 'approve' ? 'ready' :
        log.verdict === 'needs_review' || log.verdict === 'revise' ? 'needs_review' :
        log.verdict === 'blocked' || log.verdict === 'reject' ? 'blocked' : null;

      if (normalizedReadiness === 'ready') ready++;
      else if (normalizedReadiness === 'needs_review') needsReview++;
      else if (normalizedReadiness === 'blocked') blocked++;
    });

    // a) Product Usage
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const draftsThisMonthRaw = logs.filter(log => new Date(log.createdAt) >= thirtyDaysAgo).length;
    const draftsThisMonth = isDemo ? Math.max(draftsThisMonthRaw, 120) : draftsThisMonthRaw;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUserIds = new Set(
      logs
        .filter(log => new Date(log.createdAt) >= sevenDaysAgo && log.userId)
        .map(log => log.userId)
    );
    const wauInternal = isDemo ? Math.max(activeUserIds.size, 8) : activeUserIds.size;

    const uniqueUsers = new Set(logs.map(log => log.userId).filter(Boolean)).size;
    const avgArticlesPerUser = uniqueUsers > 0 ? Math.round(logs.length / uniqueUsers) : logs.length;

    const completedDraftsCount = logs.filter(log => log.editorStatus === 'refined' || log.editorStatus === 'exported').length;
    const polishedRatio = logs.length > 0 ? Math.round((completedDraftsCount / logs.length) * 100) : 0;

    // b) Output Quality & POV Match Calculations
    const logsBySourceRef: Record<string, typeof logs> = {};
    logs.forEach(log => {
      const meta = getMetadataRecord(log.metadata);
      const sourceRef = typeof meta.sourceRef === 'string' ? meta.sourceRef : log.id;
      if (!logsBySourceRef[sourceRef]) {
        logsBySourceRef[sourceRef] = [];
      }
      logsBySourceRef[sourceRef].push(log);
    });

    let exportedGroups = 0;
    let directExportGroups = 0;

    Object.values(logsBySourceRef).forEach(group => {
      const hasBeenExported = group.some(log => log.editorStatus === 'exported');
      if (hasBeenExported) {
        exportedGroups++;
        if (group.length === 1) {
          directExportGroups++;
        }
      }
    });

    const povMatchRate = exportedGroups > 0 ? Math.round((directExportGroups / exportedGroups) * 100) : 0;

    const totalVerdicts = ready + needsReview + blocked;
    const editorAcceptanceRate = totalVerdicts > 0 ? Math.round((ready / totalVerdicts) * 100) : 0;

    const logsWithSeo = logs.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      const generatedMetadata = getMetadataRecord(meta.generatedMetadata);
      return Boolean(generatedMetadata.title || generatedMetadata.metaTitle);
    }).length;
    const seoPackCompletionRate = logs.length > 0 ? Math.round((logsWithSeo / logs.length) * 100) : 0;

    // Calculate CMS Directly Publishable Rate
    const publishedLogs = logs.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      return meta.publishStatus === 'published';
    });
    const directlyPublishableLogs = publishedLogs.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      return typeof meta.aiRetentionRate === 'number' && meta.aiRetentionRate >= 90;
    });
    const directlyPublishableRate = publishedLogs.length > 0
      ? Math.round((directlyPublishableLogs.length / publishedLogs.length) * 100)
      : 0;

    // c) Efficiency Gain — only use provider-reported token telemetry.
    const telemetryEntries = logs
      .map(log => getTelemetry(log.metadata))
      .filter((entry): entry is StoredTelemetry => entry !== null);
    const telemetryCoverage = logs.length > 0
      ? Math.round((telemetryEntries.length / logs.length) * 100)
      : 0;
    const totalEstimatedCostIdr = telemetryEntries.reduce(
      (sum, entry) => sum + finiteNumber(entry.estimatedCostIdr),
      0
    );
    const totalEstimatedCostUsd = telemetryEntries.reduce(
      (sum, entry) => sum + finiteNumber(entry.estimatedCostUsd),
      0
    );
    const completedTelemetryCount = logs.filter(log =>
      (log.editorStatus === 'refined' || log.editorStatus === 'exported') &&
      getTelemetry(log.metadata) !== null
    ).length;
    const costPerOutputUsd = completedTelemetryCount > 0
      ? totalEstimatedCostUsd / completedTelemetryCount
      : (telemetryEntries.length > 0 ? totalEstimatedCostUsd / telemetryEntries.length : 0);
    const avgProcessTimeMinutes = telemetryEntries.length > 0
      ? Math.round(
          telemetryEntries.reduce(
            (sum, entry) => sum + finiteNumber(entry.durationMs),
            0
          ) /
          telemetryEntries.length /
          600
        ) / 100
      : 0;
    const outputsWithRetryOrFallback = telemetryEntries.filter(entry =>
      finiteNumber(entry.retryCount) > 0 ||
      finiteNumber(entry.fallbackCount) > 0 ||
      finiteNumber(entry.failedCallCount) > 0
    ).length;
    const errorFallbackRate = telemetryEntries.length > 0
      ? Math.round((outputsWithRetryOrFallback / telemetryEntries.length) * 1000) / 10
      : 0;
    const totalInputTokens = telemetryEntries.reduce(
      (sum, entry) => sum + finiteNumber(entry.inputTokens),
      0
    );
    const totalOutputTokens = telemetryEntries.reduce(
      (sum, entry) => sum + finiteNumber(entry.outputTokens),
      0
    );

    // d) Commercial Readiness
    const totalExports = logs.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      return Boolean(meta.exportStatus);
    });
    const successExports = totalExports.filter(log => {
      const meta = getMetadataRecord(log.metadata);
      const exportStatus = getMetadataRecord(meta.exportStatus);
      return exportStatus.lastExportStatus === 'success';
    });
    const cmsExportSuccessRate = totalExports.length > 0 
      ? Math.round((successExports.length / totalExports.length) * 100) 
      : 0;

    return res.json({
      totalLogs: isDemo ? Math.max(logs.length, 65) : logs.length,
      readyRate: isDemo ? 84 : editorAcceptanceRate,
      telemetrySummary: {
        trackedOutputs: telemetryEntries.length,
        coveragePercentage: telemetryCoverage,
        totalInputTokens,
        totalOutputTokens,
        totalEstimatedCostIdr: Math.round(totalEstimatedCostIdr),
        pricingVersions: Array.from(new Set(
          telemetryEntries
            .map(entry => entry.pricingVersion)
            .filter((version): version is string => Boolean(version))
        )),
      },
      validationReport: {
        productUsage: {
          draftsProcessedMonth: { current: draftsThisMonth, target: 300, label: "Draft processed / month" },
          wauInternal: { current: wauInternal, target: 15, label: "WAU internal" },
          avgArticlesPerUser: { current: isDemo ? Math.max(avgArticlesPerUser, 15) : avgArticlesPerUser, target: 25, label: "Avg. articles per user" },
          draftPolishedPercentage: { current: isDemo ? Math.max(polishedRatio, 75) : polishedRatio, target: 90, label: "% draft finished/polished" },
          avgTimeFromRoughToFinal: { current: isDemo ? 12 : avgProcessTimeMinutes, target: 8, label: "Avg. process time (mins)", isDuration: true, coverage: isDemo ? 100 : telemetryCoverage }
        },
        outputQuality: {
          editorAcceptanceRate: { current: totalVerdicts > 0 ? (isDemo ? Math.max(editorAcceptanceRate, 72) : editorAcceptanceRate) : (isDemo ? 72 : 0), target: 85, label: "Final draft ready rate", isPercentage: true },
          seoPackCompletion: { current: logs.length > 0 ? (isDemo ? Math.max(seoPackCompletionRate, 94) : seoPackCompletionRate) : (isDemo ? 94 : 0), target: 98, label: "SEO pack completion", isPercentage: true },
          finalDraftPovMatch: { current: isDemo ? Math.max(povMatchRate, 78) : povMatchRate, target: 80, label: "AI refinement POV match rate", isPercentage: true },
          directlyPublishable: { current: isDemo ? Math.max(directlyPublishableRate, 68) : directlyPublishableRate, target: 80, label: "CMS directly publishable rate", isPercentage: true },
          manualRevisionRate: { current: isDemo ? 22 : (totalVerdicts > 0 ? Math.round(((needsReview + blocked) / totalVerdicts) * 100) : 0), target: 10, label: "Needs review / blocked rate", isPercentage: true, isReverse: true },
          errorFallbackRate: { current: isDemo ? 2 : errorFallbackRate, target: 0.5, label: "API retry/fallback output rate", isPercentage: true, isReverse: true, coverage: isDemo ? 100 : telemetryCoverage }
        },
        efficiencyGain: {
          minutesSaved: { current: isDemo ? 18 : 0, target: 25, label: "Minutes saved per article", isDuration: true },
          laborCostSaved: { current: isDemo ? 3500000 : 0, target: 8000000, label: "Labor cost saved / month", isCurrency: true },
          costPerOutput: { current: isDemo ? (costPerOutputUsd > 0 ? costPerOutputUsd : 0.06) : costPerOutputUsd, target: 0.50, label: "Estimated API cost per output", isCurrency: true, isUsd: true, isReverse: true, isEstimated: true, coverage: isDemo ? 100 : telemetryCoverage },
          grossMarginEstimate: { current: isDemo ? 75 : 0, target: 85, label: "Gross margin estimate", isPercentage: true },
          burnMultiple: { current: isDemo ? 1.8 : 0, target: 1.2, label: "Burn multiple estimation", isReverse: true }
        },
        commercialReadiness: {
          pilotCustomers: { current: isDemo ? 3 : 0, target: 10, label: "Pilot customers contacted" },
          designPartners: { current: 0, target: 5, label: "Active design partners" },
          cmsExportSuccess: { current: totalExports.length > 0 ? (isDemo ? Math.max(cmsExportSuccessRate, 91) : cmsExportSuccessRate) : (isDemo ? cmsExportSuccessRate : 0), target: 98, label: "Export success rate to CMS", isPercentage: true },
          multiUserReadiness: { current: 100, target: 100, label: "Multi-user readiness (Clerk)", isPercentage: true },
          paidConversionPipeline: { current: isDemo ? 2 : 0, target: 8, label: "Paid conversion pipeline (leads)" }
        }
      }
    });
  } catch (error) {
    console.error('Validation analytics error:', error);
    return res.status(500).json({ error: 'Failed to fetch validation analytics data' });
  }
});

const secretsMatch = (expected: string, received: string) => {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

// Helper to calculate word-level edit distance and return similarity percentage
function calculateWordSimilarity(textA: string, textB: string): number {
  const clean = (txt: string) => txt.replace(/[#*_\-`[\]()]/g, ' ').toLowerCase().match(/\b\w+\b/g) || [];
  
  const wordsA = clean(textA);
  const wordsB = clean(textB);
  
  if (wordsA.length === 0 && wordsB.length === 0) return 100;
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const m = wordsA.length;
  const n = wordsB.length;
  
  let prevRow = Array.from({ length: n + 1 }, (_, i) => i);
  const currRow = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = wordsA[i - 1] === wordsB[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,       // deletion
        currRow[j - 1] + 1,   // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    prevRow = [...currRow];
  }

  const distance = prevRow[n];
  const maxLength = Math.max(m, n);
  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.round(similarity * 10) / 10;
}

// POST /api/analytics/webhook
router.post('/webhook', async (req, res) => {
  try {
    const expectedSecret = process.env.BLOG_IMPORT_SHARED_SECRET;
    const providedSecret = (req.headers['x-eai-secret'] as string) || '';

    if (!expectedSecret) {
      console.error('Publish webhook secret is not configured.');
      return res.status(500).json({ error: 'Webhook secret is not configured' });
    }

    if (!providedSecret || !secretsMatch(expectedSecret, providedSecret)) {
      return res.status(401).json({ error: 'Unauthorized webhook request' });
    }

    const { sourceRef, publishedContent } = req.body;

    if (!sourceRef || typeof publishedContent !== 'string') {
      return res.status(400).json({ error: 'Missing sourceRef or publishedContent' });
    }

    // Find all logs with this sourceRef
    const logs = await prisma.analysisLog.findMany({
      where: {
        metadata: {
          path: ['sourceRef'],
          equals: sourceRef
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (logs.length === 0) {
      return res.status(404).json({ error: 'No logs found with this sourceRef' });
    }

    const latestLog = logs[0];
    const meta = latestLog.metadata && typeof latestLog.metadata === 'object'
      ? latestLog.metadata as Record<string, unknown>
      : {};
    const systemMetadata = meta._system && typeof meta._system === 'object'
      ? meta._system as Record<string, unknown>
      : {};
    const polishedDraft = typeof systemMetadata.polishedDraft === 'string'
      ? systemMetadata.polishedDraft
      : latestLog.content || '';

    // Calculate AI Retention Rate
    const retentionRate = calculateWordSimilarity(polishedDraft, publishedContent);

    // Update log metadata
    const updatedMetadata = {
      ...meta,
      publishStatus: 'published',
      publishedAt: new Date().toISOString(),
      aiRetentionRate: retentionRate,
      publishedContentLength: publishedContent.length
    };

    await prisma.analysisLog.update({
      where: { id: latestLog.id },
      data: {
        metadata: updatedMetadata as Prisma.InputJsonValue
      }
    });

    return res.json({
      success: true,
      message: 'Publish callback recorded successfully',
      sourceRef,
      aiRetentionRate: retentionRate
    });

  } catch (error) {
    console.error('Webhook callback error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
