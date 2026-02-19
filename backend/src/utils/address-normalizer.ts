/**
 * Basic address normalization for deduplication.
 * Standardizes common abbreviations and formatting.
 */

const ABBREVIATIONS: Record<string, string> = {
  street: "st",
  avenue: "ave",
  boulevard: "blvd",
  drive: "dr",
  lane: "ln",
  court: "ct",
  place: "pl",
  road: "rd",
  circle: "cir",
  terrace: "ter",
  highway: "hwy",
  parkway: "pkwy",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
  apartment: "apt",
  suite: "ste",
  building: "bldg",
  floor: "fl",
  unit: "unit",
};

export function normalizeAddress(address: string): string {
  if (!address) return "";

  let normalized = address
    .toLowerCase()
    .trim()
    // Remove extra whitespace
    .replace(/\s+/g, " ")
    // Remove periods
    .replace(/\./g, "")
    // Remove commas
    .replace(/,/g, "")
    // Remove # before unit numbers
    .replace(/#\s*/g, "unit ");

  // Replace full words with abbreviations
  for (const [full, abbr] of Object.entries(ABBREVIATIONS)) {
    // Word boundary replacement
    normalized = normalized.replace(new RegExp(`\\b${full}\\b`, "g"), abbr);
  }

  return normalized;
}

export function normalizeZip(zip: string): string {
  if (!zip) return "";
  // Take first 5 digits of ZIP
  return zip.replace(/[^0-9]/g, "").slice(0, 5);
}

export function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "");
}
