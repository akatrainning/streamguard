import { useEffect, useMemo, useState } from "react";
import { requestJson } from "../utils/authClient";

function formatDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

export default function ProfilePage({ apiBase, user, token, onUserUpdate, onLogout }) {
  const [form, setForm] = useState({ nickname: "", avatar_url: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      nickname: user.nickname || "",
      avatar_url: user.avatar_url || "",
      bio: user.bio || "",
    });
  }, [user]);

  const initials = useMemo(() => {
    if (!user?.nickname) return "SG";
    return user.nickname
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const payload = await requestJson(apiBase, "/me", {
        method: "PUT",
        token,
        body: {
          nickname: form.nickname.trim(),
          avatar_url: form.avatar_url.trim(),
          bio: form.bio.trim(),
        },
      });
      onUserUpdate?.(payload.user);
      setSaved(true);
    } catch (err) {
      setError(err?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="sg-profile-shell">
        <div className="sg-profile-frame">
          <div className="sg-profile-panel sg-profile-panel-loading">正在加载个人资料...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="sg-profile-shell">
      <div className="sg-profile-frame">
        <div className="sg-profile-top">
          <div className="sg-profile-top-copy">
            <div className="sg-profile-kicker">PROFILE CONTROL</div>
            <div className="sg-profile-title">个人主页</div>
            <div className="sg-profile-subtitle">管理账号资料、头像和对外展示信息。</div>
          </div>
          <button className="sg-profile-logout" onClick={onLogout} type="button">
            退出登录
          </button>
        </div>

        <section className="sg-profile-command" aria-label="账号身份控制台">
          <div className="sg-profile-command-avatar">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="用户头像" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="sg-profile-command-copy">
            <span>Operator Identity</span>
            <strong>{user.nickname || "未命名用户"}</strong>
            <em>{user.email}</em>
          </div>
          <div className="sg-profile-command-status">
            <span>ACCESS</span>
            <strong>正常</strong>
          </div>
          <div className="sg-profile-command-telemetry">
            <div><span>created</span><strong>{formatDate(user.created_at)}</strong></div>
            <div><span>last login</span><strong>{user.last_login ? formatDate(user.last_login) : "-"}</strong></div>
            <div><span>profile</span><strong>{form.bio.trim() ? "READY" : "EMPTY"}</strong></div>
          </div>
        </section>

        <div className="sg-profile-grid">
          <section className="sg-profile-panel sg-profile-summary">
            <div className="sg-profile-panel-head">
              <div>
                <div className="sg-profile-panel-kicker">账号状态</div>
                <div className="sg-profile-panel-title">当前账号</div>
              </div>
              <div className="sg-profile-status is-ok">正常</div>
            </div>
            <div className="sg-profile-identity">
              <div className="sg-profile-avatar">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="用户头像" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="sg-profile-identity-copy">
                <div className="sg-profile-name">{user.nickname || "未命名用户"}</div>
                <div className="sg-profile-meta">{user.email}</div>
                <div className="sg-profile-meta">创建于 {formatDate(user.created_at)}</div>
              </div>
            </div>
            <div className="sg-profile-panel-body">
              <div className="sg-profile-row">
                <span>邮箱</span>
                <strong>{user.email}</strong>
              </div>
              <div className="sg-profile-row">
                <span>状态</span>
                <strong className="is-ok">正常</strong>
              </div>
              <div className="sg-profile-row">
                <span>最近登录</span>
                <strong>{user.last_login ? formatDate(user.last_login) : "-"}</strong>
              </div>
              <div className="sg-profile-hint">
                这里记录账号基础状态，右侧可维护工作区展示信息。
              </div>
            </div>
          </section>

          <section className="sg-profile-panel sg-profile-editor">
            <div className="sg-profile-panel-head">
              <div>
                <div className="sg-profile-panel-kicker">个人资料</div>
                <div className="sg-profile-panel-title">对外展示信息</div>
              </div>
              {saved && !error && <div className="sg-profile-status is-saved">已保存</div>}
            </div>
            <div className="sg-profile-panel-body">
              <label className="sg-profile-field">
                <span>显示名称</span>
                <input
                  value={form.nickname}
                  onChange={(e) => updateField("nickname", e.target.value)}
                  placeholder="用于审查记录署名" />
              </label>
              <label className="sg-profile-field">
                <span>头像 URL</span>
                <input
                  value={form.avatar_url}
                  onChange={(e) => updateField("avatar_url", e.target.value)}
                  placeholder="https://..." />
              </label>
              <label className="sg-profile-field">
                <span>简介</span>
                <textarea
                  rows={4}
                  value={form.bio}
                  onChange={(e) => updateField("bio", e.target.value)}
                  placeholder="职责、团队或审查范围" />
              </label>

              {error && <div className="sg-profile-error">{error}</div>}

              <button className="sg-profile-save sg-primary-action" onClick={handleSave} disabled={saving} type="button">
                {saving ? "保存中..." : "保存修改"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
