"use client";

import { useEffect, useState } from "react";
import { rulesApi, AdminApiError } from "@/lib/admin/api";
import type { RewardRule } from "@/lib/admin/api";

export default function RewardsPage() {
  const [rules, setRules] = useState<RewardRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    enabled: boolean;
    conditionJson: string;
    rewardReferrerJson: string;
    rewardReferredJson: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    try {
      const res = await rulesApi.list();
      setRules(res.rules);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to load reward rules");
      }
    } finally {
      setLoading(false);
    }
  }

  const startEditing = (rule: RewardRule) => {
    setEditingRule(rule.id);
    setEditForm({
      enabled: rule.enabled,
      conditionJson: JSON.stringify(rule.conditionJson || {}, null, 2),
      rewardReferrerJson: JSON.stringify(rule.rewardReferrerJson || {}, null, 2),
      rewardReferredJson: JSON.stringify(rule.rewardReferredJson || {}, null, 2),
    });
  };

  const cancelEditing = () => {
    setEditingRule(null);
    setEditForm(null);
  };

  const saveRule = async (ruleId: string) => {
    if (!editForm) return;

    setSaving(true);
    setError(null);

    try {
      let conditionJson, rewardReferrerJson, rewardReferredJson;

      try {
        conditionJson = JSON.parse(editForm.conditionJson);
      } catch {
        setError("Invalid JSON in Condition");
        setSaving(false);
        return;
      }

      try {
        rewardReferrerJson = JSON.parse(editForm.rewardReferrerJson);
      } catch {
        setError("Invalid JSON in Referrer Reward");
        setSaving(false);
        return;
      }

      try {
        rewardReferredJson = JSON.parse(editForm.rewardReferredJson);
      } catch {
        setError("Invalid JSON in Referred Reward");
        setSaving(false);
        return;
      }

      await rulesApi.update(ruleId, {
        enabled: editForm.enabled,
        conditionJson,
        rewardReferrerJson,
        rewardReferredJson,
      });

      await loadRules();
      setEditingRule(null);
      setEditForm(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to save rule");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (rule: RewardRule) => {
    try {
      await rulesApi.update(rule.id, { enabled: !rule.enabled });
      await loadRules();
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to toggle rule");
      }
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48"></div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Reward Rules</h1>
        <p className="text-gray-600 mt-1">
          Configure how rewards are distributed for referrals
        </p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 text-sm">
          Changes to reward rules affect future referrals only. Existing rewards are not modified.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">Rule saved successfully</p>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No reward rules configured</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      {rule.ruleKey}
                    </h3>
                    <button
                      onClick={() => toggleEnabled(rule)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        rule.enabled ? "bg-blue-600" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          rule.enabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span
                      className={`text-sm ${
                        rule.enabled ? "text-green-600" : "text-gray-500"
                      }`}
                    >
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  {editingRule !== rule.id && (
                    <button
                      onClick={() => startEditing(rule)}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {editingRule === rule.id && editForm ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Condition JSON
                      </label>
                      <textarea
                        value={editForm.conditionJson}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            conditionJson: e.target.value,
                          })
                        }
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Referrer Reward JSON
                      </label>
                      <textarea
                        value={editForm.rewardReferrerJson}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            rewardReferrerJson: e.target.value,
                          })
                        }
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Referred Reward JSON
                      </label>
                      <textarea
                        value={editForm.rewardReferredJson}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            rewardReferredJson: e.target.value,
                          })
                        }
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={cancelEditing}
                        className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveRule(rule.id)}
                        disabled={saving}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                        Condition
                      </p>
                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-24">
                        {JSON.stringify(rule.conditionJson || {}, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                        Referrer Reward
                      </p>
                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-24">
                        {JSON.stringify(rule.rewardReferrerJson || {}, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                        Referred Reward
                      </p>
                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-24">
                        {JSON.stringify(rule.rewardReferredJson || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
