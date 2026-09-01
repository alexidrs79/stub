export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init })
  if (!response.ok) {
    let message = String(response.status)
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* ignore empty bodies */
    }
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
