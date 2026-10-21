import { describe, expect, it } from 'vitest';

import { agentCaseResultSchema } from '../src/modules/agent/agent.schema.js';

const caseWithForecast = {
  caseId: '10000000-0000-4000-8000-000000000001',
  state: 'PLAN_READY',
  message: 'Một đơn có nguy cơ giao trễ.',
  evidence: [],
  completed: false,
  analysis: {
    analysisId: '10000000-0000-4000-8000-000000000002',
    status: 'ACTIVE',
    outcome: 'READY',
    observedAt: '2026-10-21T08:00:00.000Z',
    sourceObservedAt: '2026-10-21T07:59:00.000Z',
    simulatorVersion: 'readiness-v1',
    rankingPolicyVersion: 'balanced-v1',
    riskLevel: 'HIGH',
    riskScore: 82,
    estimatedDelayMinutes: 150,
    reasons: ['Bộ hiện tại chưa được trả.', 'Thời gian vệ sinh không còn đủ.'],
    ruleVersion: 'readiness-risk-v1',
    evaluatedAt: '2026-10-21T15:00:00.000+07:00',
    before: {},
    options: [],
    recommendedOptionId: null,
    narrative: {
      summary: 'Cần xử lý sớm.',
      rationale: [],
      risks: [],
      nextStep: '',
      fallback: false,
    },
    internalPlannerTrace: { toolNames: ['private-tool'] },
  },
};

describe('Ops Agent browser forecast projection', () => {
  it('keeps bounded risk estimates while stripping unrelated analysis metadata', () => {
    const parsed = agentCaseResultSchema.parse(caseWithForecast);

    expect(parsed.analysis).toMatchObject({
      riskLevel: 'HIGH',
      riskScore: 82,
      estimatedDelayMinutes: 150,
      reasons: ['Bộ hiện tại chưa được trả.', 'Thời gian vệ sinh không còn đủ.'],
    });
    expect(parsed.analysis).not.toHaveProperty('internalPlannerTrace');
  });

  it('rejects risk scores outside the documented 0–100 scale', () => {
    const invalid = {
      ...caseWithForecast,
      analysis: { ...caseWithForecast.analysis, riskScore: 101 },
    };

    expect(agentCaseResultSchema.safeParse(invalid).success).toBe(false);
  });
});
