"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";

export default function LeadsPage() {
  return (
    <AuthGuard>
      <LeadsContent />
    </AuthGuard>
  );
}

function LeadsContent() {
  const [leads, setLeads] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { ...filters };
      if (search) params.search = search;
      const data = await api.getLeads(params);
      setLeads(data.leads);
      setPagination(data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleExport = async () => {
    try {
      const csv = await api.exportLeads(filters);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "leads-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Export failed: " + err.message);
    }
  };

  const statuses = ["", "NEW", "CONTACTED", "NEGOTIATING", "UNDER_CONTRACT", "DEAD"];
  const statusColors: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-800",
    CONTACTED: "bg-yellow-100 text-yellow-800",
    NEGOTIATING: "bg-purple-100 text-purple-800",
    UNDER_CONTRACT: "bg-green-100 text-green-800",
    DEAD: "bg-gray-100 text-gray-800",
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Leads</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex gap-4 flex-wrap items-end">
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
          <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <input
            type="text"
            placeholder="Name or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No leads found.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Property</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">City/State</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tags</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contacts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                    >
                      {lead.ownerName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{lead.propertyAddress}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {[lead.city, lead.state].filter(Boolean).join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[lead.status] || ""}`}
                    >
                      {lead.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {lead.tags?.map((lt: any) => (
                        <span
                          key={lt.tag.id}
                          className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700"
                          style={lt.tag.color ? { backgroundColor: lt.tag.color + "20", color: lt.tag.color } : {}}
                        >
                          {lt.tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {lead.contactPoints?.length || 0} points
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex justify-between items-center text-sm text-gray-500">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} leads)
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: String(pagination.page - 1) }))}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: String(pagination.page + 1) }))}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Lead Modal */}
      {showCreate && <CreateLeadModal onClose={() => setShowCreate(false)} onCreated={fetchLeads} />}
    </div>
  );
}

function CreateLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    ownerName: "",
    propertyAddress: "",
    mailingAddress: "",
    city: "",
    state: "",
    zip: "",
    parcelId: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.createLead(form);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">Add New Lead</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            placeholder="Owner Name *"
            value={form.ownerName}
            onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Property Address *"
            value={form.propertyAddress}
            onChange={(e) => setForm((f) => ({ ...f, propertyAddress: e.target.value }))}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Mailing Address"
            value={form.mailingAddress}
            onChange={(e) => setForm((f) => ({ ...f, mailingAddress: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              placeholder="City"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="State"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="ZIP"
              value={form.zip}
              onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="Parcel ID (optional)"
            value={form.parcelId}
            onChange={(e) => setForm((f) => ({ ...f, parcelId: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-md">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
