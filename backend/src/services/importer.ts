import { prisma } from "../db";
import { createCsvStream } from "../utils/csv-parser";
import { normalizeAddress, normalizeZip } from "../utils/address-normalizer";
import { findDuplicate } from "./deduper";
import { logAudit } from "./audit";
import fs from "fs";

export interface ColumnMapping {
  owner_name: string;
  property_address: string;
  mailing_address?: string;
  city?: string;
  state?: string;
  zip?: string;
  parcel_id?: string;
}

export interface ImportResult {
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

export async function processImport(
  importJobId: string,
  filePath: string,
  mapping: ColumnMapping,
  organizationId: string,
  userId: string
): Promise<ImportResult> {
  const result: ImportResult = {
    totalRows: 0,
    insertedCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    errors: [],
  };

  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: "PROCESSING" },
  });

  await logAudit({
    actorId: userId,
    action: "import.start",
    entity: "ImportJob",
    entityId: importJobId,
    metadata: { mapping },
  });

  const fileBuffer = fs.readFileSync(filePath);
  const csvStream = createCsvStream(fileBuffer);

  let rowNum = 0;

  for await (const row of csvStream) {
    rowNum++;
    result.totalRows++;

    try {
      const ownerName = row[mapping.owner_name]?.trim();
      const propertyAddress = row[mapping.property_address]?.trim();

      if (!ownerName || !propertyAddress) {
        result.errorCount++;
        result.errors.push({
          row: rowNum,
          message: "Missing required field: owner_name or property_address",
        });
        continue;
      }

      const mailingAddress = mapping.mailing_address ? row[mapping.mailing_address]?.trim() : undefined;
      const city = mapping.city ? row[mapping.city]?.trim() : undefined;
      const state = mapping.state ? row[mapping.state]?.trim()?.toUpperCase() : undefined;
      const zip = mapping.zip ? normalizeZip(row[mapping.zip] || "") : undefined;
      const parcelId = mapping.parcel_id ? row[mapping.parcel_id]?.trim() : undefined;

      // Check for duplicates
      const dedupeResult = await findDuplicate(
        organizationId,
        ownerName,
        propertyAddress,
        zip || "",
        parcelId
      );

      if (dedupeResult.existingLeadId) {
        // Update existing lead if matched
        if (dedupeResult.matchType === "exact_address" || dedupeResult.matchType === "parcel_id") {
          await prisma.lead.update({
            where: { id: dedupeResult.existingLeadId },
            data: {
              mailingAddress: mailingAddress || undefined,
              city: city || undefined,
              state: state || undefined,
              parcelId: parcelId || undefined,
              importJobId: importJobId,
            },
          });
          result.updatedCount++;
        } else {
          // Fuzzy match — mark as duplicate, don't auto-merge
          result.duplicateCount++;
        }
        continue;
      }

      // Insert new lead
      await prisma.lead.create({
        data: {
          organizationId,
          ownerName,
          propertyAddress: normalizeAddress(propertyAddress),
          mailingAddress,
          city,
          state,
          zip: zip || undefined,
          parcelId: parcelId || undefined,
          importJobId: importJobId,
        },
      });
      result.insertedCount++;
    } catch (err: any) {
      result.errorCount++;
      result.errors.push({
        row: rowNum,
        message: err.message || "Unknown error",
      });
    }
  }

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: "COMPLETED",
      totalRows: result.totalRows,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      duplicateCount: result.duplicateCount,
      errorCount: result.errorCount,
      errors: result.errors as any,
      completedAt: new Date(),
    },
  });

  await logAudit({
    actorId: userId,
    action: "import.complete",
    entity: "ImportJob",
    entityId: importJobId,
    after: {
      totalRows: result.totalRows,
      inserted: result.insertedCount,
      updated: result.updatedCount,
      duplicates: result.duplicateCount,
      errors: result.errorCount,
    },
  });

  return result;
}
