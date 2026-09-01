import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createContext, useContext, type ReactNode } from "react"
import { ApiError, fetchJson } from "./api"

export type AuthUser = {
  id: string
  email: string
  displayName: string
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  error: boolean
  refresh: () => void
  login: (email: string, password: string) => Promise<void>
  signup: (input: {
    email: string
    password: string
    displayName: string
  }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  function clearPrivateQueries() {
    for (const key of ["titles", "lists", "list", "diary"]) {
      queryClient.removeQueries({ queryKey: [key] })
    }
  }
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me", { credentials: "include" })
      if (response.status === 401) return null
      if (!response.ok) throw new Error("Could not load session")
      return response.json() as Promise<AuthUser>
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  })

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      fetchJson<AuthUser>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (user) => {
      clearPrivateQueries()
      queryClient.setQueryData(["me"], user)
    },
  })

  const signup = useMutation({
    mutationFn: (body: {
      email: string
      password: string
      displayName: string
    }) =>
      fetchJson<AuthUser>("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (user) => {
      clearPrivateQueries()
      queryClient.setQueryData(["me"], user)
    },
  })

  const logout = useMutation({
    mutationFn: () => fetchJson<void>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.setQueryData(["me"], null)
      clearPrivateQueries()
    },
  })

  const value: AuthContextValue = {
    user: me.data ?? null,
    loading: me.isLoading,
    error: me.isError,
    refresh: () => {
      void me.refetch()
    },
    login: async (email, password) => {
      try {
        await login.mutateAsync({ email, password })
      } catch (error) {
        throw error instanceof ApiError ? error : new Error("Could not log in.")
      }
    },
    signup: async (input) => {
      try {
        await signup.mutateAsync(input)
      } catch (error) {
        throw error instanceof ApiError ? error : new Error("Could not sign up.")
      }
    },
    logout: async () => {
      await logout.mutateAsync()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("AuthProvider missing")
  return value
}
