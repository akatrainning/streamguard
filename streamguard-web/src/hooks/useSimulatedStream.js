import { useState, useEffect, useRef, useCallback } from "react";
import { UTTERANCES, CHAT_MESSAGES, PRODUCT } from "../data/mockStream";

const BASE_RISK = [
  { subject:"价格透明度", value:82 },
  { subject:"话术压力值", value:37 },
  { subject:"描述真实度", value:68 },
  { subject:"时间紧迫感", value:55 },
  { subject:"证据充分性", value:74 },
  { subject:"合规得分", value:79 },
];

export function useSimulatedStream() {
  const [utterances, setUtterances] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [rationalityIndex, setRationalityIndex] = useState(78);
  const [riskData, setRiskData] = useState(BASE_RISK);
  const [alerts, setAlerts] = useState([]);
  const [viewerCount, setViewerCount] = useState(12480);
  const [showGate, setShowGate] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionStats, setSessionStats] = useState({ total:0, trap:0, hype:0, fact:0 });

  const uIdx = useRef(0);
  const cIdx = useRef(0);
  const alertId = useRef(0);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  const reset = useCallback(() => {
    uIdx.current = 0; cIdx.current = 0; alertId.current = 0;
    setUtterances([]); setChatMessages([]); setRationalityIndex(78);
    setRiskData(BASE_RISK); setAlerts([]); setViewerCount(12480);
    setShowGate(false); setIsPaused(false);
    setSessionStats({ total:0, trap:0, hype:0, fact:0 });
  }, []);

  const exportReport = useCallback((uList, ri, rd, stats) => {
    const lines = [
      "=== StreamGuard 直播理性哨兵 — 分析报告 ===",
      `生成时间: ${new Date().toLocaleString("zh-CN")}`,
      "",
      "【理性指数】",
      `当前值: ${ri}`,
      "",
      "【会话统计】",
      `总话术数: ${stats.total}  |  事实性: ${stats.fact}  |  夸大型: ${stats.hype}  |  陷阱型: ${stats.trap}`,
      "",
      "【风险维度】",
      ...rd.map(d => `  ${d.subject}: ${d.value}`),
      "",
      "【话术记录】",
      ...uList.map((u,i) => `  [${i+1}] [${u.type.toUpperCase()}] ${u.text}  | 对齐分:${u.score}`),
      "",
      "=== 报告结束 ===",
    ];
    const blob = new Blob([lines.join("\n")], { type:"text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="streamguard_report.txt"; a.click();
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const uTimer = setInterval(() => {
      if (isPausedRef.current) return;
      const item = UTTERANCES[uIdx.current % UTTERANCES.length];
      uIdx.current++;
      setUtterances(prev => [{ ...item, id: Date.now() }, ...prev].slice(0, 20));
      setRationalityIndex(prev => {
        const delta = item.type === "trap" ? -8 : item.type === "hype" ? -3 : +4;
        return Math.max(15, Math.min(95, prev + delta + (Math.random()*4-2)));
      });
      setRiskData(prev => prev.map(d => ({
        ...d,
        value: Math.max(10, Math.min(99, d.value + (Math.random()*6-3))),
      })));
      setSessionStats(prev => ({
        total: prev.total+1, trap: prev.trap + (item.type==="trap"?1:0),
        hype: prev.hype+(item.type==="hype"?1:0), fact: prev.fact+(item.type==="fact"?1:0),
      }));
      if (item.type === "trap") {
        alertId.current++;
        const id = alertId.current;
        setAlerts(prev => [{ id, text:item.text, score:item.score, timestamp:new Date().toLocaleTimeString("zh-CN",{hour12:false}), utteranceId:item.id }, ...prev].slice(0,5));
        setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 7000);
      }
    }, 2800);

    const cTimer = setInterval(() => {
      if (isPausedRef.current) return;
      const msg = CHAT_MESSAGES[cIdx.current % CHAT_MESSAGES.length];
      cIdx.current++;
      setChatMessages(prev => [{ ...msg, id: Date.now() }, ...prev].slice(0, 30));
    }, 900);

    const vTimer = setInterval(() => {
      if (isPausedRef.current) return;
      setViewerCount(prev => prev + Math.floor(Math.random()*80-30));
    }, 2200);

    return () => { clearInterval(uTimer); clearInterval(cTimer); clearInterval(vTimer); };
  }, []);

  return {
    utterances, chatMessages, rationalityIndex, riskData, alerts,
    viewerCount, showGate, setShowGate, isPaused, setIsPaused,
    reset, exportReport, sessionStats, product: PRODUCT,
  };
}
