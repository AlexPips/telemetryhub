package auth

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

// Handler handles authentication endpoints.
type Handler struct {
	pool   *pgxpool.Pool
	secret string
	expiry int
}

// NewHandler creates a new auth handler.
func NewHandler(pool *pgxpool.Pool, secret string, expiry int) *Handler {
	return &Handler{pool: pool, secret: secret, expiry: expiry}
}

// RegisterRequest represents the registration request body.
type RegisterRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
	Role     string `json:"role"`
}

// LoginRequest represents the login request body.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// --- Swagger response types ---

// LoginResponse represents the login response.
type LoginResponse struct {
	Token string   `json:"token"`
	User  UserInfo `json:"user"`
}

// UserInfo represents basic user information.
type UserInfo struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// UserResponse represents the current user response.
type UserResponse struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// RegisterResponse represents the registration response.
type RegisterResponse struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// MessageResponse represents a generic message response.
type MessageResponse struct {
	Message string `json:"message"`
}

// ErrorResponse represents an error response.
type ErrorResponse struct {
	Error string `json:"error"`
}

// ChangePasswordRequest represents a change password request.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// RegisterPublic  Create a new user (public, no auth required)
// @Summary      Register a new user
// @Description  Creates a new viewer user. Passwords must be at least 8 characters.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request body auth.RegisterRequest true "Registration details"
// @Success      201 {object} auth.RegisterResponse
// @Failure      400 {object} auth.ErrorResponse
// @Failure      409 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /auth/register [post]
func (h *Handler) RegisterPublic(c echo.Context) error {
	var req struct {
		Email           string `json:"email"`
		Password        string `json:"password"`
		ConfirmPassword string `json:"confirm_password"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
	}

	// Validate
	if req.Email == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Email and password are required"})
	}
	if len(req.Password) < 8 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Password must be at least 8 characters"})
	}
	if req.Password != req.ConfirmPassword {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Passwords do not match"})
	}

	// Always create viewer role for public registration
	role := "viewer"

	// Hash password
	hash, err := HashPassword(req.Password)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Internal error"})
	}

	// Insert user
	var userID int64
	err = h.pool.QueryRow(c.Request().Context(), `
		INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
		RETURNING id
	`, req.Email, hash, role).Scan(&userID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			return c.JSON(http.StatusConflict, map[string]string{"error": "Email already exists"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to create user"})
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"id":    userID,
		"email": req.Email,
		"role":  role,
	})
}

// Register        Create a new user (admin only)
// @Summary      Register a new user
// @Description  Creates a new platform user. Requires admin role. Passwords must be at least 8 characters.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request body auth.RegisterRequest true "Registration details"
// @Success      201 {object} auth.RegisterResponse
// @Failure      400 {object} auth.ErrorResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      403 {object} auth.ErrorResponse
// @Failure      409 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /auth/register [post]
func (h *Handler) Register(c echo.Context) error {
	var req RegisterRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
	}

	// Validate
	if req.Email == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Email and password are required"})
	}
	if len(req.Password) < 8 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Password must be at least 8 characters"})
	}

	role := "viewer"
	if req.Role == "admin" || req.Role == "viewer" {
		role = req.Role
	}

	// Hash password
	hash, err := HashPassword(req.Password)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Internal error"})
	}

	// Insert user
	var userID int64
	err = h.pool.QueryRow(c.Request().Context(), `
		INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
		RETURNING id
	`, req.Email, hash, role).Scan(&userID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			return c.JSON(http.StatusConflict, map[string]string{"error": "Email already exists"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to create user"})
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"id":    userID,
		"email": req.Email,
		"role":  role,
	})
}

// Login           Authenticate user and return JWT token
// @Summary      Login
// @Description  Authenticates a user with email and password. Returns a JWT Bearer token and user info. The token must be sent as `Authorization: Bearer <token>` header for authenticated endpoints.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request body auth.LoginRequest true "Login credentials"
// @Success      200 {object} auth.LoginResponse
// @Failure      400 {object} auth.ErrorResponse
// @Failure      401 {object} auth.ErrorResponse
// @Router       /auth/login [post]
func (h *Handler) Login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
	}

	// Fetch user
	var userID int64
	var email, passwordHash, role string
	err := h.pool.QueryRow(c.Request().Context(), `
		SELECT id, email, password_hash, role FROM users WHERE email = $1
	`, req.Email).Scan(&userID, &email, &passwordHash, &role)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Invalid credentials"})
	}

	// Verify password
	if !VerifyPassword(req.Password, passwordHash) {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Invalid credentials"})
	}

	// Generate JWT token
	token, err := GenerateToken(userID, email, role, h.secret, h.expiry)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to generate token"})
	}

	// Create session
	expiresAt := time.Now().Add(time.Duration(h.expiry) * time.Hour)
	_, err = h.pool.Exec(c.Request().Context(), `
		INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)
	`, token, userID, expiresAt)
	if err != nil {
		// Token generated but session not stored — still return token
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"email": email,
			"role":  role,
		},
	})
}

// Logout          Invalidate current session
// @Summary      Logout
// @Description  Invalidates the current JWT session. The token will no longer be valid for authenticated requests.
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200 {object} auth.MessageResponse
// @Failure      400 {object} auth.ErrorResponse
// @Failure      401 {object} auth.ErrorResponse
// @Router       /auth/logout [post]
func (h *Handler) Logout(c echo.Context) error {
	token := extractToken(c)
	if token == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "No token provided"})
	}

	_, err := h.pool.Exec(c.Request().Context(), `DELETE FROM sessions WHERE token = $1`, token)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to logout"})
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "Logged out"})
}

// Me              Get current user info
// @Summary      Get current user
// @Description  Returns the authenticated user's ID, email, and role based on the current JWT token.
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200 {object} auth.UserResponse
// @Failure      401 {object} auth.ErrorResponse
// @Router       /auth/me [get]
func (h *Handler) Me(c echo.Context) error {
	userID := c.Get("user_id").(int64)
	email := c.Get("user_email").(string)
	role := c.Get("user_role").(string)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"id":    userID,
		"email": email,
		"role":  role,
	})
}

// ChangePassword  Change user password
// @Summary      Change password
// @Description  Changes the authenticated user's password and invalidates all active sessions. Requires current password verification.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request body auth.ChangePasswordRequest true "Current and new password"
// @Success      200 {object} auth.MessageResponse
// @Failure      400 {object} auth.ErrorResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /auth/change-password [post]
func (h *Handler) ChangePassword(c echo.Context) error {
	userID := c.Get("user_id").(int64)

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
	}

	// Fetch current password hash
	var currentHash string
	err := h.pool.QueryRow(c.Request().Context(), `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&currentHash)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to verify password"})
	}

	// Verify current password
	if !VerifyPassword(req.CurrentPassword, currentHash) {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Current password is incorrect"})
	}

	// Hash new password
	newHash, err := HashPassword(req.NewPassword)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to hash password"})
	}

	// Update password
	_, err = h.pool.Exec(c.Request().Context(), `UPDATE users SET password_hash = $1 WHERE id = $2`, newHash, userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to update password"})
	}

	// Invalidate all sessions
	_, _ = h.pool.Exec(c.Request().Context(), `DELETE FROM sessions WHERE user_id = $1`, userID)

	return c.JSON(http.StatusOK, map[string]string{"message": "Password changed"})
}

func extractToken(c echo.Context) string {
	auth := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}
