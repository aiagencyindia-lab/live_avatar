// Client-safe constants and helpers. Nothing in this file may import from
// app/api/secrets.ts — that module holds server-only values.

export const LIVEAVATAR_API_URL =
  process.env.NEXT_PUBLIC_LIVEAVATAR_API_URL || "https://api.liveavatar.com";

/**
 * Ends a LiveAvatar session on the server in a way that survives the page
 * being closed or refreshed (`keepalive`). Without this, a closed tab leaves
 * the session running until it times out on the server.
 *
 * Mirrors the request the SDK itself makes in SessionAPIClient.stopSession().
 * Safe to call more than once; failures are ignored.
 */
export const stopSessionKeepalive = (sessionToken: string): void => {
  if (!sessionToken) {
    return;
  }
  try {
    void fetch(`${LIVEAVATAR_API_URL}/v1/sessions/stop`, {
      method: "POST",
      keepalive: true,
      credentials: "include",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
    }).catch(() => {
      // The session may already be gone; nothing useful to do here.
    });
  } catch {
    // fetch can throw synchronously during unload in some browsers.
  }
};
