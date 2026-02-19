"use client";

import { useState, useEffect, useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";

export default function ImportPage() {
  return (
    <AuthGuard>
      <ImportContent />
    </AuthGuard>
  );
}

type Step = "upload" | "mapping" | "processing" | "results";

const DB_FIELDS = [
  { key: "owner_name", label: "Owner Name", required: true },
  { key: "property_address", label: "Property Address", required: true },
  { key: "mailing_address", label: "Mailing Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "zip", label: "ZIP", required: false },
  { key: "parcel_id", label: "Parcel ID", required: false },
];

function ImportContent() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [importJobId, setImportJobId] = useState("");
  const [filePath, setFilePath] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [pastImports, setPastImports] = useState<any[]>([]);

  useEffect(() => {
    api.getImportJobs().then(setPastImports).catch(console.error);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await api.uploadCsv(file);
      setCsvHeaders(result.headers);
      setImportJobId(result.importJobId);
      setFilePath(result.filePath);
      setStep("mapping");

      // Auto-map columns with matching names
      const autoMapping: Record<string, string> = {};
      for (const field of DB_FIELDS) {
        const match = result.headers.find(
          (h) =>
            h.toLowerCase().replace(/[_\s-]/g, "") ===
            field.key.replace(/[_\s-]/g, "")
        );
        if (match) autoMapping[field.key] = match;
      }
      setMapping(autoMapping);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleStartImport = async () => {
    if (!mapping.owner_name || !mapping.property_address) {
      setError("Owner Name and Property Address mappings are required");
      return;
    }
    setError("");
    setStep("processing");

    try {
      await api.startImport({ importJobId, filePath, mapping });
      // Poll for completion
      pollImportStatus(importJobId);
    } catch (err: any) {
      setError(err.message);
      setStep("mapping");
    }
  };

  const pollImportStatus = useCallback(
    async (jobId: string) => {
      const poll = async () => {
        const job = await api.getImportJob(jobId);
        if (job.status === "COMPLETED" || job.status === "FAILED") {
          setImportResult(job);
          setStep("results");
        } else {
          setTimeout(poll, 2000);
        }
      };
      poll();
    },
    []
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Import Leads</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Upload CSV File</h2>
          <p className="text-sm text-gray-500 mb-4">
            Upload a CSV file with property/owner lead data. Maximum 200,000 rows.
          </p>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mb-4"
            />
            {file && (
              <p className="text-sm text-gray-600">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload & Continue"}
            </button>
          </div>
        </div>
      )}

      {/* Step: Column Mapping */}
      {step === "mapping" && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Map Columns</h2>
          <p className="text-sm text-gray-500 mb-4">
            Map your CSV columns to the corresponding lead fields.
          </p>
          <div className="space-y-3">
            {DB_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center gap-4">
                <label className="w-40 text-sm font-medium text-gray-700">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <select
                  value={mapping[field.key] || ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [field.key]: e.target.value }))
                  }
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">-- Skip --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep("upload")}
              className="px-4 py-2 text-sm border rounded-md"
            >
              Back
            </button>
            <button
              onClick={handleStartImport}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
            >
              Start Import
            </button>
          </div>
        </div>
      )}

      {/* Step: Processing */}
      {step === "processing" && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-lg font-semibold mb-2">Processing Import...</div>
          <p className="text-gray-500 text-sm">
            Your leads are being imported and deduplicated. This page will update automatically.
          </p>
          <div className="mt-4 animate-pulse text-indigo-600">Working...</div>
        </div>
      )}

      {/* Step: Results */}
      {step === "results" && importResult && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Import Complete</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <ResultCard label="Total Rows" value={importResult.totalRows} />
            <ResultCard label="Inserted" value={importResult.insertedCount} color="text-green-600" />
            <ResultCard label="Updated" value={importResult.updatedCount} color="text-blue-600" />
            <ResultCard label="Duplicates" value={importResult.duplicateCount} color="text-yellow-600" />
            <ResultCard label="Errors" value={importResult.errorCount} color="text-red-600" />
          </div>

          {importResult.errors && importResult.errors.length > 0 && (
            <div>
              <h3 className="font-medium text-sm mb-2">
                Row Errors ({importResult.errors.length})
              </h3>
              <div className="max-h-60 overflow-y-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {importResult.errors.slice(0, 100).map((err: any, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-1">{err.row}</td>
                        <td className="px-3 py-1 text-red-600">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={() => {
                setStep("upload");
                setFile(null);
                setImportResult(null);
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}

      {/* Past Imports */}
      {pastImports.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Import History</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rows</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inserted</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pastImports.map((imp) => (
                  <tr key={imp.id}>
                    <td className="px-4 py-2">{imp.fileName}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          imp.status === "COMPLETED"
                            ? "bg-green-100 text-green-700"
                            : imp.status === "FAILED"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {imp.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">{imp.totalRows}</td>
                    <td className="px-4 py-2">{imp.insertedCount}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(imp.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-gray-50 rounded p-3 text-center">
      <div className={`text-2xl font-bold ${color || ""}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
