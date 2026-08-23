"use client";
import { useState } from "react";

export default function AdminResetPage() {
  const [email, setEmail] = useState("lucatonolini@icloud.com");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!password) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: "reset-rehab-2026", email, password }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResult("Errore: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <h1 className="font-bold text-gray-900">Reset Admin Password</h1>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full border rounded-xl px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase">Nuova Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="min 6 caratteri"
            className="mt-1 w-full border rounded-xl px-4 py-3 text-sm"
          />
        </div>
        <button
          onClick={handleReset}
          disabled={loading || !password}
          className="w-full bg-[#C8102E] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Aggiornamento…" : "Reimposta Password via Admin API"}
        </button>
        {result && (
          <pre className="text-xs bg-gray-100 rounded-xl p-3 overflow-auto whitespace-pre-wrap">{result}</pre>
        )}
      </div>
    </div>
  );
}
