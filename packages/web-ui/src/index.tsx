"use client";

import { ApiClient, ApiError, SessionTokenStore } from "@gymride/api-client";
import type { AuthResponse, RoleName, UserProfile } from "@gymride/types";
import { otpSchema, phoneSchema } from "@gymride/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export function createWebApi(namespace: string) {
  return new ApiClient(apiBaseUrl, {
    tokenStore: new SessionTokenStore(namespace),
    onAuthFailure: () => {
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.assign("/login?reason=session-expired");
      }
    },
  });
}

export function hasAllowedRole(
  userRoles: RoleName[],
  allowedRoles: RoleName[],
) {
  return userRoles.some((role) => allowedRoles.includes(role));
}

export function consoleAccessStatus(
  userRoles: RoleName[],
  allowedRoles: RoleName[],
  allowAuthenticatedWithoutRole = false,
): "authenticated" | "onboarding" | "forbidden" {
  if (hasAllowedRole(userRoles, allowedRoles)) return "authenticated";
  return allowAuthenticatedWithoutRole ? "onboarding" : "forbidden";
}

interface AuthContextValue {
  user: UserProfile | null;
  status:
    | "loading"
    | "authenticated"
    | "onboarding"
    | "unauthenticated"
    | "forbidden";
  login(phone: string, otp: string): Promise<void>;
  logout(): Promise<void>;
  reloadProfile(): Promise<UserProfile>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AppProviders({
  children,
  api,
  allowedRoles,
  allowAuthenticatedWithoutRole = false,
}: {
  children: ReactNode;
  api: ApiClient;
  allowedRoles: RoleName[];
  allowAuthenticatedWithoutRole?: boolean;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        api={api}
        allowedRoles={allowedRoles}
        allowAuthenticatedWithoutRole={allowAuthenticatedWithoutRole}
      >
        {children}
      </AuthProvider>
      <ToastProvider />
    </QueryClientProvider>
  );
}

function AuthProvider({
  children,
  api,
  allowedRoles,
  allowAuthenticatedWithoutRole,
}: {
  children: ReactNode;
  api: ApiClient;
  allowedRoles: RoleName[];
  allowAuthenticatedWithoutRole: boolean;
}) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const queryClient = useQueryClient();

  const accept = (profile: UserProfile) => {
    const access = consoleAccessStatus(
      profile.roles,
      allowedRoles,
      allowAuthenticatedWithoutRole,
    );
    setUser(access !== "forbidden" ? profile : null);
    setStatus(access);
    if (access === "forbidden") api.clearSession();
    return profile;
  };

  const reloadProfile = () =>
    api.request<UserProfile>("/users/me").then(accept);

  useEffect(() => {
    let active = true;
    api
      .restore()
      .then((restored) =>
        restored ? api.request<UserProfile>("/users/me") : null,
      )
      .then((profile) => {
        if (!active) return;
        if (profile) accept(profile);
        else setStatus("unauthenticated");
      })
      .catch(() => active && setStatus("unauthenticated"));
    return () => {
      active = false;
    };
  }, [api]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      async login(phone, otp) {
        const result = await api.request<AuthResponse>("/auth/otp/verify", {
          method: "POST",
          body: JSON.stringify({
            phone,
            otp,
            deviceName: "GYMRide web console",
          }),
        });
        api.setTokens(result.tokens);
        accept(result.user);
        if (
          !allowAuthenticatedWithoutRole &&
          !hasAllowedRole(result.user.roles, allowedRoles)
        ) {
          throw new ApiError(
            "This account does not have access to this console.",
            403,
          );
        }
      },
      async logout() {
        try {
          await api.request("/auth/logout", { method: "POST" }, false);
        } catch {
          /* local logout must still succeed */
        }
        api.clearSession();
        queryClient.clear();
        setUser(null);
        setStatus("unauthenticated");
        window.location.assign("/login");
      },
      reloadProfile,
    }),
    [
      allowAuthenticatedWithoutRole,
      allowedRoles,
      api,
      queryClient,
      status,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AppProviders");
  return context;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  useEffect(() => {
    if (status === "unauthenticated") window.location.assign("/login");
  }, [status]);
  if (status === "loading")
    return (
      <PageState
        title="Restoring your session…"
        detail="Securely checking your access."
      />
    );
  if (status === "forbidden")
    return (
      <PageState
        title="Access denied"
        detail="This account does not have the required role."
      />
    );
  if (status !== "authenticated" && status !== "onboarding")
    return <PageState title="Redirecting…" />;
  return children;
}

