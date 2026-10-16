import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSeo } from "@/hooks/use-seo";
import { useAuth } from "../auth";
import { Field } from "../components/Field";

export default function Login() {
  useSeo({ title: "Admin sign in", noindex: true });
  const { session, isAdmin, loading, signIn, signOut } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? "/admin";
  if (!loading && session && isAdmin) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      setError(/invalid login credentials/i.test(msg) ? "Wrong email or password." : msg || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  const notAdmin = !loading && session && isAdmin === false;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-popover p-8 shadow-sm">
        <img src="/logo.png" alt="Matrix Automation & Control" className="mx-auto mb-6 h-12 w-auto" />
        <div className="mb-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> Admin panel
        </div>

        {notAdmin ? (
          <div className="space-y-4 text-center">
            <p className="text-sm">
              <strong>{session.user.email}</strong> is signed in but is not an administrator.
            </p>
            <Button variant="outline" className="w-full" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy || loading}>
              {busy && <Loader2 className="animate-spin" />} Sign in
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
