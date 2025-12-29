"use client";

import { useEffect, useState } from "react";
import { tenantApi, AdminApiError } from "@/lib/admin/api";
import type { TenantData } from "@/lib/admin/api";

interface BrandingForm {
  productName: string;
  logoUrl: string;
  accentColor: string;
  shareBaseUrl: string;
  howItWorks: string;
}

export default function BrandingPage() {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [form, setForm] = useState<BrandingForm>({
    productName: "",
    logoUrl: "",
    accentColor: "#3B82F6",
    shareBaseUrl: "",
    howItWorks: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await tenantApi.get();
        setTenant(res.tenant);

        const branding = res.tenant.brandingJson || {};
        const settings = res.tenant.referralSettingsJson || {};

        setForm({
          productName: (branding.productName as string) || "",
          logoUrl: (branding.logoUrl as string) || "",
          accentColor: (branding.accentColor as string) || "#3B82F6",
          shareBaseUrl: (settings.shareBaseUrl as string) || "",
          howItWorks: Array.isArray(settings.howItWorks)
            ? (settings.howItWorks as string[]).join("\n")
            : "",
        });
      } catch (err) {
        if (err instanceof AdminApiError) {
          setError(err.message);
        } else {
          setError("Failed to load branding data");
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const howItWorksArray = form.howItWorks
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await tenantApi.updateBranding({
        brandingJson: {
          productName: form.productName || undefined,
          logoUrl: form.logoUrl || undefined,
          accentColor: form.accentColor || undefined,
        },
        referralSettingsJson: {
          shareBaseUrl: form.shareBaseUrl || undefined,
          howItWorks: howItWorksArray.length > 0 ? howItWorksArray : undefined,
        },
      });

      setTenant(res.tenant);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to save branding");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48"></div>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Branding</h1>
        <p className="text-gray-600 mt-1">
          Customize how your referral program appears to users
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">Branding saved successfully</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-medium text-gray-900">
            Brand Identity
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Product Name
            </label>
            <input
              type="text"
              value={form.productName}
              onChange={(e) =>
                setForm({ ...form, productName: e.target.value })
              }
              placeholder="Your Product Name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-sm text-gray-500 mt-1">
              Displayed in the embed widget header
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Logo URL
            </label>
            <input
              type="url"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-sm text-gray-500 mt-1">
              HTTPS URL to your logo image
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Accent Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) =>
                  setForm({ ...form, accentColor: e.target.value })
                }
                className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={form.accentColor}
                onChange={(e) =>
                  setForm({ ...form, accentColor: e.target.value })
                }
                placeholder="#3B82F6"
                className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
              />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Primary color for buttons and highlights
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-medium text-gray-900">
            Referral Settings
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Share Base URL
            </label>
            <input
              type="url"
              value={form.shareBaseUrl}
              onChange={(e) =>
                setForm({ ...form, shareBaseUrl: e.target.value })
              }
              placeholder="https://yourapp.com/ref"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-sm text-gray-500 mt-1">
              Base URL for referral links (code will be appended)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How It Works Steps
            </label>
            <textarea
              value={form.howItWorks}
              onChange={(e) =>
                setForm({ ...form, howItWorks: e.target.value })
              }
              placeholder="Share your unique link with friends&#10;They sign up using your link&#10;You both earn rewards"
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
            <p className="text-sm text-gray-500 mt-1">
              One step per line. Displayed in the embed widget.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white py-2 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
