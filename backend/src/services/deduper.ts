import { prisma } from "../db";
import { normalizeAddress, normalizeZip, normalizeName } from "../utils/address-normalizer";
import * as stringSimilarity from "string-similarity";

export interface DedupeResult {
  existingLeadId: string | null;
  matchType: "exact_address" | "parcel_id" | "fuzzy" | null;
}

/**
 * Check if a lead already exists using the three-tier deduplication strategy:
 * 1. Primary: exact property_address + zip
 * 2. Secondary: parcel_id if present
 * 3. Fallback: fuzzy owner_name + property_address (conservative threshold)
 */
export async function findDuplicate(
  organizationId: string,
  ownerName: string,
  propertyAddress: string,
  zip: string,
  parcelId?: string
): Promise<DedupeResult> {
  const normalizedAddr = normalizeAddress(propertyAddress);
  const normalizedZip = normalizeZip(zip);

  // 1. Primary: exact property_address + zip
  if (normalizedAddr && normalizedZip) {
    const exactMatch = await prisma.lead.findFirst({
      where: {
        organizationId,
        zip: normalizedZip,
      },
      select: { id: true, propertyAddress: true },
    });

    if (exactMatch) {
      const existingNormalized = normalizeAddress(exactMatch.propertyAddress);
      if (existingNormalized === normalizedAddr) {
        return { existingLeadId: exactMatch.id, matchType: "exact_address" };
      }
    }

    // Check all leads with matching zip for exact address
    const zipMatches = await prisma.lead.findMany({
      where: { organizationId, zip: normalizedZip },
      select: { id: true, propertyAddress: true },
    });

    for (const lead of zipMatches) {
      if (normalizeAddress(lead.propertyAddress) === normalizedAddr) {
        return { existingLeadId: lead.id, matchType: "exact_address" };
      }
    }
  }

  // 2. Secondary: parcel_id if present
  if (parcelId) {
    const parcelMatch = await prisma.lead.findFirst({
      where: { organizationId, parcelId },
      select: { id: true },
    });
    if (parcelMatch) {
      return { existingLeadId: parcelMatch.id, matchType: "parcel_id" };
    }
  }

  // 3. Fallback: fuzzy owner_name + property_address (conservative)
  if (ownerName && propertyAddress) {
    const normalizedOwner = normalizeName(ownerName);
    // Only check leads with somewhat similar addresses to limit scope
    const candidates = await prisma.lead.findMany({
      where: { organizationId },
      select: { id: true, ownerName: true, propertyAddress: true },
      take: 5000, // Cap for performance
    });

    for (const candidate of candidates) {
      const nameScore = stringSimilarity.compareTwoStrings(
        normalizedOwner,
        normalizeName(candidate.ownerName)
      );
      const addrScore = stringSimilarity.compareTwoStrings(
        normalizedAddr,
        normalizeAddress(candidate.propertyAddress)
      );

      // Conservative threshold: both name and address must be very similar
      if (nameScore >= 0.85 && addrScore >= 0.85) {
        return { existingLeadId: candidate.id, matchType: "fuzzy" };
      }
    }
  }

  return { existingLeadId: null, matchType: null };
}
