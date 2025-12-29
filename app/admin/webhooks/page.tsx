"use client";

import { useEffect, useState } from "react";
import { tenantApi, webhooksApi, AdminApiError } from "@/lib/admin/api";
import type { TenantData } from "@/lib/admin/api";

export default function WebhooksPage() {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await tenantApi.get();
        setTenant(res.tenant);
        setWebhookUrl(res.tenant.webhookUrl || "");
      } catch (err) {
        if (err instanceof AdminApiError) {
          setError(err.message);
        } else {
          setError("Failed to load webhook configuration");
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await tenantApi.updateWebhook({
        webhookUrl: webhookUrl.trim() || null,
      });
      setTenant(res.tenant);
      setSuccess("Webhook URL saved successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to save webhook URL");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!tenant?.webhookUrl) {
      setError("Please save a webhook URL first");
      return;
    }

    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await webhooksApi.test();
      setSuccess(`Test webhook sent successfully (Event ID: ${res.eventId})`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to send test webhook");
      }
    } finally {
      setTesting(false);
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
        <h1 className="text-2xl font-semibold text-gray-900">Webhooks</h1>
        <p className="text-gray-600 mt-1">
          Configure webhook delivery for referral events
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">{success}</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <span
            className={`w-3 h-3 rounded-full ${
              tenant?.webhookUrl ? "bg-green-500" : "bg-gray-300"
            }`}
          ></span>
          <span className="text-sm font-medium text-gray-700">
            {tenant?.webhookUrl ? "Webhook configured" : "No webhook configured"}
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Webhook URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-app.com/api/webhooks/referralos"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-sm text-gray-500 mt-1">
              HTTPS endpoint to receive webhook events. Must be publicly accessible.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white py-2 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !tenant?.webhookUrl}
              className="bg-gray-100 text-gray-700 py-2 px-6 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? "Sending..." : "Send Test Webhook"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Webhook Events
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          The following events will be sent to your webhook endpoint:
        </p>
        <div className="space-y-3">
          <EventType
            name="referral.created"
            description="A new referral has been created"
          />
          <EventType
            name="referral.completed"
            description="A referral has been completed and rewards issued"
          />
          <EventType
            name="reward.awarded"
            description="A reward has been awarded to a user"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Webhook Security
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          All webhooks are signed with HMAC-SHA256. Verify the signature using the{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">
            X-ReferralOS-Signature
          </code>{" "}
          header.
        </p>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-2">
            Signature Format
          </p>
          <code className="text-sm text-gray-800">
            HMAC-SHA256(timestamp.payload, webhook_secret)
          </code>
        </div>
      </div>
    </div>
  );
}

function EventType({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <code className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm font-medium">
        {name}
      </code>
      <span className="text-sm text-gray-600 pt-0.5">{description}</span>
    </div>
  );
}
