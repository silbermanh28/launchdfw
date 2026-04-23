export function normalizeRole(role?: string | null) {
  return role === "business" ? "employer" : role === "student" ? "student" : role || "student";
}

export function getPlanConfig(role?: string | null) {
  const normalized = normalizeRole(role);
  const studentPriceId = Deno.env.get("STRIPE_STUDENT_PRICE_ID") || "";
  const employerPriceId = Deno.env.get("STRIPE_EMPLOYER_PRICE_ID") || "";
  if (normalized === "employer") {
    return {
      role: normalized,
      priceId: employerPriceId,
      planKey: "employer_premium_monthly",
      label: "Employer Premium",
    };
  }
  return {
    role: "student",
    priceId: studentPriceId,
    planKey: "student_premium_monthly",
    label: "Student Premium",
  };
}

