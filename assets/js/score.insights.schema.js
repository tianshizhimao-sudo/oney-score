/* Bank-Ready Score — Business Lending Signals (optional insight layer) */
/*
 * Config-driven insight pack. Kept deliberately separate from the core
 * SCORE_SCHEMA so the main readiness score cannot be dominated by these
 * answers. Each option carries a `signals` token list used later by the
 * insight evaluator to derive profile tags and recommendation boosts.
 */
window.INSIGHT_SCHEMA = {
  packId: 'default',
  label: 'Business Lending Signals',
  eyebrow: 'Optional sharpening layer',
  transition: {
    eyebrow: 'Optional sharpening layer',
    title: 'Add deeper business context',
    body: 'Answer a few quick questions about cash flow, debt pressure, and business banking habits to make your result more tailored.',
    note: 'You can skip this and get your score now.',
    primaryCta: 'Sharpen my result',
    secondaryCta: 'Skip and see score'
  },
  groups: [
    {
      id: 'signals_group_1',
      title: 'Business Lending Signals',
      eyebrow: 'Optional sharpening layer',
      description: 'Answer a few quick questions to make your result more tailored.',
      questions: [
        {
          id: 'funding_reason',
          type: 'single',
          prompt: 'What is the main reason you want funding right now?',
          layout: 'compact-grid',
          optional: true,
          options: [
            { value: 'cash_flow',    label: 'Cash flow',                         signals: ['cash_flow_pressure'] },
            { value: 'equipment',    label: 'Equipment purchase',                signals: ['asset_backed_use'] },
            { value: 'expansion',    label: 'Expansion / hiring',                signals: ['growth_intent'] },
            { value: 'refinance',    label: 'Refinance / debt restructure',      signals: ['debt_load_concern'] },
            { value: 'tax_pressure', label: 'Tax / short-term pressure',         signals: ['cash_flow_pressure', 'compliance_pressure'] },
            { value: 'other',        label: 'Other',                             signals: ['general_funding_need'] }
          ]
        },
        {
          id: 'recent_pressure',
          type: 'single',
          prompt: 'What has been the biggest pressure on your business in the last 6 months?',
          layout: 'compact-grid',
          optional: true,
          options: [
            { value: 'rent',          label: 'Rent',                        signals: ['fixed_cost_pressure'] },
            { value: 'wages',         label: 'Wages',                       signals: ['fixed_cost_pressure'] },
            { value: 'tax',           label: 'Tax / BAS / GST',             signals: ['compliance_pressure'] },
            { value: 'debt',          label: 'Existing debt repayments',    signals: ['debt_load_concern'] },
            { value: 'suppliers',     label: 'Supplier / inventory costs',  signals: ['working_capital_pressure'] },
            { value: 'slow_payments', label: 'Slow customer payments',      signals: ['cash_flow_pressure'] }
          ]
        },
        {
          id: 'revenue_drop_resilience',
          type: 'single',
          prompt: 'If your revenue dropped by 20% for the next 3 months, how long could the business comfortably operate?',
          layout: 'compact-grid',
          optional: true,
          options: [
            { value: 'lt1',   label: 'Less than 1 month',  signals: ['cash_buffer_thin'] },
            { value: '1to3',  label: '1–3 months',         signals: ['cash_buffer_moderate'] },
            { value: '3to6',  label: '3–6 months',         signals: ['operationally_stable'] },
            { value: 'gt6',   label: 'More than 6 months', signals: ['operationally_stable', 'liquidity_strength'] }
          ]
        },
        {
          id: 'banking_habits',
          type: 'single',
          prompt: 'How do you usually manage business income and expenses?',
          layout: 'compact-grid',
          optional: true,
          options: [
            { value: 'clean_business_account', label: 'Dedicated business account, very clear records',  signals: ['banking_discipline_strong'] },
            { value: 'mostly_business',        label: 'Mostly through business account, some mixed use', signals: ['banking_discipline_mixed'] },
            { value: 'mostly_personal',        label: 'Mostly through personal account',                 signals: ['documentation_risk', 'expense_control_gap'] },
            { value: 'disorganised',           label: 'Records are not well organised',                  signals: ['documentation_risk', 'expense_control_gap'] }
          ]
        }
      ]
    },
    {
      id: 'signals_group_2',
      title: 'Business Lending Signals',
      eyebrow: 'Optional sharpening layer',
      description: 'A few extra answers can make your result more useful.',
      questions: [
        {
          id: 'transaction_visibility',
          type: 'single',
          prompt: 'How clear are you on your last 6 months of business bank transactions?',
          layout: 'compact-grid',
          optional: true,
          options: [
            { value: 'very_clear',     label: 'Very clear',              signals: ['banking_discipline_strong'] },
            { value: 'mostly_clear',   label: 'Mostly clear',            signals: ['banking_discipline_mixed'] },
            { value: 'need_to_check',  label: 'I need to check statements', signals: ['documentation_risk'] },
            { value: 'not_clear',      label: 'Not clear',               signals: ['documentation_risk'] }
          ]
        },
        {
          id: 'debt_pressure',
          type: 'single',
          prompt: 'What is your biggest debt pressure today?',
          layout: 'compact-grid',
          optional: true,
          options: [
            { value: 'repayments_high', label: 'Repayments are too high',    signals: ['debt_load_concern'] },
            { value: 'interest_high',   label: 'Interest cost is too high',  signals: ['debt_load_concern'] },
            { value: 'too_many_debts',  label: 'Too many separate debts',    signals: ['debt_load_concern'] },
            { value: 'tax_upcoming',    label: 'Upcoming tax obligations',   signals: ['compliance_pressure', 'cash_flow_pressure'] },
            { value: 'none',            label: 'No major debt pressure',     signals: ['operationally_stable'] }
          ]
        },
        {
          id: 'revenue_trend',
          type: 'single',
          prompt: 'How would you describe your revenue trend over the last 12 months?',
          layout: 'compact-grid',
          optional: true,
          options: [
            { value: 'growing',   label: 'Growing steadily', signals: ['growth_ready'] },
            { value: 'stable',    label: 'Mostly stable',    signals: ['operationally_stable'] },
            { value: 'volatile',  label: 'Volatile',         signals: ['volatility_risk'] },
            { value: 'declining', label: 'Declining',        signals: ['revenue_pressure'] }
          ]
        },
        {
          id: 'least_confident_area',
          type: 'single',
          prompt: 'If you applied for a loan today, what would you feel least confident about?',
          layout: 'compact-grid',
          optional: true,
          options: [
            { value: 'transactions',   label: 'Bank statements / transaction strength', signals: ['documentation_risk'] },
            { value: 'profitability',  label: 'Profitability',                          signals: ['profitability_risk'] },
            { value: 'tax_docs',       label: 'Tax / BAS / financial documents',        signals: ['documentation_risk', 'compliance_pressure'] },
            { value: 'existing_debt',  label: 'Existing debt levels',                   signals: ['debt_load_concern'] },
            { value: 'not_sure',       label: 'I’m not sure what lenders care about most', signals: ['education_gap'] }
          ]
        }
      ]
    }
  ]
};

/* Flatten helper: all insight questions in reading order */
window.INSIGHT_SCHEMA.allQuestions = (function () {
  var out = [];
  window.INSIGHT_SCHEMA.groups.forEach(function (group) {
    group.questions.forEach(function (q) {
      out.push({ groupId: group.id, question: q });
    });
  });
  return out;
})();
