"use client";

import { useEffect, useState } from "react";
import { eventsApi, AdminApiError } from "@/lib/admin/api";
import type { EventData } from "@/lib/admin/api";

const EVENT_TYPES = [
  { value: "", label: "All Events" },
  { value: "referral.created", label: "Referral Created" },
  { value: "referral.completed", label: "Referral Completed" },
  { value: "reward.awarded", label: "Reward Awarded" },
  { value: "api_key.created", label: "API Key Created" },
  { value: "api_key.revoked", label: "API Key Revoked" },
  { value: "tenant.branding.updated", label: "Branding Updated" },
  { value: "tenant.rules.updated", label: "Rules Updated" },
  { value: "tenant.webhook.updated", label: "Webhook Updated" },
];

export default function EventsPage() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const limit = 20;

  useEffect(() => {
    loadEvents();
  }, [typeFilter, page]);

  async function loadEvents() {
    setLoading(true);
    setError(null);

    try {
      const res = await eventsApi.list({
        type: typeFilter || undefined,
        limit,
        offset: page * limit,
      });
      setEvents(res.events);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("Failed to load events");
      }
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getEventTypeColor = (type: string) => {
    if (type.startsWith("referral.")) return "bg-blue-100 text-blue-700";
    if (type.startsWith("reward.")) return "bg-green-100 text-green-700";
    if (type.startsWith("api_key.")) return "bg-purple-100 text-purple-700";
    if (type.startsWith("tenant.")) return "bg-orange-100 text-orange-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Event Log</h1>
        <p className="text-gray-600 mt-1">
          View all events for your tenant
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter by type:</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(0);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            {EVENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-gray-500">
          {total} total events
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No events found</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {events.map((event) => (
              <div key={event.id} className="p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() =>
                    setExpandedEvent(
                      expandedEvent === event.id ? null : event.id
                    )
                  }
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getEventTypeColor(
                        event.type
                      )}`}
                    >
                      {event.type}
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatDate(event.createdAt)}
                    </span>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600">
                    {expandedEvent === event.id ? "▲" : "▼"}
                  </button>
                </div>

                {expandedEvent === event.id && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                      Event Payload
                    </p>
                    <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-auto max-h-64">
                      {JSON.stringify(event.payloadJson, null, 2)}
                    </pre>
                    <p className="text-xs text-gray-400 mt-2">
                      Event ID: {event.id}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
