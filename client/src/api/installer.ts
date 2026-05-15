/**
 * Agent installer helpers.
 *
 * The server signs a fresh agent JWT per download and ships it inside a
 * ZIP next to the .exe. Callers authenticate with their dashboard token
 * (admin role) — the secret never crosses the wire in either direction
 * beyond this single response.
 */
const API_BASE = '/api';

export async function downloadAgentBundle(): Promise<void> {
  const token = localStorage.getItem('pc-hub-token');
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${API_BASE}/agent/installer/bundle`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.error) detail = j.error;
    } catch {
      /* response was not JSON */
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Nexus-Agent-Bundle.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Release the object URL after a short delay so the download has time
  // to start before the URL becomes invalid.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
