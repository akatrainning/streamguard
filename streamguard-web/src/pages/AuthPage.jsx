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
  const emailReady = useMemo(() => /\S+@\S+\.\S+/.test(form.email.trim()), [form.email]);
  const passwordReady = form.password.length >= 8;
  const confirmReady = !isRegister || (form.confirm && form.confirm === form.password);
  const identityReady = isRegister ? Boolean(form.nickname.trim()) : emailReady;
  const gateReady = Boolean(emailReady && identityReady && passwordReady && confirmReady);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
  };

  const validate = () => {
    if (!form.email.trim()) return "请输入邮箱";
    if (!form.password.trim()) return "请输入密码";
    if (form.password.length < 8) return "密码至少 8 位";
    if (isRegister) {
      if (!form.nickname.trim()) return "请输入显示名称";
      if (form.confirm !== form.password) return "两次密码不一致";
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
      setError(err?.message || "请求失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={modal ? "sg-auth-modal-shell" : "sg-auth-shell"}>
      <div className={`sg-auth-card ${gateReady ? "is-ready" : ""}`}>
        {modal && (
          <button className="sg-auth-close" onClick={onCancel} type="button" aria-label="关闭">
            X
          </button>
        )}

        <aside className="sg-auth-stage" aria-hidden="true">
          <div className="sg-auth-stage-top">
            <span>ACCESS GATE</span>
            <strong>{isRegister ? "REGISTER" : "LOGIN"}</strong>
          </div>

          <div className="sg-auth-radar">
            <div className="sg-auth-radar-core">
              <span>AUTH</span>
              <strong>{gateReady ? "OK" : "SCAN"}</strong>
            </div>
            <i className={emailReady ? "is-ready" : ""} />
            <i className={passwordReady ? "is-ready" : ""} />
            <i className={confirmReady ? "is-ready" : ""} />
          </div>

          <div className="sg-auth-signal-list">
            <div className={identityReady ? "is-ready" : ""}>
              <span>identity</span>
              <strong>{identityReady ? "READY" : "WAIT"}</strong>
            </div>
            <div className={passwordReady ? "is-ready" : ""}>
              <span>password</span>
              <strong>{passwordReady ? "8+" : "LOCK"}</strong>
            </div>
            <div className={confirmReady ? "is-ready" : ""}>
              <span>workspace</span>
              <strong>{confirmReady ? "OPEN" : "CHECK"}</strong>
            </div>
          </div>
        </aside>

        <section className="sg-auth-console">
          <div className="sg-auth-header">
            <div className="sg-auth-kicker">StreamGuard Account</div>
            <div className="sg-auth-title">StreamGuard 账号</div>
            <div className="sg-auth-subtitle">
              {isRegister ? "创建账号后继续使用受保护工作区" : "登录后继续使用受保护工作区"}
            </div>
          </div>

          <div className="sg-auth-tabs">
            <button
              className={`sg-auth-tab ${!isRegister ? "is-active" : ""}`}
              onClick={() => switchMode("login")}
              type="button"
            >
              登录
            </button>
            <button
              className={`sg-auth-tab ${isRegister ? "is-active" : ""}`}
              onClick={() => switchMode("register")}
              type="button"
            >
              注册
            </button>
          </div>

          <form className="sg-auth-form" onSubmit={handleSubmit}>
            {isRegister && (
              <label className={`sg-auth-field ${form.nickname.trim() ? "is-ready" : ""}`}>
                <span>显示名称</span>
                <input
                  value={form.nickname}
                  onChange={(e) => updateField("nickname", e.target.value)}
                  placeholder="用于审核记录署名"
                />
              </label>
            )}

            <label className={`sg-auth-field ${emailReady ? "is-ready" : ""}`}>
              <span>邮箱</span>
              <input
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="name@example.com"
              />
            </label>

            <label className={`sg-auth-field ${passwordReady ? "is-ready" : ""}`}>
              <span>密码</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="至少 8 位"
              />
            </label>

            {isRegister && (
              <label className={`sg-auth-field ${confirmReady ? "is-ready" : ""}`}>
                <span>确认密码</span>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => updateField("confirm", e.target.value)}
                  placeholder="再次输入密码"
                />
              </label>
            )}

            {error && <div className="sg-auth-error">{error}</div>}

            <button className="sg-auth-submit" type="submit" disabled={loading}>
              {loading ? "处理中..." : isRegister ? "创建账号" : "登录"}
            </button>
          </form>

          <div className="sg-auth-footnote">
            通过身份校验后开放历史、分析、直播发现和 RAG 证据工作区。
          </div>
        </section>
      </div>
    </div>
  );
}
