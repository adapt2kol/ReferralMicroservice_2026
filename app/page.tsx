export default function Home(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">ReferralOS</h1>
        <p className="mt-2 text-gray-600">Multi-tenant referral microservice</p>
        <p className="mt-4 text-sm text-gray-500">
          Health check:{" "}
          <code className="rounded bg-gray-200 px-2 py-1">/api/v1/health</code>
        </p>
      </div>
    </main>
  );
}
