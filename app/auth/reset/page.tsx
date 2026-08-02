"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center bg-gray-50"><p className="text-sm text-gray-400">Caricamento…</p></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [conferma, setConferma] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setError("Link scaduto o non valido. Richiedi un nuovo link dalla pagina di accesso.");
        } else {
          setReady(true);
        }
      });
    } else if (tokenHash && type === "recovery") {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then(({ error }) => {
        if (error) {
          setError("Link scaduto o non valido. Richiedi un nuovo link dalla pagina di accesso.");
        } else {
          setReady(true);
        }
      });
    } else {
      setError("Link non valido. Richiedi un nuovo reset dalla pagina di accesso.");
    }
  }, [searchParams]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== conferma) { setError("Le password non coincidono."); return; }
    if (password.length < 6) { setError("La password deve essere di almeno 6 caratteri."); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError("Errore durante l'aggiornamento. Riprova.");
      setLoading(false);
      return;
    }
    await supabase.auth.signOut();
    setSuccess(true);
  };

  const Logo = () => (
    <svg width="64" height="64" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 rounded-2xl shadow-md mx-auto mb-4">
      <rect width="400" height="400" rx="90" fill="#3a3d42"/>
      <g transform="translate(60,60) scale(11.6667)" stroke="#f2efe9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M14.4 14.4 9.6 9.6"/>
        <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/>
        <path d="m21.5 21.5-1.4-1.4"/>
        <path d="M3.9 3.9 2.5 2.5"/>
        <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>
      </g>
    </svg>
  );

  if (success) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Password aggiornata</h2>
          <p className="text-sm text-gray-500 mb-5">Ora puoi accedere con la nuova password.</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-[#C8102E] text-white py-3 rounded-xl text-sm font-semibold hover:bg-red-800 transition-colors"
          >
            Vai al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo />
          <h1 className="text-xl font-bold text-gray-900">Nuova password</h1>
          <p className="text-sm text-gray-500 mt-0.5">Scegli una nuova password per il tuo account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
              <div className="mt-3">
                <a href="/login" className="text-[#C8102E] font-medium underline">Torna al login</a>
              </div>
            </div>
          )}

          {ready && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nuova password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conferma password</label>
                <input
                  type="password"
                  value={conferma}
                  onChange={(e) => setConferma(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#C8102E] text-white py-3 rounded-xl text-sm font-semibold hover:bg-red-800 disabled:opacity-50 transition-colors"
              >
                {loading ? "Aggiornamento…" : "Aggiorna password"}
              </button>
            </form>
          )}

          {!ready && !error && (
            <p className="text-sm text-gray-400 text-center py-4">Verifica del link in corso…</p>
          )}
        </div>
      </div>
    </div>
  );
}
