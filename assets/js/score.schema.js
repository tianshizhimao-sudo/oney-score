/* Bank-Ready Score — schema-driven question definition */
window.SCORE_SCHEMA = [
  {
    id: 'profile',
    title: 'Business profile',
    description: 'Start with the basics banks use to place your business.',
    support: {
      kicker: 'Why this matters',
      title: 'Banks classify before they calculate',
      body: 'Before running numbers, a lender decides what kind of borrower you are. Structure and industry shape how the whole file is read.',
      tip: 'Plain English is fine — you can refine the legal details later with your broker or accountant.'
    },
    fields: [
      {
        id: 'entityType',
        type: 'choice',
        label: 'Business structure',
        columns: 2,
        options: [
          { value: 'sole_trader', label: 'Sole trader' },
          { value: 'partnership', label: 'Partnership' },
          { value: 'trust',       label: 'Trust' },
          { value: 'company',     label: 'Company (Pty Ltd)' }
        ]
      },
      {
        id: 'industryRisk',
        type: 'choice',
        label: 'Industry profile',
        columns: 3,
        options: [
          { value: 'low',    label: 'Stable / bank-friendly' },
          { value: 'medium', label: 'Mixed' },
          { value: 'high',   label: 'Volatile / specialised' }
        ]
      }
    ]
  },
  {
    id: 'history',
    title: 'Trading history',
    description: 'Lenders want evidence the business has been operating consistently.',
    support: {
      kicker: 'What banks look for',
      title: 'Time in market lowers execution risk',
      body: 'Longer trading history usually means fewer surprises for a credit team. Thin history can still work — it just needs stronger supporting evidence.',
      tip: 'Count from when this business started trading, not when the entity was registered.'
    },
    fields: [
      {
        id: 'yearsTrading',
        type: 'choice',
        label: 'How long has the business been trading?',
        columns: 4,
        options: [
          { value: 'lt1',   label: 'Less than 1 year' },
          { value: '1to2',  label: '1–2 years' },
          { value: '2to5',  label: '2–5 years' },
          { value: 'gt5',   label: '5+ years' }
        ]
      }
    ]
  },
  {
    id: 'financials',
    title: 'Revenue & profitability',
    description: 'This is where a lender tests commercial viability.',
    support: {
      kicker: 'Reality check',
      title: 'Revenue alone is not enough',
      body: 'Banks care about margin, consistency and debt-servicing capacity — not just top-line sales.',
      tip: 'If last year was a one-off, say so in your file. Context beats a surprise.'
    },
    fields: [
      {
        id: 'annualRevenueBand',
        type: 'choice',
        label: 'Revenue trend over the last 12–24 months',
        columns: 3,
        options: [
          { value: 'falling', label: 'Falling / inconsistent' },
          { value: 'stable',  label: 'Stable' },
          { value: 'growing', label: 'Growing' }
        ]
      },
      {
        id: 'profitability',
        type: 'choice',
        label: 'Profit position',
        columns: 3,
        options: [
          { value: 'loss',    label: 'Loss-making' },
          { value: 'thin',    label: 'Profitable but thin' },
          { value: 'healthy', label: 'Healthy profit margin' }
        ]
      }
    ]
  },
  {
    id: 'liquidity',
    title: 'Cash flow & liquidity',
    description: 'Liquidity weakness often kills otherwise acceptable deals.',
    support: {
      kicker: 'Why this matters',
      title: 'Good businesses still get declined',
      body: 'Profitable trading with thin cash buffers fails serviceability tests. Banks want to see coverage, not just earnings.',
      tip: 'A 1–3 month buffer is a realistic target for most SMEs before a bank ask.'
    },
    fields: [
      {
        id: 'cashBufferMonths',
        type: 'choice',
        label: 'Cash buffer available',
        columns: 4,
        options: [
          { value: 'lt1',   label: 'Less than 1 month' },
          { value: '1to3',  label: '1–3 months' },
          { value: '3to6',  label: '3–6 months' },
          { value: 'gt6',   label: '6+ months' }
        ]
      },
      {
        id: 'cashFlowConfidence',
        type: 'choice',
        label: 'Cash flow visibility',
        columns: 3,
        options: [
          { value: 'poor',   label: 'Often tight / unclear' },
          { value: 'ok',     label: 'Manageable' },
          { value: 'strong', label: 'Strong and predictable' }
        ]
      }
    ]
  },
  {
    id: 'compliance',
    title: 'Tax / BAS / ATO readiness',
    description: 'Clean compliance reduces lender friction fast.',
    support: {
      kicker: 'Bank lens',
      title: 'Compliance is a confidence signal',
      body: 'Late BAS, outdated financials and ATO arrears slow or kill credit decisions — even when the underlying business is fine.',
      tip: 'Fixing lodgements before an application usually moves the dial more than chasing extra revenue.'
    },
    fields: [
      {
        id: 'taxLodgements',
        type: 'choice',
        label: 'Financials and lodgements',
        columns: 3,
        options: [
          { value: 'behind',  label: 'Behind' },
          { value: 'mostly',  label: 'Mostly up to date' },
          { value: 'current', label: 'Fully current' }
        ]
      },
      {
        id: 'atoDebt',
        type: 'choice',
        label: 'ATO debt position',
        columns: 3,
        options: [
          { value: 'material', label: 'Material unpaid debt' },
          { value: 'managed',  label: 'Some debt but managed' },
          { value: 'none',     label: 'No ATO debt' }
        ]
      }
    ]
  },
  {
    id: 'debt',
    title: 'Existing debt conduct',
    description: 'Past debt behaviour is treated as a future signal.',
    support: {
      kicker: 'What it signals',
      title: 'Conduct is the cheapest thing to fix',
      body: 'Late payments, stretched limits and missed direct debits weaken confidence even if revenue is healthy.',
      tip: 'Six clean months of conduct is the usual minimum a lender wants to see after past issues.'
    },
    fields: [
      {
        id: 'repaymentConduct',
        type: 'choice',
        label: 'Current repayment conduct',
        columns: 3,
        options: [
          { value: 'poor',  label: 'Missed / irregular' },
          { value: 'ok',    label: 'Mostly on time' },
          { value: 'clean', label: 'Clean repayment history' }
        ]
      }
    ]
  },
  {
    id: 'security',
    title: 'Security / deposit position',
    description: 'Security quality determines how comfortable a lender can be.',
    support: {
      kicker: 'Not just equity',
      title: 'How easy is the security to understand?',
      body: 'Lenders look at available equity, asset quality and how straightforward the security structure is to credit-assess.',
      tip: 'Clean residential equity is the easiest story. Specialised assets take more work to position.'
    },
    fields: [
      {
        id: 'securityStrength',
        type: 'choice',
        label: 'Security position',
        columns: 3,
        options: [
          { value: 'weak',     label: 'Limited / unclear' },
          { value: 'moderate', label: 'Some security support' },
          { value: 'strong',   label: 'Strong security / deposit' }
        ]
      }
    ]
  },
  {
    id: 'docs',
    title: 'Documentation readiness',
    description: 'Good applications are easy to credit-assess.',
    support: {
      kicker: 'Why this wins',
      title: 'A clean credit pack moves faster',
      body: 'The same borrower can feel strong or weak depending on how complete and clean the file is when it lands with the lender.',
      tip: 'Aim for: last 2 years financials, latest BAS, 3 months of statements, ATO portal snapshot, and an asset/liability summary.'
    },
    fields: [
      {
        id: 'docsReady',
        type: 'choice',
        label: 'Can you produce current financial documents quickly?',
        columns: 3,
        options: [
          { value: 'no',      label: 'Not really' },
          { value: 'partial', label: 'Partially' },
          { value: 'yes',     label: 'Yes, quickly' }
        ]
      }
    ]
  }
];
