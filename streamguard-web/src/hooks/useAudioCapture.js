import { useEffect, useRef, useCallback, useState } from "react";

/**
 * useAudioCapture - 捕获麦克风音频并转发给 WebSocket 服务器
 * 
 * Usage:
 *   const { isRecording, startRecording, stopRecording, error } = useAudioCapture({
 *     onAudioChunk: (base64Audio) => { ... },
 *     chunkSize: 16000, // 1秒, 16kHz采样率
 *   });
 */
export function useAudioCapture({
  onAudioChunk = () => {},
  chunkSize = 16000, // 1s @ 16kHz
  enableLogging = false,
}) {
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [sampleRate, setSampleRate] = useState(16000);

  const logDebug = useCallback(
    (msg) => enableLogging && console.log("[useAudioCapture]", msg),
    [enableLogging]
  );

  // 获取用户的麦克风权限并初始化 MediaRecorder
  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // 检查浏览器支持
      const navigator_ = navigator;
      const getUserMedia =
        navigator_.mediaDevices?.getUserMedia ||
        navigator_.webkitGetUserMedia?.bind(navigator_) ||
        navigator_.mozGetUserMedia?.bind(navigator_);

      if (!getUserMedia) {
        throw new Error("浏览器不支持音频捕获 API");
      }

      logDebug("请求麦克风权限...");

      // 请求麦克风权限
      const stream = await getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 16000 },
        },
        video: false,
      });

      streamRef.current = stream;

      // 创建 AudioContext 以了解实际采样率
      const audioContext =
        new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const actualSampleRate = audioContext.sampleRate;
      setSampleRate(actualSampleRate);
      logDebug(`AudioContext 采样率: ${actualSampleRate} Hz`);

      // 创建 MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType:
          MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "audio/mp4",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, {
            type: mediaRecorder.mimeType,
          });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(",")[1]; // 去掉 data:audio/...;base64, 前缀
            logDebug(`发送音频块: ${base64.length} bytes`);
            onAudioChunk(base64);
          };
          reader.readAsDataURL(blob);
        }
        chunksRef.current = [];
      };

      mediaRecorder.start();
      setIsRecording(true);
      logDebug("开始录音");

      // 定期输出数据（实现流式发送）
      const interval = setInterval(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.requestData(); // 触发 ondataavailable
        }
      }, (chunkSize / actualSampleRate) * 1000);

      mediaRecorderRef.current = { mediaRecorder, interval };
    } catch (err) {
      const msg =
        err.name === "NotAllowedError"
          ? "用户拒绝了麦克风权限"
          : err.message || "无法启动音频捕获";
      setError(msg);
      logDebug(`错误: ${msg}`);
    }
  }, [chunkSize, onAudioChunk, logDebug]);

  // 停止录音
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      const { mediaRecorder, interval } = mediaRecorderRef.current;
      clearInterval(interval);

      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }

      mediaRecorderRef.current = null;
      setIsRecording(false);
      logDebug("停止录音");
    }

    // 停止所有音频轨道
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // 关闭 AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [logDebug]);

  // 清理：组件卸载时停止录音
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
    };
  }, [isRecording, stopRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    error,
    sampleRate,
  };
}
