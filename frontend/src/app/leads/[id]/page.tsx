"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";

export default function LeadDetailPage() {
  return (
    <AuthGuard>
      <LeadDetailContent />
    </AuthGuard>
  );
}

function LeadDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [showEnrichModal, setShowEnrichModal] = useState(false);
  const [showCommForm, setShowCommForm] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);

  const fetchLead = useCallback(async () => {
    try {
      const data = await api.getLead(id);
      setLead(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.updateLead(id, { status: newStatus });
      fetchLead();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleNotesChange = async (notes: string) => {
    try {
      await api.updateLead(id, { notes });
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-gray-500">Loading lead...</div>;
  if (!lead) return <div className="text-red-500">Lead not found.</div>;

  const statuses = ["NEW", "CONTACTED", "NEGOTIATING", "UNDER_CONTRACT", "DEAD"];
  const statusColors: Record<string, string> = {
    NEW: "bg-blue-500",
    CONTACTED: "bg-yellow-500",
    NEGOTIATING: "bg-purple-500",
    UNDER_CONTRACT: "bg-green-500",
    DEAD: "bg-gray-400",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <button onClick={() => router.push("/leads")} className="text-sm text-gray-500 hover:text-gray-700 mb-2">
            &larr; Back to Leads
          </button>
          <h1 className="text-2xl font-bold">{lead.ownerName}</h1>
          <p className="text-gray-600">{lead.propertyAddress}</p>
          {lead.city && (
            <p className="text-gray-500 text-sm">
              {[lead.city, lead.state, lead.zip].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowEnrichModal(true)}
          className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
        >
          Enrich Lead
        </button>
      </div>

      {/* Pipeline Status */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Pipeline Status</h3>
        <div className="flex gap-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`flex-1 py-2 text-xs font-medium rounded transition-colors ${
                lead.status === s
                  ? `${statusColors[s]} text-white`
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details + Contact Points */}
        <div className="lg:col-span-1 space-y-6">
          {/* Details */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Mailing Address</dt>
                <dd>{lead.mailingAddress || "N/A"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Parcel ID</dt>
                <dd>{lead.parcelId || "N/A"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Last Touched</dt>
                <dd>{lead.lastTouchedAt ? new Date(lead.lastTouchedAt).toLocaleDateString() : "Never"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd>{new Date(lead.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>

            {/* Tags */}
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-500 mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1">
                {lead.tags?.map((lt: any) => (
                  <span
                    key={lt.tag.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100"
                    style={lt.tag.color ? { backgroundColor: lt.tag.color + "20", color: lt.tag.color } : {}}
                  >
                    {lt.tag.name}
                    <button
                      onClick={async () => {
                        await api.removeTag(lead.id, lt.tag.id);
                        fetchLead();
                      }}
                      className="ml-1 hover:opacity-70"
                    >
                      x
                    </button>
                  </span>
                ))}
                <AddTagButton leadId={lead.id} onAdded={fetchLead} />
              </div>
            </div>
          </div>

          {/* Contact Points */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Contact Points</h3>
              <button
                onClick={() => setShowAddContact(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                + Add
              </button>
            </div>
            {lead.contactPoints?.length === 0 ? (
              <p className="text-sm text-gray-500">No contact points yet.</p>
            ) : (
              <ul className="space-y-2">
                {lead.contactPoints?.map((cp: any) => (
                  <li key={cp.id} className="border rounded p-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{cp.value}</span>
                      <span className="text-xs text-gray-400">{cp.type}</span>
                    </div>
                    <div className="flex gap-2 mt-1 text-xs text-gray-500">
                      <span>Source: {cp.source}</span>
                      {cp.confidenceScore && <span>Confidence: {(cp.confidenceScore * 100).toFixed(0)}%</span>}
                    </div>
                    <div className="flex gap-2 mt-1">
                      {cp.dncFlag && (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">DNC</span>
                      )}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          cp.consentStatus === "GRANTED"
                            ? "bg-green-100 text-green-700"
                            : cp.consentStatus === "REVOKED"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        Consent: {cp.consentStatus}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Enrichment History */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3">Enrichment History</h3>
            {lead.enrichmentRequests?.length === 0 ? (
              <p className="text-sm text-gray-500">No enrichment requests.</p>
            ) : (
              <ul className="space-y-2">
                {lead.enrichmentRequests?.map((er: any) => (
                  <li key={er.id} className="border rounded p-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{er.provider}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          er.status === "COMPLETED"
                            ? "bg-green-100 text-green-700"
                            : er.status === "FAILED"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {er.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Purpose: {er.permissiblePurpose}
                    </div>
                    <div className="text-xs text-gray-400">
                      By {er.requestedBy?.name} on {new Date(er.requestedAt).toLocaleDateString()}
                      {er.costCents != null && ` | Cost: $${(er.costCents / 100).toFixed(2)}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Timeline + Notes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notes */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-2">Notes</h3>
            <textarea
              defaultValue={lead.notes || ""}
              onBlur={(e) => handleNotesChange(e.target.value)}
              placeholder="Add notes about this lead..."
              className="w-full h-24 border border-gray-200 rounded p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Communications Timeline */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Communications</h3>
              <button
                onClick={() => setShowCommForm(true)}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                + Log Communication
              </button>
            </div>
            {lead.communications?.length === 0 ? (
              <p className="text-sm text-gray-500">No communications logged.</p>
            ) : (
              <div className="space-y-3">
                {lead.communications?.map((comm: any) => (
                  <div key={comm.id} className="border-l-2 border-indigo-300 pl-3 py-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                          {comm.channel}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          {comm.direction === "OUTBOUND" ? "Outbound" : "Inbound"}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(comm.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {comm.summary && <p className="text-sm mt-1">{comm.summary}</p>}
                    {comm.body && <p className="text-sm text-gray-600 mt-1">{comm.body}</p>}
                    {comm.outcome && (
                      <p className="text-xs text-gray-500 mt-1">Outcome: {comm.outcome}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">by {comm.user?.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showEnrichModal && (
        <EnrichModal
          leadId={lead.id}
          onClose={() => setShowEnrichModal(false)}
          onCompleted={fetchLead}
        />
      )}
      {showCommForm && (
        <CommunicationModal
          leadId={lead.id}
          onClose={() => setShowCommForm(false)}
          onCreated={fetchLead}
        />
      )}
      {showAddContact && (
        <AddContactModal
          leadId={lead.id}
          onClose={() => setShowAddContact(false)}
          onCreated={fetchLead}
        />
      )}
    </div>
  );
}

function AddTagButton({ leadId, onAdded }: { leadId: string; onAdded: () => void }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="text-xs text-indigo-600 hover:text-indigo-800"
      >
        + tag
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        await api.addTag(leadId, value.trim());
        setValue("");
        setAdding(false);
        onAdded();
      }}
      className="inline-flex gap-1"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tag name"
        autoFocus
        className="w-24 text-xs border rounded px-1 py-0.5"
      />
      <button type="submit" className="text-xs text-green-600">
        OK
      </button>
      <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-400">
        X
      </button>
    </form>
  );
}

function EnrichModal({
  leadId,
  onClose,
  onCompleted,
}: {
  leadId: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [purposes, setPurposes] = useState<string[]>([]);
  const [selectedPurpose, setSelectedPurpose] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getPermissiblePurposes().then((data) => setPurposes(data.purposes));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      setError("You must confirm lawful basis");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.requestEnrichment({
        leadId,
        permissiblePurpose: selectedPurpose,
        confirmLawfulBasis: true,
      });
      onCompleted();
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
        <h2 className="text-lg font-bold mb-4">Enrich Lead</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Permissible Purpose *
            </label>
            <select
              value={selectedPurpose}
              onChange={(e) => setSelectedPurpose(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select a purpose...</option>
              {purposes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I confirm that I have a lawful basis and/or consumer consent to request
                enrichment data for this lead, in compliance with applicable data protection laws
                (FCRA, TCPA, CCPA, etc.).
              </span>
            </label>
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-md">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !confirmed || !selectedPurpose}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-md disabled:opacity-50"
            >
              {submitting ? "Requesting..." : "Request Enrichment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CommunicationModal({
  leadId,
  onClose,
  onCreated,
}: {
  leadId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    channel: "CALL",
    direction: "OUTBOUND",
    summary: "",
    body: "",
    outcome: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createCommunication({ ...form, leadId });
      onCreated();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">Log Communication</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Channel</label>
              <select
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="CALL">Call</option>
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Direction</label>
              <select
                value={form.direction}
                onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
              </select>
            </div>
          </div>
          <input
            placeholder="Summary"
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Details/Body"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm h-20 resize-none"
          />
          <input
            placeholder="Outcome"
            value={form.outcome}
            onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-md">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddContactModal({
  leadId,
  onClose,
  onCreated,
}: {
  leadId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    type: "PHONE",
    value: "",
    consentStatus: "UNKNOWN",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createContactPoint({ ...form, leadId, source: "manual" });
      onCreated();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">Add Contact Point</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="PHONE">Phone</option>
            <option value="EMAIL">Email</option>
          </select>
          <input
            placeholder={form.type === "PHONE" ? "Phone number" : "Email address"}
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={form.consentStatus}
            onChange={(e) => setForm((f) => ({ ...f, consentStatus: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="UNKNOWN">Consent: Unknown</option>
            <option value="GRANTED">Consent: Granted</option>
            <option value="REVOKED">Consent: Revoked</option>
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-md">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
