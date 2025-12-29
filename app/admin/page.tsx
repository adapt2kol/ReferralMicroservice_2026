"use client";

import { useEffect, useState } from "react";
import { tenantApi, AdminApiError } from "@/lib/admin/api";
import type { TenantData, TenantStats } from "@/lib/admin/api";

interface DashboardData {
  tenant: TenantData | null;
  stats: TenantStats | null;
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData>({ tenant: null, stats: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [tenantRes, statsRes] = await Promise.all([
          tenantApi.get(),
          tenantApi.getStats(),
        ]);
        setData({
          tenant: tenantRes.tenant,
          stats: statsRes.stats,
        });
      } catch (err) {
        if (err instanceof AdminApiError) {
          setError(err.message);
        } else {
          setError("Failed to load dashboard data");
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  const { tenant, stats } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Overview of your referral program
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">
              {tenant?.name || "Tenant"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Slug: <code className="bg-gray-100 px-2 py-0.5 rounded">{tenant?.slug}</code>
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              tenant?.status === "active"
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {tenant?.status || "unknown"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Users"
          value={stats?.totalUsers || 0}
          icon="👥"
        />
        <StatCard
          label="Total Referrals"
          value={stats?.totalReferrals || 0}
          icon="🔗"
        />
        <StatCard
          label="Completed"
          value={stats?.completedReferrals || 0}
          icon="✅"
          highlight
        />
        <StatCard
          label="Pending"
          value={stats?.pendingReferrals || 0}
          icon="⏳"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Webhook Status
          </h3>
          {tenant?.webhookUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="text-sm text-gray-700">Configured</span>
              </div>
              <p className="text-sm text-gray-500 font-mono truncate">
                {tenant.webhookUrl}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
              <span className="text-sm text-gray-700">Not configured</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="space-y-2">
            <a
              href="/admin/branding"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Configure branding →
            </a>
            <a
              href="/admin/rewards"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Manage reward rules →
            </a>
            <a
              href="/admin/api-keys"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Create API key →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-6 ${
        highlight
          ? "bg-blue-50 border-blue-200"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-gray-900">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-sm text-gray-600">{label}</p>
    </div>
  );
}