export function LoginScreen({
  appName,
  api,
}: {
  appName: string;
  api: ApiClient;
}) {
  const { login, status } = useAuth();
  const [phone, setPhone] = useState("");
  const [developmentOtp, setDevelopmentOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [serverError, setServerError] = useState("");
  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
  });
  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { phone: "", otp: "" },
  });

  useEffect(() => {
    if (status === "authenticated") window.location.assign("/dashboard");
  }, [status]);

  const requestOtp = phoneForm.handleSubmit(async ({ phone: value }) => {
    setServerError("");
    try {
      const result = await api.request<{ developmentOtp?: string }>(
        "/auth/otp/request",
        {
          method: "POST",
          body: JSON.stringify({ phone: value }),
        },
      );
      setDevelopmentOtp(result.developmentOtp ?? "");
      setPhone(value);
      otpForm.setValue("phone", value);
      setStep("otp");
      pushToast("OTP sent", "Check the phone associated with your account.");
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });
  const verify = otpForm.handleSubmit(async ({ otp }) => {
    setServerError("");
    try {
      await login(phone, otp);
      window.location.assign("/dashboard");
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="login-logo-lockup">
          <span className="brand-mark">GR</span>
          <span>
            <strong>GYMRide</strong>
            <small>Find. Fit. Belong.</small>
          </span>
        </div>
        <span className="eyebrow">{appName} workspace</span>
        <h1>
          Find your edge.
          <br />
          <em>Lead the movement.</em>
        </h1>
        <p>
          One premium workspace for every gym, branch, booking and decision.
        </p>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark">GR</div>
        <p className="eyebrow">GYMRide {appName}</p>
        <h2 id="login-title">Welcome back.</h2>
        <p className="muted">
          {step === "phone"
            ? "Use the mobile number attached to your account."
            : `Enter the code sent to ${phone}.`}
        </p>
        {serverError && (
          <div className="error-banner" role="alert">
            {serverError}
          </div>
        )}
        {step === "otp" && developmentOtp && (
          <div className="notice-banner" role="status">
            Development OTP: <strong>{developmentOtp}</strong>
          </div>
        )}
        {step === "phone" ? (
          <form onSubmit={requestOtp} className="stack">
            <Field
              label="Mobile number"
              error={phoneForm.formState.errors.phone?.message}
            >
              <input
                autoFocus
                autoComplete="tel"
                placeholder="+919876543210"
                {...phoneForm.register("phone")}
              />
            </Field>
            <button disabled={phoneForm.formState.isSubmitting}>
              Send OTP
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <Field
              label="One-time password"
              error={otpForm.formState.errors.otp?.message}
            >
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                {...otpForm.register("otp")}
              />
            </Field>
            <button disabled={otpForm.formState.isSubmitting}>
              Verify and continue
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setStep("phone")}
            >
              Use another number
            </button>
          </form>
        )}
        <p className="security-note">
          Refresh credentials stay in this browser tab only. Closing the tab
          signs you out.
        </p>
      </section>
    </main>
  );
}

export interface NavItem {
  href: string;
  label: string;
  short: string;
}

const navIcons: Record<string, string> = {
  DB: "⌂",
  GY: "◇",
  PR: "✓",
  BK: "▣",
  RV: "★",
  FN: "₹",
  FX: "↗",
  NT: "●",
  CI: "⌁",
  ME: "○",
  OS: "▦",
  "+": "+",
};

const routeContext: Record<string, { title: string; detail: string }> = {
  dashboard: { title: "Dashboard", detail: "Live workspace overview" },
  gyms: { title: "Gyms", detail: "Manage your fitness network" },
  flex: { title: "GYMRide Flex", detail: "Membership operations" },
  finance: { title: "Finance", detail: "Earnings and settlements" },
  "gym-os": { title: "GymOS", detail: "Paid gym-management workspace" },
  bookings: { title: "Bookings", detail: "Reservations and attendance" },
  reviews: { title: "Reviews", detail: "Member feedback" },
  notifications: { title: "Notifications", detail: "Updates and activity" },
  "check-ins": { title: "Check-ins", detail: "Secure visit verification" },
  profile: { title: "Profile", detail: "Account and security" },
};

export function AppShell({
  children,
  appName,
  nav,
}: {
  children: ReactNode;
  appName: string;
  nav: NavItem[];
}) {
  const { user, logout } = useAuth();
  const currentPath =
    typeof window === "undefined" ? "" : window.location.pathname;
  const routeKey = currentPath.split("/").filter(Boolean)[0] ?? "dashboard";
  const context = routeContext[routeKey] ?? routeContext.dashboard;
  return (
    <div className={`app-frame app-frame-${appName.toLowerCase()}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <a className="brand" href="/dashboard">
          <span className="brand-mark">GR</span>
          <span>
            GYMRide<small>Find. Fit. Belong.</small>
          </span>
        </a>
        <p className="sidebar-console">{appName} console</p>
        <nav aria-label="Primary navigation">
          {nav.map((item) => (
            <a
              href={item.href}
              key={item.href}
              aria-current={
                currentPath === item.href ||
                (item.href !== "/dashboard" && currentPath.startsWith(`${item.href}/`))
                  ? "page"
                  : undefined
              }
            >
              <span aria-hidden="true">{navIcons[item.short] ?? item.short}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-user">
          <strong>{displayName(user)}</strong>
          <small>{user?.phone}</small>
          <button className="button-ghost" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="desktop-header">
          <div>
            <strong>{context.title}</strong>
            <small>{context.detail}</small>
          </div>
          <div className="desktop-header-actions">
            {appName === "Partner" && (
              <a className="header-icon" href="/notifications" aria-label="Notifications">
                <span aria-hidden="true">●</span>
              </a>
            )}
            <div className="desktop-header-user" aria-label="Signed in user">
            <span>{displayName(user).slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName(user)}</strong>
              <small>{user?.roles.join(" · ")}</small>
            </div>
            </div>
          </div>
        </header>
        <header className="mobile-header">
          <a className="brand" href="/dashboard">
            GYMRide · {appName}
          </a>
        </header>
        <main className="page" id="main-content">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function PageState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <section className="page-state">
      <div className="state-icon" aria-hidden="true">◇</div>
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
      {action}
    </section>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <PageState
      title="We couldn’t load this"
      detail={errorMessage(error)}
      action={retry && <button onClick={retry}>Try again</button>}
    />
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  busy,
  danger,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <h2 id="dialog-title">{title}</h2>
        <p>{description}</p>
        <div className="dialog-actions">
          <button className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={danger ? "button-danger" : ""}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

type Toast = { id: number; title: string; detail?: string };
let toastListener: ((toast: Toast) => void) | null = null;
export function pushToast(title: string, detail?: string) {
  toastListener?.({ id: Date.now(), title, detail });
}
function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    toastListener = (toast) => {
      setToasts((items) => [...items, toast]);
      window.setTimeout(
        () =>
          setToasts((items) => items.filter((item) => item.id !== toast.id)),
        4500,
      );
    };
    return () => {
      toastListener = null;
    };
  }, []);
  return (
    <div className="toast-region" aria-live="polite">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          <strong>{toast.title}</strong>
          {toast.detail && <small>{toast.detail}</small>}
        </div>
      ))}
    </div>
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}
export function displayName(user?: UserProfile | null) {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "GYMRide user"
  );
}
export function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}
