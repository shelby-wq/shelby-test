const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      if (typeof window !== "undefined") localStorage.setItem("token", token);
    } else {
      if (typeof window !== "undefined") localStorage.removeItem("token");
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("token");
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Don't set Content-Type for FormData (multer needs multipart boundary)
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.setToken(null);
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }

    if (res.status === 204) return undefined as T;

    const contentType = res.headers.get("content-type");
    if (contentType?.includes("text/csv")) {
      return (await res.text()) as T;
    }

    return res.json();
  }

  // Auth
  login(email: string, password: string) {
    return this.request<{ token: string; user: any; organization: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  register(data: { email: string; password: string; name: string; organizationName: string }) {
    return this.request<{ token: string; user: any; organization: any }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  getMe() {
    return this.request<{ user: any; organization: any }>("/auth/me");
  }

  // Dashboard
  getDashboardKpis() {
    return this.request<any>("/dashboard/kpis");
  }

  // Leads
  getLeads(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request<{ leads: any[]; pagination: any }>(`/leads?${qs}`);
  }

  getLead(id: string) {
    return this.request<any>(`/leads/${id}`);
  }

  createLead(data: any) {
    return this.request<any>("/leads", { method: "POST", body: JSON.stringify(data) });
  }

  updateLead(id: string, data: any) {
    return this.request<any>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }

  exportLeads(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request<string>(`/leads/export?${qs}`);
  }

  addTag(leadId: string, name: string) {
    return this.request<any>(`/leads/${leadId}/tags`, { method: "POST", body: JSON.stringify({ name }) });
  }

  removeTag(leadId: string, tagId: string) {
    return this.request<void>(`/leads/${leadId}/tags/${tagId}`, { method: "DELETE" });
  }

  // Import
  uploadCsv(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return this.request<{ importJobId: string; headers: string[]; filePath: string }>(
      "/import/upload",
      { method: "POST", body: formData }
    );
  }

  startImport(data: { importJobId: string; filePath: string; mapping: any }) {
    return this.request<any>("/import/start", { method: "POST", body: JSON.stringify(data) });
  }

  getImportJob(id: string) {
    return this.request<any>(`/import/${id}`);
  }

  getImportJobs() {
    return this.request<any[]>("/import");
  }

  // Enrichment
  getPermissiblePurposes() {
    return this.request<{ purposes: string[] }>("/enrichment/purposes");
  }

  requestEnrichment(data: { leadId: string; permissiblePurpose: string; confirmLawfulBasis: true }) {
    return this.request<any>("/enrichment/request", { method: "POST", body: JSON.stringify(data) });
  }

  getEnrichmentStatus(id: string) {
    return this.request<any>(`/enrichment/${id}`);
  }

  // Communications
  createCommunication(data: any) {
    return this.request<any>("/communications", { method: "POST", body: JSON.stringify(data) });
  }

  // Contact Points
  createContactPoint(data: any) {
    return this.request<any>("/contact-points", { method: "POST", body: JSON.stringify(data) });
  }

  updateContactPoint(id: string, data: any) {
    return this.request<any>(`/contact-points/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }

  // Skiptrace
  skiptraceEstimate(data: { leadIds?: string[]; filters?: { status?: string; city?: string; tag?: string } }) {
    return this.request<{
      totalLeads: number;
      leadsWithPhones: number;
      leadsToSkiptrace: number;
      costPerLookupCents: number;
      estimatedCostCents: number;
    }>("/skiptrace/estimate", { method: "POST", body: JSON.stringify(data) });
  }

  skiptraceStart(data: {
    leadIds?: string[];
    filters?: { status?: string; city?: string; tag?: string };
    permissiblePurpose: string;
    confirmLawfulBasis: true;
  }) {
    return this.request<any>("/skiptrace/start", { method: "POST", body: JSON.stringify(data) });
  }

  getSkiptraceJob(id: string) {
    return this.request<any>(`/skiptrace/${id}`);
  }

  getSkiptraceJobs() {
    return this.request<any[]>("/skiptrace");
  }

  // Settings
  getSettings() {
    return this.request<any>("/settings");
  }

  updateOrganization(data: any) {
    return this.request<any>("/settings/organization", { method: "PATCH", body: JSON.stringify(data) });
  }

  getAuditLog(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request<any>(`/settings/audit-log?${qs}`);
  }
}

export const api = new ApiClient();
