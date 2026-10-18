import { useNavigate } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { api, isDemoMode, setAccessToken } from "./api";
import type { AuthSession } from "./types";

type GoogleCredentialResponse = { credential: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; ux_mode?: "popup" }): void;
          renderButton(element: HTMLElement, options: { theme: "outline"; size: "large"; text: "signin_with"; shape: "rectangular"; width?: number }): void;
        };
      };
    };
  }
}

type AuthContextValue = {
  session: AuthSession | null;
  signIn: (credential: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  signIn: async () => undefined,
  signOut: () => undefined,
});

export function useAuth() {
  return useContext(AuthContext);
}

function GoogleButton({ onCredential, width = 220 }: { onCredential: (credential: string) => Promise<void>; width?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env["VITE_GOOGLE_OAUTH_CLIENT_ID"] as string | undefined;
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId?.trim()) {
      return;
    }
    let disposed = false;
    const render = () => {
      if (disposed || !container.current || !window.google) return;
      container.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "popup",
        callback: (response) => {
          void onCredential(response.credential).catch((error: Error) => {
            setMessage(error.message || "Google sign-in failed.");
          });
        },
      });
      window.google.accounts.id.renderButton(container.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width,
      });
    };
    const existing = document.getElementById("google-identity-services");
    if (existing) {
      if (window.google) render();
      else existing.addEventListener("load", render, { once: true });
      return () => { disposed = true; };
    }
    const script = document.createElement("script");
    script.id = "google-identity-services";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    script.onerror = () => setMessage("Google Identity Services could not be loaded.");
    document.head.appendChild(script);
    return () => { disposed = true; };
  }, [clientId, onCredential, width]);

  if (!clientId?.trim()) return null;
  return <><div ref={container} />{message && <p className="mt-3 text-sm text-destructive">{message}</p>}</>;
}

export function GoogleSignInButton({ width }: { width?: number }) {
  const { session, signIn } = useAuth();
  if (isDemoMode || session) return null;
  return <GoogleButton onCredential={signIn} width={width ?? 220} />;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const navigate = useNavigate();
  const signOut = () => {
    setAccessToken(null);
    setSession(null);
  };
  const signIn = async (credential: string) => {
    if (!api.signInWithGoogle) throw new Error("Google sign-in requires the live API client.");
    const next = await api.signInWithGoogle(credential);
    setAccessToken(next.accessToken);
    setSession(next);
    toast.success(`Signed in as ${next.user.email}`);
    try {
      navigate({ to: "/overview" });
    } catch (e) {
      // ignore navigation errors in non-router contexts
    }
  };

  useEffect(() => {
    setAccessToken(session?.accessToken ?? null);
    return () => setAccessToken(null);
  }, [session]);

  return <AuthContext.Provider value={{ session, signIn, signOut }}>{children}</AuthContext.Provider>;
}
