const { describe, expect, it } = globalThis;

const { ApiClientError, opsAgentActionOutcomeUnknown } = await import('../src/api/client.ts');
const {
  canContinueOpsAgentCase,
  isOpsAgentCaseTerminal,
  opsAgentCaseIdForNextMessage,
  nextOpsAgentTabIndex,
  opsAgentActionFocusTarget,
  opsAgentErrorMessage,
  opsAgentEvidenceLabel,
  opsAgentCaseStorageKey,
  opsAgentSendRecovery,
  opsKnowledgeAnswerText,
  requiresOpsAgentStateReview,
} = await import('../src/pages/OpsAgentPage.tsx');
const { opsAgentWorkflowSteps } = await import('../src/pages/OpsAgentCasesPanel.tsx');
const { opsAgentPanelActions } = await import('../src/pages/opsAgentPanelActions.ts');

const baseCase = (state, overrides = {}) => ({
  caseId: 'case-1',
  state,
  message: 'Kết quả kiểm tra',
  evidence: [],
  completed: false,
  ...overrides,
});

describe('Ops Agent safe state and recovery behavior', () => {
  it('exposes only the action allowed by ownership and persisted case state', () => {
    const unclaimed = baseCase('NEW', { version: 1, ownership: 'UNCLAIMED' });
    const claimed = baseCase('NEW', { version: 2, ownership: 'MINE' });
    const ownedByOther = baseCase('NEW', { version: 1, ownership: 'OTHER' });

    expect(opsAgentPanelActions(unclaimed)).toEqual(['claim', 'refresh']);
    expect(opsAgentPanelActions(claimed)).toEqual(['analyze', 'release', 'refresh']);
    expect(opsAgentPanelActions(ownedByOther)).toEqual(['refresh']);
  });

  it('allows confirmation only for an executable recommended plan', () => {
    const analysis = {
      analysisId: 'analysis-1',
      status: 'ACTIVE',
      outcome: 'READY',
      recommendedOptionId: 'option-1',
      options: [{ optionId: 'option-1', feasible: true, executable: true }],
    };
    const executable = baseCase('PLAN_READY', {
      version: 3,
      ownership: 'MINE',
      finding: { ruleCode: 'UNIT_SCHEDULE_CONFLICT' },
      analysis,
    });
    const manual = {
      ...executable,
      finding: { ruleCode: 'CLEANING_REQUIRED' },
      analysis: {
        ...analysis,
        options: [{ optionId: 'option-1', feasible: true, executable: false }],
      },
    };
    const overdue = {
      ...executable,
      finding: { ruleCode: 'RENTAL_RETURN_OVERDUE' },
    };

    expect(opsAgentPanelActions(executable)).toEqual(['prepare', 'release', 'refresh']);
    expect(opsAgentPanelActions(manual)).toEqual(['release', 'refresh']);
    expect(opsAgentPanelActions(overdue)).toEqual(['release', 'refresh']);
    expect(
      opsAgentPanelActions(
        baseCase('MONITORING', {
          version: 4,
          ownership: 'MINE',
          analysis,
        }),
      ),
    ).toEqual(['release', 'refresh']);
    expect(opsAgentPanelActions(baseCase('SUCCEEDED', { version: 4, ownership: 'MINE' }))).toEqual([
      'refresh',
    ]);
  });

  it('maps server case states to the six visible workflow stages', () => {
    const activePlan = baseCase('WAITING_APPROVAL', {
      finding: { ruleCode: 'UNIT_SCHEDULE_CONFLICT' },
      analysis: {
        analysisId: 'analysis-1',
        status: 'ACTIVE',
        outcome: 'READY',
        options: [{ optionId: 'option-1', feasible: true }],
        recommendedOptionId: 'option-1',
      },
      pendingApproval: { approvalId: 'approval-1' },
    });
    const stages = opsAgentWorkflowSteps(activePlan);

    expect(stages.map(({ id }) => id)).toEqual([
      'detect',
      'predict',
      'simulate',
      'recommend',
      'execute',
      'monitor',
    ]);
    expect(stages.map(({ state }) => state)).toEqual([
      'complete',
      'complete',
      'complete',
      'complete',
      'current',
      'waiting',
    ]);
    expect(stages[4].detail).toContain('duyệt');
  });

  it('marks monitoring complete only after the server reports success and asks for replan on failure', () => {
    const finding = { ruleCode: 'PREVIOUS_RENTAL_NOT_RETURNED' };
    const analysis = {
      analysisId: 'analysis-1',
      status: 'ACTIVE',
      outcome: 'READY',
      options: [{ optionId: 'option-1', feasible: true }],
      recommendedOptionId: 'option-1',
    };

    expect(opsAgentWorkflowSteps(baseCase('MONITORING', { finding, analysis }))[5].state).toBe(
      'current',
    );
    expect(opsAgentWorkflowSteps(baseCase('SUCCEEDED', { finding, analysis }))[5].state).toBe(
      'complete',
    );
    expect(
      opsAgentWorkflowSteps(
        baseCase('FAILED', { finding, analysis: { ...analysis, status: 'STALE' } }),
      )[5].state,
    ).toBe('replan');
  });

  it('labels a no-feasible-option plan as manual handling instead of execution', () => {
    const stages = opsAgentWorkflowSteps(
      baseCase('PLAN_READY', {
        finding: { ruleCode: 'OPERATIONAL_CAPACITY_SHORTFALL' },
        analysis: {
          analysisId: 'analysis-1',
          status: 'ACTIVE',
          outcome: 'NO_FEASIBLE_OPTION',
          options: [],
        },
      }),
    );

    expect(stages[4].label).toBe('Xử lý thủ công');
    expect(stages[4].detail).toContain('ngoài Agent');
  });

  it('keeps saved cases isolated by actor and branch', () => {
    const staffBranchOne = opsAgentCaseStorageKey('staff-1', 'Quận 1 / Đông');
    const staffBranchTwo = opsAgentCaseStorageKey('staff-1', 'Quận 2');
    const otherStaff = opsAgentCaseStorageKey('staff-2', 'Quận 1 / Đông');

    expect(staffBranchOne).toContain('staff-1');
    expect(staffBranchOne).not.toBe(staffBranchTwo);
    expect(staffBranchOne).not.toBe(otherStaff);
    expect(opsAgentCaseStorageKey(undefined, 'Quận 1')).toBeUndefined();
  });

  it('supports keyboard tab wraparound and returns focus to the right recovery target', () => {
    expect(nextOpsAgentTabIndex('ArrowRight', 3, 4)).toBe(0);
    expect(nextOpsAgentTabIndex('ArrowLeft', 0, 4)).toBe(3);
    expect(nextOpsAgentTabIndex('Home', 2, 4)).toBe(0);
    expect(nextOpsAgentTabIndex('End', 1, 4)).toBe(3);
    expect(nextOpsAgentTabIndex('Escape', 1, 4)).toBeUndefined();

    const resultHeading = { focus: () => 'result' };
    const errorPanel = { focus: () => 'error' };
    expect(opsAgentActionFocusTarget('success', resultHeading, errorPanel)).toBe(resultHeading);
    expect(opsAgentActionFocusTarget('failure', resultHeading, errorPanel)).toBe(errorPanel);
  });

  it('recognizes terminal handoff and insufficient data while rejecting unknown states', () => {
    for (const state of ['HANDED_OFF', 'INSUFFICIENT_DATA']) {
      const result = baseCase(state, { completed: true });
      expect(requiresOpsAgentStateReview(result)).toBe(false);
      expect(isOpsAgentCaseTerminal(result)).toBe(true);
      expect(canContinueOpsAgentCase(result)).toBe(false);
    }
    const unknown = baseCase('UNKNOWN_SERVER_STATE', { completed: true });
    expect(requiresOpsAgentStateReview(unknown)).toBe(true);
    expect(isOpsAgentCaseTerminal(unknown)).toBe(false);
  });

  it('requires review when a known state conflicts with completion or pending work', () => {
    expect(requiresOpsAgentStateReview(baseCase('RUNNING', { completed: true }))).toBe(true);
    expect(
      requiresOpsAgentStateReview(
        baseCase('WAITING_APPROVAL', {
          pendingApproval: {
            approvalId: 'approval-1',
            summary: 'Duyệt thao tác',
            requiredPermission: 'orders:manage',
            expiresAt: '2026-10-20T10:00:00Z',
          },
          pendingConfirmation: {
            confirmationId: 'confirmation-1',
            summary: 'Xác nhận thao tác',
            expiresAt: '2026-10-20T10:00:00Z',
          },
        }),
      ),
    ).toBe(true);
    expect(requiresOpsAgentStateReview(baseCase('NEEDS_INPUT', { pendingInput: '   ' }))).toBe(
      true,
    );
  });

  it('allows only a coherent input request to continue and treats a clean terminal state as done', () => {
    const waitingForInput = baseCase('WAITING_INPUT', { pendingInput: 'Cho biết mã đơn.' });
    const completed = baseCase('SUCCEEDED', { completed: true });

    expect(canContinueOpsAgentCase(waitingForInput)).toBe(true);
    expect(isOpsAgentCaseTerminal(waitingForInput)).toBe(false);
    expect(requiresOpsAgentStateReview(completed)).toBe(false);
    expect(isOpsAgentCaseTerminal(completed)).toBe(true);
    expect(opsAgentCaseIdForNextMessage('case-1', waitingForInput)).toBe('case-1');
    expect(opsAgentCaseIdForNextMessage('case-1', completed)).toBeUndefined();
    expect(opsAgentCaseIdForNextMessage(undefined, completed)).toBeUndefined();
  });

  it('blocks retry after ambiguous timeout and requires refresh after case conflict', () => {
    const disconnectedBeforeCaseId = opsAgentSendRecovery(
      new ApiClientError(0, 'NETWORK_ERROR', 'Network error'),
      false,
    );
    const timeout = opsAgentSendRecovery(
      new ApiClientError(504, 'AI_SERVICE_TIMEOUT', 'Gateway timeout'),
      true,
    );
    const conflict = opsAgentSendRecovery(
      new ApiClientError(409, 'AGENT_CASE_CONFLICT', 'Case changed'),
      true,
    );
    const rateLimit = opsAgentSendRecovery(
      new ApiClientError(429, 'AI_RATE_LIMITED', 'Busy'),
      true,
    );

    expect(disconnectedBeforeCaseId).toEqual({
      outcomeUnknown: true,
      requiresCaseRefresh: false,
      conflict: false,
    });
    expect(timeout).toEqual({
      outcomeUnknown: true,
      requiresCaseRefresh: true,
      conflict: false,
    });
    expect(conflict).toEqual({
      outcomeUnknown: false,
      requiresCaseRefresh: true,
      conflict: true,
    });
    expect(rateLimit.outcomeUnknown).toBe(false);
  });

  it('does not mark a rejected feature-flag action as having an unknown outcome', () => {
    expect(
      opsAgentActionOutcomeUnknown(new ApiClientError(0, 'API_NOT_CONFIGURED', 'Missing API URL')),
    ).toBe(false);
    expect(
      opsAgentActionOutcomeUnknown(
        new ApiClientError(503, 'AGENT_READINESS_ANALYSIS_DISABLED', 'Feature disabled'),
      ),
    ).toBe(false);
    expect(
      opsAgentActionOutcomeUnknown(
        new ApiClientError(503, 'AGENT_READINESS_EXECUTION_DISABLED', 'Feature disabled'),
      ),
    ).toBe(false);
    expect(
      opsAgentActionOutcomeUnknown(new ApiClientError(503, 'AI_SERVICE_NOT_CONFIGURED', 'Missing')),
    ).toBe(false);
    expect(
      opsAgentActionOutcomeUnknown(
        new ApiClientError(503, 'AI_SERVICE_UNAVAILABLE', 'Unavailable'),
      ),
    ).toBe(true);
    expect(
      opsAgentActionOutcomeUnknown(new ApiClientError(504, 'AI_SERVICE_TIMEOUT', 'Timeout')),
    ).toBe(true);
  });

  it('shows actionable, localized recovery guidance and safe fallbacks for missing content', () => {
    expect(
      opsAgentErrorMessage(new ApiClientError(0, 'NETWORK_ERROR', 'Network error'), 'Fallback'),
    ).toBe('Chưa nhận được phản hồi từ trợ lý.');
    expect(
      opsAgentErrorMessage(
        new ApiClientError(504, 'AI_SERVICE_TIMEOUT', 'Gateway timeout'),
        'Fallback',
      ),
    ).toContain('trạng thái');
    expect(
      opsAgentErrorMessage(new ApiClientError(409, 'AGENT_CASE_CONFLICT', 'Conflict'), 'Fallback'),
    ).toContain('tải lại yêu cầu');
    expect(
      opsAgentEvidenceLabel({ sourceType: 'knowledge', sourceId: 'doc-1', citation: '  ' }),
    ).toBe('Tài liệu được truy xuất');
    expect(
      opsKnowledgeAnswerText({
        outcome: 'answered',
        answer: '  ',
        sources: [],
        provisional: false,
      }),
    ).toContain('chưa trả về nội dung');
  });
});
