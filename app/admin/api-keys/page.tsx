"use client";

import { useEffect, useState } from "react";
import { apiKeysApi, AdminApiError, maskKey } from "@/lib/admin/api";
import type { ApiKeyData, ApiKeyCreateResult } from "@/lib/admin/api";

const AVAILABLE_SCOPES = [
  { value: "read", label: "Read", description: "Read referrals and users" },
  { value: "write", label: "Write", description: "Create and update referrals" },
  { value: "admin:read", label: "Admin Read", description: "View admin settings" },
  { value: "admin:write", label: "Admin Write", description: "Modify admin settings" },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<ApiKeyCreateResult | null>(null);
  const [createForm, setCreateForm] = useState({
    label: "",
    scopes: [] as string[],
  });
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const res = await apiKeysApi.list();
      setKeys(res.apiKeys);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to load API keys");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.label.trim() || createForm.scopes.length === 0) {
      setError("Label and at least one scope are required");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const result = await apiKeysApi.create({
        label: createForm.label.trim(),
        scopes: createForm.scopes,
      });
      setNewKeyResult(result);
      setShowCreate(false);
      setCreateForm({ label: "", scopes: [] });
      await loadKeys();
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to create API key");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      return;
    }

    setRevoking(keyId);
    setError(null);

    try {
      await apiKeysApi.revoke(keyId);
      await loadKeys();
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to revoke API key");
      }
    } finally {
      setRevoking(null);
    }
  };

  const toggleScope = (scope: string) => {
    setCreateForm((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48"></div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
          <p className="text-gray-600 mt-1">
            Manage API keys for accessing the ReferralOS API
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Create API Key
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {newKeyResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-green-900 mb-2">
            API Key Created
          </h3>
          <p className="text-sm text-green-700 mb-4">
            Copy your API key now. You will not be able to see it again.
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-white border border-green-300 px-4 py-2 rounded font-mono text-sm">
              {newKeyResult.key}
            </code>
            <button
              onClick={() => copyToClipboard(newKeyResult.key)}
              className="bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setNewKeyResult(null)}
            className="mt-4 text-sm text-green-700 hover:text-green-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {showCreate && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Create New API Key
          </h2>
          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Label
              </label>
              <input
                type="text"
                value={createForm.label}
                onChange={(e) =>
                  setCreateForm({ ...createForm, label: e.target.value })
                }
                placeholder="Production API Key"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <p className="text-sm text-gray-500 mt-1">
                A descriptive name to identify this key
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scopes
              </label>
              <div className="space-y-2">
                {AVAILABLE_SCOPES.map((scope) => (
                  <label
                    key={scope.value}
                    className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={createForm.scopes.includes(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{scope.label}</p>
                      <p className="text-sm text-gray-500">{scope.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setCreateForm({ label: "", scopes: [] });
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !createForm.label.trim() || createForm.scopes.length === 0}
                className="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? "Creating..." : "Create Key"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                Label
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                Scopes
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {keys.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No API keys found
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className={key.revokedAt ? "bg-gray-50" : ""}>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{key.label}</p>
                    <p className="text-xs text-gray-500 font-mono">
                      {key.id.slice(0, 8)}...
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    {key.revokedAt ? (
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                        Revoked
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!key.revokedAt && (
                      <button
                        onClick={() => handleRevoke(key.id)}
                        disabled={revoking === key.id}
                        className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        {revoking === key.id ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 text-sm">
          API keys are sensitive credentials. Never share them publicly or commit them to version control.
          Revoked keys cannot be restored.
        </p>
      </div>
    </div>
  );
}
