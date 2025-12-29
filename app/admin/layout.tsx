"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasApiKey, clearApiKey, setApiKey } from "@/lib/admin/api";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/branding", label: "Branding", icon: "🎨" },
  { href: "/admin/rewards", label: "Reward Rules", icon: "🎁" },
  { href: "/admin/webhooks", label: "Webhooks", icon: "🔗" },
  { href: "/admin/api-keys", label: "API Keys", icon: "🔑" },
  { href: "/admin/events", label: "Events", icon: "📋" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const params = new URLSearchParams(window.location.search);
      const queryKey = params.get("apiKey");
      if (queryKey) {
        setApiKey(queryKey);
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }
    }

    setIsAuthenticated(hasApiKey());
    setIsLoading(false);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setIsAuthenticated(true);
      setApiKeyInput("");
    }
  };

  const handleLogout = () => {
    clearApiKey();
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              ReferralOS Admin
            </h1>
            <p className="text-gray-600 mb-6">
              Enter your API key to access the admin panel.
            </p>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="rk_live_..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-4 font-mono text-sm"
                autoFocus
              />
              <button
                type="submit"
                disabled={!apiKeyInput.trim()}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Sign In
              </button>
            </form>
            <p className="text-xs text-gray-500 mt-4 text-center">
              API key must have admin:read or admin:write scope
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/admin" className="text-xl font-semibold text-gray-900">
                ReferralOS
              </Link>
              <span className="ml-3 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                Admin
              </span>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          <aside className="w-56 flex-shrink-0">
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
