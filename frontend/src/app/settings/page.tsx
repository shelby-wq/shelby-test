"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}

function SettingsContent() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"org" | "compliance" | "audit">("org");

  const tabs = [
    { key: "org", label: "Organization" },
    { key: "compliance", label: "Compliance" },
    ...(user?.role === "ADMIN" ? [{ key: "audit", label: "Audit Log" }] : []),
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`pb-2 text-sm font-medium border-b-2 ${
                tab === t.key
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "org" && <OrgSettings />}
      {tab === "compliance" && <ComplianceSettings />}
      {tab === "audit" && <AuditLogView />}
    </div>
  );
}

function OrgSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [form, setForm] = useState({ name: "", a2pBrand: "", a2pCampaignId: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getSettings().then((data) => {
      setSettings(data);
      setForm({
        name: data.organization.name || "",
        a2pBrand: data.organization.a2pBrand || "",
        a2pCampaignId: data.organization.a2pCampaignId || "",
      });
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.updateOrganization(form);
      setMessage("Settings saved.");
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-lg">
      <h2 className="text-lg font-semibold mb-4">Organization Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">A2P Brand Name</label>
          <input
            value={form.a2pBrand}
            onChange={(e) => setForm((f) => ({ ...f, a2pBrand: e.target.value }))}
            placeholder="Your registered brand name"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            Register your brand with your messaging provider for A2P 10DLC compliance.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">A2P Campaign ID</label>
          <input
            value={form.a2pCampaignId}
            onChange={(e) => setForm((f) => ({ ...f, a2pCampaignId: e.target.value }))}
            placeholder="CAMP-XXXXX"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {message && (
          <div className={`text-sm ${message.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
            {message}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function ComplianceSettings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Compliance Configuration</h2>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
            <h3 className="font-medium text-blue-800 mb-2">DNC (Do Not Call) List</h3>
            <p className="text-blue-700">
              Contact points flagged as DNC will block outbound SMS and calls.
              Only admins can override DNC flags, and all overrides are logged
              in the audit trail.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
            <h3 className="font-medium text-blue-800 mb-2">SMS Consent Tracking</h3>
            <p className="text-blue-700">
              Each contact point tracks consent status (Granted / Revoked / Unknown).
              The system warns when sending SMS to contacts without explicit consent.
              Consent status changes are logged in the audit trail.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
            <h3 className="font-medium text-blue-800 mb-2">Enrichment Compliance</h3>
            <p className="text-blue-700">
              All enrichment requests require a permissible purpose attestation.
              Bulk enrichment is not available — each lead must be enriched
              individually with explicit user action and purpose logged.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
            <h3 className="font-medium text-blue-800 mb-2">A2P 10DLC</h3>
            <p className="text-blue-700">
              Configure your A2P brand and campaign ID in Organization settings.
              These are included with all outbound SMS requests to ensure carrier
              compliance.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Enrichment Provider</h2>
        <p className="text-sm text-gray-500 mb-4">
          Configure your authorized enrichment provider via environment variables.
          The system uses a mock provider by default for development.
        </p>
        <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-600 space-y-1">
          <div>ENRICHMENT_PROVIDER_NAME=&quot;your-provider&quot;</div>
          <div>ENRICHMENT_PROVIDER_API_KEY=&quot;your-api-key&quot;</div>
          <div>ENRICHMENT_PROVIDER_BASE_URL=&quot;https://api.provider.com&quot;</div>
        </div>
      </div>
    </div>
  );
}

function AuditLogView() {
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api
      .getAuditLog({ page: String(page), limit: "25" })
      .then((data) => {
        setLogs(data.logs);
        setPagination(data.pagination);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <div className="text-gray-500">Loading audit log...</div>;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actor</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                {new Date(log.timestamp).toLocaleString()}
              </td>
              <td className="px-4 py-2">{log.actor?.name || "System"}</td>
              <td className="px-4 py-2">
                <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                  {log.action}
                </span>
              </td>
              <td className="px-4 py-2 text-gray-600">{log.entity}</td>
              <td className="px-4 py-2 text-xs text-gray-400 max-w-xs truncate">
                {log.after ? JSON.stringify(log.after) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pagination.totalPages > 1 && (
        <div className="px-4 py-3 border-t flex justify-between items-center text-sm text-gray-500">
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
