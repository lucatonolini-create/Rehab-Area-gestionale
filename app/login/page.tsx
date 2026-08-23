"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const RL_KEY = "rehab_login_attempts";
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 60_000;

function getAttempts(): { count: number; blockedUntil: number | null } {
  try {
    const raw = localStorage.getItem(RL_KEY);
    if (!raw) return { count: 0, blockedUntil: null };
    return JSON.parse(raw);
  } catch { return { count: 0, blockedUntil: null }; }
}

function recordFailure() {
  const { count } = getAttempts();
  const next = count + 1;
  localStorage.setItem(RL_KEY, JSON.stringify({
    count: next,
    blockedUntil: next >= MAX_ATTEMPTS ? Date.now() + BLOCK_MS : null,
  }));
  return next;
}

function checkBlock(): { blocked: boolean; secsLeft: number } {
  const { blockedUntil } = getAttempts();
  if (!blockedUntil) return { blocked: false, secsLeft: 0 };
  const ms = blockedUntil - Date.now();
  if (ms <= 0) { localStorage.removeItem(RL_KEY); return { blocked: false, secsLeft: 0 }; }
  return { blocked: true, secsLeft: Math.ceil(ms / 1000) };
}

function clearBlock() {
  try { localStorage.removeItem(RL_KEY); } catch { /* ignore */ }
}

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
  const [blockSecs, setBlockSecs] = useState(0);

  useEffect(() => {
    const tick = () => {
      const { blocked, secsLeft } = checkBlock();
      setBlockSecs(blocked ? secsLeft : 0);
      if (!blocked) setError(prev => prev?.startsWith("Troppi") ? null : prev);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const { blocked, secsLeft } = checkBlock();
    if (blocked) {
      setBlockSecs(secsLeft);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const attempts = recordFailure();
      const { blocked: nowBlocked, secsLeft: secs } = checkBlock();
      if (nowBlocked) {
        setBlockSecs(secs);
      } else if (error.message.toLowerCase().includes("email not confirmed")) {
        setError("Email non confermata. Controlla la tua casella di posta e clicca il link di verifica.");
      } else {
        setError(`Email o password non corretti. ${MAX_ATTEMPTS - attempts} tentativ${MAX_ATTEMPTS - attempts === 1 ? "o" : "i"} rimanent${MAX_ATTEMPTS - attempts === 1 ? "e" : "i"}.`);
      }
      setLoading(false);
      return;
    }

    localStorage.removeItem(RL_KEY);
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
            <g transform="translate(60,60) scale(11.6667)" stroke="#f2efe9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M14.4 14.4 9.6 9.6"/>
              <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/>
              <path d="m21.5 21.5-1.4-1.4"/>
              <path d="M3.9 3.9 2.5 2.5"/>
              <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>
            </g>
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

                {blockSecs > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
                    Troppi tentativi falliti. Riprova tra <strong>{blockSecs}</strong> secondi.
                  </div>
                )}

                {error && blockSecs === 0 && (
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
                  disabled={loading || blockSecs > 0}
                  className="w-full bg-[#C8102E] text-white py-3 rounded-xl text-sm font-semibold hover:bg-red-800 disabled:opacity-50 transition-colors"
                >
                  {blockSecs > 0
                    ? `Attendi ${blockSecs}s…`
                    : loading
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
