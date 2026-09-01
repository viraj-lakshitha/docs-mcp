// Thin fetch wrapper for the Notes REST API. By default a 401 bounces the
// browser to the login page (with a return path); pass redirectOn401: false
// on auth-check calls that handle it themselves.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
  { redirectOn401 = true }: { redirectOn401?: boolean } = {}
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && redirectOn401) {
    const next = encodeURIComponent(location.pathname + location.hash);
    location.href = `/login?next=${next}`;
    throw new Error("signed out");
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new ApiError(detail.error || `${method} ${url} failed (${res.status})`, res.status);
  }
  return res.json();
}
