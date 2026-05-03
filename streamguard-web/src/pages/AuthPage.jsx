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
      <div className="sg-auth-card">
        {modal && (
          <button className="sg-auth-close" onClick={onCancel} type="button" aria-label="关闭">
            x
          </button>
        )}
        <div className="sg-auth-header">
          <div className="sg-auth-title">StreamGuard 账号</div>
          <div className="sg-auth-subtitle">
            {isRegister ? "创建账号后继续使用受保护工作区" : "登录后继续使用受保护工作区"}
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
            登录
          </button>
          <button
            className={`sg-auth-tab ${isRegister ? "is-active" : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
            }}
            type="button"
          >
            注册
          </button>
        </div>

        <form className="sg-auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <label className="sg-auth-field">
              <span>显示名称</span>
              <input
                value={form.nickname}
                onChange={(e) => updateField("nickname", e.target.value)}
                placeholder="用于审查记录署名" />
            </label>
          )}
          <label className="sg-auth-field">
            <span>邮箱</span>
            <input
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="name@example.com" />
          </label>
          <label className="sg-auth-field">
            <span>密码</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="至少 8 位" />
          </label>
          {isRegister && (
            <label className="sg-auth-field">
                <span>确认密码</span>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => updateField("confirm", e.target.value)}
                placeholder="再次输入密码" />
            </label>
          )}

          {error && <div className="sg-auth-error">{error}</div>}

          <button className="sg-auth-submit" type="submit" disabled={loading}>
            {loading ? "处理中..." : isRegister ? "创建账号" : "登录"}
          </button>
        </form>

        <div className="sg-auth-footnote">
          登录后可访问历史、分析和直播发现等合规工作区。
        </div>
      </div>
    </div>
  );
}
