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
      setError(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="sg-profile-shell">
        <div className="sg-profile-card">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="sg-profile-shell">
      <div className="sg-profile-card">
        <div className="sg-profile-header">
          <div className="sg-profile-identity">
            <div className="sg-profile-avatar">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="avatar" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div>
              <div className="sg-profile-name">{user.nickname || "Unnamed"}</div>
              <div className="sg-profile-meta">{user.email}</div>
              <div className="sg-profile-meta">Joined {formatDate(user.created_at)}</div>
            </div>
          </div>
          <button className="sg-profile-logout" onClick={onLogout} type="button">
            Sign out
          </button>
        </div>

        <div className="sg-profile-grid">
          <div className="sg-profile-panel">
            <div className="sg-profile-panel-title">Account</div>
            <div className="sg-profile-panel-body">
              <div className="sg-profile-row">
                <span>Email</span>
                <strong>{user.email}</strong>
              </div>
              <div className="sg-profile-row">
                <span>Status</span>
                <strong>Active</strong>
              </div>
              <div className="sg-profile-row">
                <span>Last login</span>
                <strong>{user.last_login ? formatDate(user.last_login) : "-"}</strong>
              </div>
              <div className="sg-profile-hint">
                Update your public information on the right.
              </div>
            </div>
          </div>

          <div className="sg-profile-panel">
            <div className="sg-profile-panel-title">Profile</div>
            <div className="sg-profile-panel-body">
              <label className="sg-profile-field">
                <span>Display Name</span>
                <input
                  value={form.nickname}
                  onChange={(e) => updateField("nickname", e.target.value)}
                  placeholder="Your name" />
              </label>
              <label className="sg-profile-field">
                <span>Avatar URL</span>
                <input
                  value={form.avatar_url}
                  onChange={(e) => updateField("avatar_url", e.target.value)}
                  placeholder="https://..." />
              </label>
              <label className="sg-profile-field">
                <span>Bio</span>
                <textarea
                  rows={4}
                  value={form.bio}
                  onChange={(e) => updateField("bio", e.target.value)}
                  placeholder="A short introduction" />
              </label>

              {error && <div className="sg-profile-error">{error}</div>}
              {saved && !error && <div className="sg-profile-success">Saved.</div>}

              <button className="sg-profile-save" onClick={handleSave} disabled={saving} type="button">
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
