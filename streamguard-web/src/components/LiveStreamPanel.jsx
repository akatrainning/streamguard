import { useMemo, useRef } from "react";

const INTENT_META = {
  complaint: { label: "投诉", tone: "trap" },
  doubt: { label: "质疑", tone: "hype" },
  ad_spam: { label: "广告", tone: "trap" },
};

function IntentBadge({ intent, label }) {
  const meta = INTENT_META[intent];
  if (!meta) return null;

  return (
    <span className={`sg-stream-badge is-${meta.tone}`}>
      {label || meta.label}
    </span>
  );
}

function FlagBadge({ flag }) {
  return <span className="sg-stream-badge is-flag">{flag}</span>;
}

export default function LiveStreamPanel({ chatMessages = [], isLive = true }) {
  const chatRef = useRef(null);

  const sentimentStats = useMemo(() => {
    const recent = chatMessages.slice(0, 50);
    const intentCount = {};

    recent.forEach((message) => {
      if (message.intent && message.intent !== "other") {
        intentCount[message.intent] = (intentCount[message.intent] || 0) + 1;
      }
    });

    const topIntents = Object.entries(intentCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      total: recent.length,
      riskCount: recent.filter((message) => ["complaint", "doubt", "ad_spam"].includes(message.intent)).length,
      topIntents,
    };
  }, [chatMessages]);

  return (
    <section className="sg-ui-panel sg-stream-chat-panel">
      <header className="sg-ui-panel-head">
        <div>
          <div className="sg-ui-eyebrow">Live Chat</div>
          <h2>实时弹幕</h2>
        </div>

        <div className="sg-stream-head-meta">
          {sentimentStats.riskCount > 0 && (
            <span className="sg-ui-status is-danger">
              <i />
              风险 {sentimentStats.riskCount}
            </span>
          )}

          <span className="sg-ui-status is-neutral">
            <i />
            {chatMessages.length} msgs
          </span>

          {isLive && (
            <span className="sg-ui-status is-success">
              <i />
              LIVE
            </span>
          )}
        </div>
      </header>

      {chatMessages.length > 0 && sentimentStats.topIntents.some(([intent]) => INTENT_META[intent]) && (
        <div className="sg-stream-chat-intents">
          <span className="sg-stream-chat-intents-label">高频意图</span>
          <div className="sg-stream-chat-intents-list">
            {sentimentStats.topIntents
              .filter(([intent]) => INTENT_META[intent])
              .map(([intent, count]) => (
                <span key={intent} className={`sg-stream-badge is-${INTENT_META[intent].tone}`}>
                  {INTENT_META[intent].label} x{count}
                </span>
              ))}
          </div>
        </div>
      )}

      <div ref={chatRef} className="sg-stream-chat-scroll">
        {chatMessages.length === 0 && (
          <div className="sg-stream-chat-empty">等待实时弹幕接入...</div>
        )}

        {chatMessages.slice(0, 60).map((message, index) => {
          const risk = message.risk_score || 0;
          const isRisky = risk >= 0.5;

          return (
            <article
              key={`${message.id || "chat"}-${index}`}
              className={`sg-stream-chat-item ${isRisky ? "is-risky" : ""}`}
            >
              <div className="sg-stream-chat-meta">
                <span className="sg-stream-chat-user">{message.user}</span>
                {message.intent && <IntentBadge intent={message.intent} label={message.label || message.intent} />}
                {(message.flags || []).map((flag, flagIndex) => (
                  <FlagBadge key={`${flag}-${flagIndex}`} flag={flag} />
                ))}
              </div>

              <div className="sg-stream-chat-message">{message.text}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
