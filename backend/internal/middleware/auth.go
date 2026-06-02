package middleware

import (
	"net/http"
	"strings"

	"telemetryhub/internal/auth"

	"github.com/labstack/echo/v4"
)

// JWTAuth creates Echo middleware that validates JWT tokens.
func JWTAuth(secret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			tokenStr := extractToken(c)
			if tokenStr == "" {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Missing authentication token"})
			}

			claims, err := auth.ParseToken(tokenStr, secret)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Invalid or expired token"})
			}

			// Store claims in context
			c.Set("user_id", claims.UserID)
			c.Set("user_email", claims.Email)
			c.Set("user_role", claims.Role)

			return next(c)
		}
	}
}

// RequireRole creates middleware that checks the user's role.
func RequireRole(requiredRole string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			role, ok := c.Get("user_role").(string)
			if !ok {
				return c.JSON(http.StatusForbidden, map[string]string{"error": "Access denied"})
			}

			// Admin can access everything
			if role == "admin" {
				return next(c)
			}

			// Viewer can only access viewer endpoints
			if requiredRole == "viewer" && role == "viewer" {
				return next(c)
			}

			return c.JSON(http.StatusForbidden, map[string]string{"error": "Insufficient permissions"})
		}
	}
}

func extractToken(c echo.Context) string {
	auth := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}
