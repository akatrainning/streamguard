import re

with open('streamguard-web/src/components/CommandCenter.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

pattern_hero = re.compile(r'<section className=""sg-command-hero"">.*?</section>', re.DOTALL)
replacement_hero = '''<section className="sg-command-hero">
        <div className="sg-command-signal-strip" style={{ marginBottom: "20px" }}>
          <MetricTile label="语义累计" value={totalUtterances} />
          <MetricTile label="弹幕累计" value={totalChats} />
          <MetricTile label="估算速率" value={${throughput}/min} tone="success" />
          <MetricTile label="缓存窗口" value={${utterances.length}/} tone={connection.connected ? "neutral" : "warning"} />
        </div>
        <div className="sg-command-diagnostics" style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "24px" }}>
            <KV k="数据源" v={dataSource || "--"} />
            <KV k="房间" v={sourceConfig?.roomId || "--"} mono />
            <KV k="最近消息" v={lastSeen} mono />
            <KV k="状态" v={statusText} tone={statusTone} />
          </div>
          {connection.error && <div className="sg-command-error" style={{ color: "var(--trap)", fontWeight: 600 }}>{connection.error}</div>}
        </div>
      </section>'''

text = pattern_hero.sub(replacement_hero, text)

pattern_log = re.compile(r'<section className=""sg-command-log"">.*?</section>', re.DOTALL)
replacement_log = '''<details className="sg-command-log-details" style={{ marginTop: "16px", padding: "12px", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-muted)" }}>
        <summary style={{ fontSize: "12px", fontWeight: "600", cursor: "pointer", outline: "none" }}>底层通信日志 ({(connection.statusLog || []).length} 条)</summary>
        <section className="sg-command-log" style={{ marginTop: "12px" }}>
          <div className="sg-command-log-body" ref={logScrollRef} style={{ maxHeight: "150px", overflowY: "auto", fontSize: "11px" }}>
            {logLines.map((line, index) => (
              <div key={${line}-} className="mono">{line}</div>
            ))}
            {(!connection.statusLog || connection.statusLog.length === 0) && (
              <div className="mono">-- 暂无日志 --</div>
            )}
          </div>
        </section>
      </details>'''

text = pattern_log.sub(replacement_log, text)

with open('streamguard-web/src/components/CommandCenter.jsx', 'w', encoding='utf-8') as f:
    f.write(text)
