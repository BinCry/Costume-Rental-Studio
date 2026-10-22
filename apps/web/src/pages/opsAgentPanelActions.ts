import type { OpsAgentCaseResult } from '../api/client';

export type OpsAgentPanelAction = 'claim' | 'release' | 'analyze' | 'prepare' | 'refresh';

export function opsAgentPanelActions(result?: OpsAgentCaseResult): OpsAgentPanelAction[] {
  if (!result) return [];
  const state = result.state.toUpperCase();
  const ownership = result.ownership ?? 'UNCLAIMED';
  const terminal = ['SUCCEEDED', 'INSUFFICIENT_DATA', 'HANDED_OFF', 'FAILED', 'CANCELLED'].includes(
    state,
  );
  if (terminal || !result.version) return ['refresh'];
  if (ownership === 'OTHER') return ['refresh'];
  if (ownership === 'UNCLAIMED') return ['claim', 'refresh'];

  if (state === 'NEW') return ['analyze', 'release', 'refresh'];
  if (state === 'MONITORING') return ['release', 'refresh'];
  if (state !== 'PLAN_READY') return ['refresh'];
  if (result.analysis?.status === 'STALE') return ['analyze', 'release', 'refresh'];

  const recommended = result.analysis?.options.find(
    (option) => option.optionId === result.analysis?.recommendedOptionId,
  );
  const executable = Boolean(
    result.analysis?.status === 'ACTIVE' &&
    result.analysis.outcome === 'READY' &&
    recommended?.feasible === true &&
    recommended.executable === true,
  );
  const overdue = result.finding?.ruleCode === 'RENTAL_RETURN_OVERDUE';
  return executable && !overdue ? ['prepare', 'release', 'refresh'] : ['release', 'refresh'];
}
