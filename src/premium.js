export const STUDENT_PREMIUM_PRICE = 7.99;
export const EMPLOYER_PREMIUM_PRICE = 29.99;
export const PREMIUM_TRIAL_DAYS = 7;

export const PREMIUM_FEATURES = {
  resume_review: {
    key: "resume_review",
    role: "student",
    title: "AI Resume Reviewer",
    summary: "Get a score, rewritten bullets, missing-section flags, and a sharper improvement plan.",
  },
  interview_coach: {
    key: "interview_coach",
    role: "student",
    title: "AI Interview Coach",
    summary: "Practice role-specific interview questions and get scored feedback on every answer.",
  },
  job_match_score: {
    key: "job_match_score",
    role: "student",
    title: "AI Job Match Score",
    summary: "See which roles fit your skills, age, grade, experience, and availability best.",
  },
  profile_strength: {
    key: "profile_strength",
    role: "student",
    title: "Profile Strength",
    summary: "Track profile completion, spot missing sections, and see what to improve before applying.",
  },
  applicant_ranking: {
    key: "applicant_ranking",
    role: "business",
    title: "AI Applicant Ranking",
    summary: "Automatically rank applicants by fit and explain why they landed where they did.",
  },
  job_writer: {
    key: "job_writer",
    role: "business",
    title: "AI Job Description Writer",
    summary: "Turn rough notes into a polished listing with tags, pay guidance, and questions.",
  },
  screening_questions: {
    key: "screening_questions",
    role: "business",
    title: "AI Screening Questions",
    summary: "Generate five stronger screening questions from the job title and description.",
  },
  featured_listings: {
    key: "featured_listings",
    role: "business",
    title: "Featured Listings",
    summary: "Pin premium jobs above free jobs with a gold badge and stronger card treatment.",
  },
  analytics: {
    key: "analytics",
    role: "business",
    title: "Advanced Analytics",
    summary: "Track views, applications, conversion, applicant quality, and timing trends.",
  },
};

const ACTIVE_STATUSES = ["trialing", "active"];

export function isPremiumStatusActive(status) {
  return ACTIVE_STATUSES.includes(String(status || "").toLowerCase());
}

export function toMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function getRolePlanPrice(role) {
  return role === "business" ? EMPLOYER_PREMIUM_PRICE : STUDENT_PREMIUM_PRICE;
}

export function getRolePlanLabel(role) {
  return role === "business" ? "Employer Premium" : "Student Premium";
}

export function formatPremiumDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function normalizePremiumProfileFields(data = {}) {
  return {
    subscriptionRole: data.subscriptionRole || data.subscription_role || "",
    premiumStatus: data.premiumStatus || data.premium_status || "free",
    premiumPlanKey: data.premiumPlanKey || data.premium_plan_key || "",
    premiumExpiresAt: data.premiumExpiresAt || data.premium_expires_at || "",
    trialEndsAt: data.trialEndsAt || data.trial_ends_at || "",
    stripeCustomerId: data.stripeCustomerId || data.stripe_customer_id || "",
    stripeSubscriptionId: data.stripeSubscriptionId || data.stripe_subscription_id || "",
    cancelAtPeriodEnd:
      data.cancelAtPeriodEnd != null
        ? !!data.cancelAtPeriodEnd
        : !!data.cancel_at_period_end,
  };
}

export function getPremiumAccess(profile, role) {
  const premium = normalizePremiumProfileFields(profile);
  const status = String(premium.premiumStatus || "free").toLowerCase();
  const expiresAt = premium.premiumExpiresAt ? new Date(premium.premiumExpiresAt) : null;
  const now = new Date();
  const isExpired =
    expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.getTime() < now.getTime() : false;
  const active = isPremiumStatusActive(status) && !isExpired;
  const planLabel = getRolePlanLabel(role);
  return {
    ...premium,
    active,
    isTrial: status === "trialing" && !isExpired,
    isCanceled: status === "canceled" || premium.cancelAtPeriodEnd,
    statusLabel:
      status === "trialing"
        ? "Free Trial"
        : status === "active"
          ? "Premium Active"
          : status === "past_due"
            ? "Payment Issue"
            : status === "canceled"
              ? "Cancels at Period End"
              : status === "expired"
                ? "Expired"
                : "Free Plan",
    planLabel,
    planPriceLabel: `${toMoney(getRolePlanPrice(role))}/mo`,
    expiresLabel: formatPremiumDate(premium.premiumExpiresAt),
    trialEndsLabel: formatPremiumDate(premium.trialEndsAt),
  };
}

export function getFeatureMeta(featureKey) {
  return PREMIUM_FEATURES[featureKey] || null;
}

export function sortJobsByPremium(jobs) {
  return (Array.isArray(jobs) ? jobs : []).slice().sort(function (a, b) {
    if (!!a.isFeatured !== !!b.isFeatured) return a.isFeatured ? -1 : 1;
    if ((a.posted_at || "") !== (b.posted_at || "")) {
      return String(b.posted_at || "").localeCompare(String(a.posted_at || ""));
    }
    if ((a.posted || "") !== (b.posted || "")) {
      return String(b.posted || "").localeCompare(String(a.posted || ""));
    }
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}
