export const submissionRequirementLabel = (code: string) =>
  (
    ({
      branch: "Add at least one branch",
      branch_operating_hours: "Add operating hours to every branch",
    }) as Record<string, string>
  )[code] ?? code.replaceAll("_", " ");
export const canEditGym = (status: string) =>
  status === "DRAFT" || status === "REJECTED";
