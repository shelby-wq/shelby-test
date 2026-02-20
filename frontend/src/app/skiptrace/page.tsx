"use client";

import { useState, useEffect, useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";

export default function SkiptracePage() {
  return (
    <AuthGuard>
      <SkiptraceContent />
    </AuthGuard>
  );
}

type Step = "setup" | "confirm" | "processing" | "results";

const PERMISSIBLE_PURPOSES = [
  "Written consent from the consumer",
  "Legitimate business transaction initiated by the consumer",
  "Court order or subpoena",
  "Insurance underwriting",
  "Account review or collections on existing account",
  "Other lawful purpose (specify in notes)",
];

function SkiptraceContent() {
  const [step, setStep] = useState<Step>("setup");
  const [filters, setFilters] = useState<{ status?: string; city?: string; tag?: string }>({});
  const [estimate, setEstimate] = useState<any>(null);
  const [estimating, setEstimating] = useState(false);
  const [purpose, setPurpose] = useState(PERMISSIBLE_PURPOSES[0]);
  const [confirmed, setConfirmed] = useState(false);
  const [skiptraceJobId, setSkiptraceJobId] = useState("");
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [error, setError] = useState("");
  const [pastJobs, setPastJobs] = useState<any[]>([]);

  useEffect(() => {
    api.getSkiptraceJobs().then(setPastJobs).catch(console.error);
  }, []);

  const handleEstimate = async () => {
    setEstimating(true);
    setError("");
    setEstimate(null);
    try {
      const cleanFilters: any = {};
      if (filters.status) cleanFilters.status = filters.status;
      if (filters.city) cleanFilters.city = filters.city;
      if (filters.tag) cleanFilters.tag = filters.tag;

      const result = await api.skiptraceEstimate({
        filters: Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined,
      });
      setEstimate(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEstimating(false);
    }
  };

  const handleStart = async () => {
    if (!confirmed) {
      setError("You must confirm lawful basis before starting.");
      return;
    }
    setError("");
    setStep("processing");

    try {
      const cleanFilters: any = {};
      if (filters.status) cleanFilters.status = filters.status;
      if (filters.city) cleanFilters.city = filters.city;
      if (filters.tag) cleanFilters.tag = filters.tag;

      const result = await api.skiptraceStart({
        filters: Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined,
        permissiblePurpose: purpose,
        confirmLawfulBasis: true,
      });
      setSkiptraceJobId(result.id);
      pollStatus(result.id);
    } catch (err: any) {
      setError(err.message);
      setStep("confirm");
    }
  };

  const pollStatus = useCallback(async (jobId: string) => {
    const poll = async () => {
      try {
        const job = await api.getSkiptraceJob(jobId);
        setJobStatus(job);
        if (job.status === "COMPLETED" || job.status === "FAILED") {
          setStep("results");
          // Refresh past jobs
          api.getSkiptraceJobs().then(setPastJobs).catch(console.error);
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        setTimeout(poll, 3000);
      }
    };
    poll();
  }, []);

  const statuses = ["", "NEW", "CONTACTED", "NEGOTIATING", "UNDER_CONTRACT", "DEAD"];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Skiptrace</h1>
      <p className="text-sm text-gray-500 mb-6">
        Find phone numbers and emails for your leads automatically. Only leads without existing phone numbers will be processed.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Step: Setup — Pick filters and get estimate */}
      {step === "setup" && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Select Leads to Skiptrace</h2>
            <p className="text-sm text-gray-500 mb-4">
              Use filters to narrow down which leads you want to find contact info for, or leave blank to skiptrace all leads.
            </p>

            <div className="flex gap-4 flex-wrap mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={filters.status || ""}
                  onChange={(e) =>
                    setFilters((f) => {
                      const next = { ...f };
                      if (e.target.value) next.status = e.target.value;
                      else delete next.status;
                      return next;
                    })
                  }
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                >
                  <option value="">All Statuses</option>
                  {statuses.filter(Boolean).map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                <input
                  type="text"
                  placeholder="Filter by city"
                  value={filters.city || ""}
                  onChange={(e) =>
                    setFilters((f) => {
                      const next = { ...f };
                      if (e.target.value) next.city = e.target.value;
                      else delete next.city;
                      return next;
                    })
                  }
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tag</label>
                <input
                  type="text"
                  placeholder="Filter by tag"
                  value={filters.tag || ""}
                  onChange={(e) =>
                    setFilters((f) => {
                      const next = { ...f };
                      if (e.target.value) next.tag = e.target.value;
                      else delete next.tag;
                      return next;
                    })
                  }
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleEstimate}
              disabled={estimating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
            >
              {estimating ? "Calculating..." : "Get Estimate"}
            </button>
          </div>

          {/* Estimate Results */}
          {estimate && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Cost Estimate</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded p-4 text-center">
                  <div className="text-2xl font-bold">{estimate.totalLeads}</div>
                  <div className="text-xs text-gray-500">Total Leads Matching</div>
                </div>
                <div className="bg-green-50 rounded p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{estimate.leadsWithPhones}</div>
                  <div className="text-xs text-gray-500">Already Have Phones</div>
                </div>
                <div className="bg-indigo-50 rounded p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600">{estimate.leadsToSkiptrace}</div>
                  <div className="text-xs text-gray-500">Need Skiptracing</div>
                </div>
                <div className="bg-yellow-50 rounded p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    ${(estimate.estimatedCostCents / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">
                    Estimated Cost (${(estimate.costPerLookupCents / 100).toFixed(2)}/lookup)
                  </div>
                </div>
              </div>

              {estimate.leadsToSkiptrace > 0 ? (
                <button
                  onClick={() => setStep("confirm")}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
                >
                  Continue to Skiptrace
                </button>
              ) : (
                <p className="text-sm text-gray-500">
                  All matching leads already have phone numbers. No skiptracing needed.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step: Confirm — lawful purpose + go */}
      {step === "confirm" && estimate && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Confirm Skiptrace</h2>

          <div className="bg-indigo-50 rounded p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm font-medium">Leads to process:</span>{" "}
                <span className="text-lg font-bold text-indigo-600">{estimate.leadsToSkiptrace}</span>
              </div>
              <div>
                <span className="text-sm font-medium">Estimated cost:</span>{" "}
                <span className="text-lg font-bold text-yellow-600">
                  ${(estimate.estimatedCostCents / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Permissible Purpose
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {PERMISSIBLE_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                I confirm that I have a lawful basis for this data lookup and that the selected
                permissible purpose accurately describes my use of this data.
              </span>
            </label>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => {
                setStep("setup");
                setConfirmed(false);
              }}
              className="px-4 py-2 text-sm border rounded-md"
            >
              Back
            </button>
            <button
              onClick={handleStart}
              disabled={!confirmed}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
            >
              Start Skiptracing
            </button>
          </div>
        </div>
      )}

      {/* Step: Processing — live progress */}
      {step === "processing" && (
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-lg font-semibold mb-4 text-center">Skiptracing in Progress...</h2>

          {jobStatus && (
            <div className="max-w-md mx-auto">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-500 mb-1">
                  <span>
                    {jobStatus.processedCount} of {jobStatus.totalLeads} leads
                  </span>
                  <span>
                    {jobStatus.totalLeads > 0
                      ? Math.round((jobStatus.processedCount / jobStatus.totalLeads) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        jobStatus.totalLeads > 0
                          ? (jobStatus.processedCount / jobStatus.totalLeads) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Live stats */}
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="bg-green-50 rounded p-2">
                  <div className="font-bold text-green-600">{jobStatus.foundCount}</div>
                  <div className="text-xs text-gray-500">Found</div>
                </div>
                <div className="bg-red-50 rounded p-2">
                  <div className="font-bold text-red-600">{jobStatus.errorCount}</div>
                  <div className="text-xs text-gray-500">Errors</div>
                </div>
                <div className="bg-yellow-50 rounded p-2">
                  <div className="font-bold text-yellow-600">
                    ${(jobStatus.costCents / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">Cost So Far</div>
                </div>
              </div>

              <p className="text-xs text-gray-400 text-center mt-4">
                This page updates automatically. Do not close it.
              </p>
            </div>
          )}

          {!jobStatus && (
            <div className="text-center text-gray-500 animate-pulse">Starting...</div>
          )}
        </div>
      )}

      {/* Step: Results */}
      {step === "results" && jobStatus && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            Skiptrace {jobStatus.status === "COMPLETED" ? "Complete" : "Failed"}
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <ResultCard label="Total Processed" value={jobStatus.processedCount} />
            <ResultCard
              label="Phones Found"
              value={jobStatus.foundCount}
              color="text-green-600"
            />
            <ResultCard
              label="Already Had Phone"
              value={jobStatus.alreadyHadCount}
              color="text-blue-600"
            />
            <ResultCard
              label="Errors"
              value={jobStatus.errorCount}
              color="text-red-600"
            />
            <ResultCard
              label="Total Cost"
              value={`$${(jobStatus.costCents / 100).toFixed(2)}`}
              color="text-yellow-600"
            />
          </div>

          {/* Hit rate */}
          {jobStatus.processedCount > 0 && (
            <div className="bg-gray-50 rounded p-4 mb-6 text-center">
              <span className="text-sm text-gray-500">Hit Rate: </span>
              <span className="text-lg font-bold text-indigo-600">
                {Math.round(
                  (jobStatus.foundCount /
                    (jobStatus.processedCount - jobStatus.alreadyHadCount || 1)) *
                    100
                )}
                %
              </span>
              <span className="text-sm text-gray-500"> of lookups returned a phone number</span>
            </div>
          )}

          {/* Errors table */}
          {jobStatus.errors && jobStatus.errors.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-sm mb-2">
                Errors ({jobStatus.errors.length})
              </h3>
              <div className="max-h-60 overflow-y-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Lead</th>
                      <th className="px-3 py-2 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {jobStatus.errors.slice(0, 100).map((err: any, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-1">{err.ownerName}</td>
                        <td className="px-3 py-1 text-red-600">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setStep("setup");
              setEstimate(null);
              setJobStatus(null);
              setConfirmed(false);
              setError("");
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
          >
            Run Another Skiptrace
          </button>
        </div>
      )}

      {/* Past Skiptrace Jobs */}
      {pastJobs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Skiptrace History</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leads</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Found</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pastJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(job.createdAt).toLocaleDateString()}{" "}
                      {new Date(job.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          job.status === "COMPLETED"
                            ? "bg-green-100 text-green-700"
                            : job.status === "FAILED"
                              ? "bg-red-100 text-red-700"
                              : job.status === "PROCESSING"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">{job.totalLeads}</td>
                    <td className="px-4 py-2 text-green-600">{job.foundCount}</td>
                    <td className="px-4 py-2 text-red-600">{job.errorCount}</td>
                    <td className="px-4 py-2">${(job.costCents / 100).toFixed(2)}</td>
                    <td className="px-4 py-2 text-gray-500">{job.user?.name || "—"}</td>
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

function ResultCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="bg-gray-50 rounded p-3 text-center">
      <div className={`text-2xl font-bold ${color || ""}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
