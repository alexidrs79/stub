import { Router } from "express"
import {
  changePassword,
  deleteAccount,
  forgotPassword,
  resetPassword,
  updateProfile,
} from "../account.js"
import { login, logout, me, signup } from "../auth.js"
import { route } from "../http.js"
import { limiters } from "../security.js"

export const authRoutes = Router()

authRoutes.post("/auth/signup", limiters.auth, route(signup))
authRoutes.post("/auth/login", limiters.auth, route(login))
authRoutes.post("/auth/logout", logout)
authRoutes.get("/auth/me", route(me))
authRoutes.post("/auth/forgot-password", limiters.recovery, route(forgotPassword))
authRoutes.post("/auth/reset-password", limiters.recovery, route(resetPassword))

authRoutes.patch("/account/profile", route(updateProfile))
authRoutes.put("/account/password", limiters.auth, route(changePassword))
authRoutes.delete("/account", limiters.auth, route(deleteAccount))
