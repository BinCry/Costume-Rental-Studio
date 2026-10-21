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

const baseCase = (state, overrides = {}) => ({
  caseId: 'case-1',
  state,
  message: 'Kết quả kiểm tra',
  evidence: [],
  completed: false,
  ...overrides,
});

describe('Ops Agent safe state and recovery behavior', () => {
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

  it('fails closed for unknown states, even when the response claims completion', () => {
    const result = baseCase('HANDED_OFF', { completed: true });

    expect(requiresOpsAgentStateReview(result)).toBe(true);
    expect(isOpsAgentCaseTerminal(result)).toBe(false);
    expect(canContinueOpsAgentCase(result)).toBe(false);
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
    const waitingForInput = baseCase('NEEDS_INPUT', { pendingInput: 'Cho biết mã đơn.' });
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
