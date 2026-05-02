import { useMemo, useState } from "react";
import { requestJson } from "../utils/authClient";

const DEFAULT_FORM = {
  email: "",
  password: "",
  confirm: "",
  nickname: "",
};

export default function AuthPage({ apiBase, onAuthSuccess, onCancel, modal = false }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isRegister = useMemo(() => mode === "register", [mode]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = () => {
    if (!form.email.trim()) return "Email is required";
    if (!form.password.trim()) return "Password is required";
    if (form.password.length < 8) return "Password must be at least 8 characters";
    if (isRegister) {
      if (!form.nickname.trim()) return "Display name is required";
      if (form.confirm !== form.password) return "Passwords do not match";
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (isRegister) {
        const payload = await requestJson(apiBase, "/auth/register", {
          method: "POST",
          body: {
            email: form.email.trim(),
            password: form.password,
            nickname: form.nickname.trim(),
          },
        });
        onAuthSuccess?.(payload);
      } else {
        const payload = await requestJson(apiBase, "/auth/login", {
          method: "POST",
          body: {
            email: form.email.trim(),
            password: form.password,
          },
        });
        onAuthSuccess?.(payload);
      }
    } catch (err) {
      setError(err?.message || "Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={modal ? "sg-auth-modal-shell" : "sg-auth-shell"}>
      <div className="sg-auth-card">
        {modal && (
          <button className="sg-auth-close" onClick={onCancel} type="button" aria-label="Close">
            x
          </button>
        )}
        <div className="sg-auth-header">
          <div className="sg-auth-title">StreamGuard Account</div>
          <div className="sg-auth-subtitle">
            {isRegister ? "Create an account to unlock this feature" : "Sign in to unlock this feature"}
          </div>
        </div>

        <div className="sg-auth-tabs">
          <button
            className={`sg-auth-tab ${!isRegister ? "is-active" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
            }}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`sg-auth-tab ${isRegister ? "is-active" : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
            }}
            type="button"
          >
            Register
          </button>
        </div>

        <form className="sg-auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <label className="sg-auth-field">
              <span>Display Name</span>
              <input
                value={form.nickname}
                onChange={(e) => updateField("nickname", e.target.value)}
                placeholder="Your name" />
            </label>
          )}
          <label className="sg-auth-field">
            <span>Email</span>
            <input
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="name@example.com" />
          </label>
          <label className="sg-auth-field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="At least 8 characters" />
          </label>
          {isRegister && (
            <label className="sg-auth-field">
              <span>Confirm Password</span>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => updateField("confirm", e.target.value)}
                placeholder="Repeat your password" />
            </label>
          )}

          {error && <div className="sg-auth-error">{error}</div>}

          <button className="sg-auth-submit" type="submit" disabled={loading}>
            {loading ? "Working..." : isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="sg-auth-footnote">
          By continuing you agree to the terms and privacy policy.
        </div>
      </div>
    </div>
  );
}
