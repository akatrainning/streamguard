import { requestJson } from "./authClient";

export async function saveHistorySession(apiBase, token, entry, snapshot) {
  return requestJson(apiBase, "/history/sessions", {
    method: "POST",
    token,
    body: { entry, snapshot },
  });
}

export async function listHistorySessions(apiBase, token, limit = 50) {
  return requestJson(apiBase, `/history/sessions?limit=${limit}`, {
    token,
  });
}

export async function getHistorySession(apiBase, token, sessionId) {
  return requestJson(apiBase, `/history/sessions/${sessionId}`, {
    token,
  });
}

export async function renameHistorySession(apiBase, token, sessionId, product) {
  return requestJson(apiBase, `/history/sessions/${sessionId}`, {
    method: "PUT",
    token,
    body: { product },
  });
}

export async function deleteHistorySession(apiBase, token, sessionId) {
  return requestJson(apiBase, `/history/sessions/${sessionId}`, {
    method: "DELETE",
    token,
  });
}

export async function clearHistorySessions(apiBase, token) {
  return requestJson(apiBase, "/history/sessions", {
    method: "DELETE",
    token,
  });
}
