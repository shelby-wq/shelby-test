"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";

interface KpiData {
  totalLeads: number;
  leadsByStatus: Record<string, number>;
  contactedToday: number;
  totalCommunications: number;
  conversionRate: number;
  responseRate: number;
  recentEnrichments: number;
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDashboardKpis()
      .then(setKpis)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500">Loading dashboard...</div>;
  if (!kpis) return <div className="text-red-500">Failed to load dashboard data.</div>;

  const statusLabels: Record<string, string> = {
    NEW: "New",
    CONTACTED: "Contacted",
    NEGOTIATING: "Negotiating",
    UNDER_CONTRACT: "Under Contract",
    DEAD: "Dead",
  };

  const statusColors: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-800",
    CONTACTED: "bg-yellow-100 text-yellow-800",
    NEGOTIATING: "bg-purple-100 text-purple-800",
    UNDER_CONTRACT: "bg-green-100 text-green-800",
    DEAD: "bg-gray-100 text-gray-800",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total Leads" value={kpis.totalLeads} />
        <KpiCard label="Contacted Today" value={kpis.contactedToday} />
        <KpiCard label="Conversion Rate" value={`${kpis.conversionRate}%`} />
        <KpiCard label="Response Rate" value={`${kpis.responseRate}%`} />
      </div>

      {/* Pipeline */}
      <h2 className="text-lg font-semibold mb-4">Lead Pipeline</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {Object.entries(statusLabels).map(([status, label]) => (
          <div
            key={status}
            className={`rounded-lg p-4 text-center ${statusColors[status]}`}
          >
            <div className="text-2xl font-bold">{kpis.leadsByStatus[status] || 0}</div>
            <div className="text-sm font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Communications</h3>
          <div className="text-3xl font-bold">{kpis.totalCommunications}</div>
          <p className="text-sm text-gray-500 mt-1">Total logged communications</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Enrichments (30d)</h3>
          <div className="text-3xl font-bold">{kpis.recentEnrichments}</div>
          <p className="text-sm text-gray-500 mt-1">Enrichment requests in the last 30 days</p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
