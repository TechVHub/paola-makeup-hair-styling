
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "../../../lib/supabase";
import styles from "./page.module.css";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const supabase = getSupabase();

        const { data } = await supabase.auth.getUser();

        if (!active || !data.user) return;

        const { data: isAdmin, error: roleError } =
          await supabase.rpc("is_paola_admin");

        if (
          !roleError &&
          isAdmin === true &&
          active
        ) {
          router.replace("/admin/dashboard");
        }
      } catch {
        // Remain on login when no valid admin session exists.
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    }

    checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogin(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const supabase = getSupabase();

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError) {
        throw loginError;
      }

      const { data: isAdmin, error: roleError } =
        await supabase.rpc("is_paola_admin");

      if (roleError) {
        throw roleError;
      }

      if (isAdmin !== true) {
        await supabase.auth.signOut();

        throw new Error(
          "This account is not authorized to access Paola's admin portal."
        );
      }

      router.replace("/admin/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className={styles.page}>
        <div
          className={styles.loading}
          role="status"
          aria-live="polite"
        >
          <span className={styles.loadingSpinner} />
          <p>Checking admin session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.loginCard}>
        <Link href="/" className={styles.brand}>
          PAOLA
          <span>MAKEUP & HAIR STYLES</span>
        </Link>

        <div className={styles.divider} />

        <span className={styles.eyebrow}>
          PRIVATE ADMIN PORTAL
        </span>

        <h1>Welcome Back</h1>

        <p className={styles.subtitle}>
          Sign in to manage appointments,
          customer booking requests, and
          business operations.
        </p>

        <form
          onSubmit={handleLogin}
          className={styles.form}
        >
          <label className={styles.field}>
            <span>Email Address</span>

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="admin@example.com"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={loading}
              required
            />
          </label>

          <div className={styles.field}>
            <label htmlFor="admin-password">
              Password
            </label>

            <div className={styles.passwordWrapper}>
              <input
                id="admin-password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={loading}
                required
              />

              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() =>
                  setShowPassword((current) => !current)
                }
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                aria-pressed={showPassword}
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          {error && (
            <div
              className={styles.error}
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={styles.loginButton}
          >
            {loading
              ? "SIGNING IN..."
              : "SIGN IN"}
          </button>
        </form>

        <Link
          href="/"
          className={styles.homeLink}
        >
          ← Return to Website
        </Link>
      </div>
    </main>
  );
}
