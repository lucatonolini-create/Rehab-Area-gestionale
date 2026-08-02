"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Tab = "login" | "signup" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [conferma, setConferma] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setError("Email non confermata. Controlla la tua casella di posta e clicca il link di verifica.");
      } else {
        setError("Email o password non corretti.");
      }
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== conferma) {
      setError("Le password non coincidono.");
      return;
    }
    if (password.length < 6) {
      setError("La password deve essere di almeno 6 caratteri.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message === "User already registered"
        ? "Esiste già un account con questa email."
        : "Errore durante la registrazione. Riprova.");
      setLoading(false);
      return;
    }

    setSuccess("Account creato! Controlla la tua email per confermare la registrazione, poi accedi.");
    setLoading(false);
    setPassword("");
    setConferma("");
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const redirectTo = `${window.location.origin}/auth/reset`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    setLoading(false);
    if (error) {
      setError("Errore nell'invio dell'email. Verifica l'indirizzo e riprova.");
      return;
    }

    setSuccess("Email inviata! Controlla la tua casella di posta e clicca il link per reimpostare la password.");
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
    setSuccess(null);
    setPassword("");
    setConferma("");
  };

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center bg-gray-50 px-4"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <svg width="64" height="64" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 rounded-2xl shadow-md mx-auto mb-4">
            <rect width="400" height="400" rx="90" fill="#3a3d42"/>
            <rect x="95"  y="248" width="52" height="82"  rx="12" fill="#f2efe9"/>
            <rect x="174" y="180" width="52" height="150" rx="12" fill="#f2efe9"/>
            <rect x="253" y="96"  width="52" height="234" rx="12" fill="#9c3b3b"/>
            <rect x="269" y="120" width="20" height="60" rx="5" fill="#f2efe9"/>
            <rect x="249" y="140" width="60" height="20" rx="5" fill="#f2efe9"/>
          </svg>
          <h1 className="text-xl font-bold text-gray-900">Rehab Area</h1>
          <p className="text-sm text-gray-500 mt-0.5">Accesso riservato</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {tab !== "reset" ? (
            <>
              {/* Tab switcher login / registrati */}
              <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
                <button
                  type="button"
                  onClick={() => switchTab("login")}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tab === "login" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                  }`}
                >
                  Accedi
                </button>
                <button
                  type="button"
                  onClick={() => switchTab("signup")}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tab === "signup" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                  }`}
                >
                  Registrati
                </button>
              </div>

              <form onSubmit={tab === "login" ? handleLogin : handleSignup} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="staff@cremonese.it"
                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={tab === "login" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>

                {tab === "signup" && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conferma password</label>
                    <input
                      type="password"
                      value={conferma}
                      onChange={(e) => setConferma(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                    />
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#C8102E] text-white py-3 rounded-xl text-sm font-semibold hover:bg-red-800 disabled:opacity-50 transition-colors"
                >
                  {loading
                    ? (tab === "login" ? "Accesso in corso…" : "Registrazione in corso…")
                    : (tab === "login" ? "Accedi" : "Crea account")}
                </button>

                {tab === "login" && (
                  <button
                    type="button"
                    onClick={() => switchTab("reset")}
                    className="w-full text-center text-xs text-gray-400 hover:text-[#C8102E] transition-colors py-1"
                  >
                    Password dimenticata?
                  </button>
                )}
              </form>
            </>
          ) : (
            <>
              {/* Reset password */}
              <button
                type="button"
                onClick={() => switchTab("login")}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 mb-5 transition-colors"
              >
                ← Torna al login
              </button>
              <h2 className="font-bold text-gray-900 mb-1">Recupera password</h2>
              <p className="text-sm text-gray-500 mb-5">
                Inserisci la tua email e ti invieremo un link per reimpostare la password.
              </p>

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="staff@cremonese.it"
                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                    {success}
                  </div>
                )}

                {!success && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#C8102E] text-white py-3 rounded-xl text-sm font-semibold hover:bg-red-800 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Invio in corso…" : "Invia link di recupero"}
                  </button>
                )}
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Accesso riservato allo staff medico
        </p>
      </div>
    </div>
  );
}
