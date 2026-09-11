package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestReadingsRateLimiter_ExceedsLimit(t *testing.T) {
	e := echo.New()
	e.GET("/readings", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}, readingsRateLimiter(2))

	// 3 rapid requests against 2/sec limit → 3rd must be 429
	codes := make([]int, 0, 3)
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/readings", nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		codes = append(codes, rec.Code)
	}
	if codes[2] != http.StatusTooManyRequests {
		t.Fatalf("3rd request code = %d, want 429 (got %v)", codes[2], codes)
	}
	if codes[0] != http.StatusOK || codes[1] != http.StatusOK {
		t.Fatalf("first two requests should pass, got %v", codes)
	}
}

func TestReadingsRateLimiter_DisabledWhenZero(t *testing.T) {
	e := echo.New()
	e.GET("/readings", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}, readingsRateLimiter(0))

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/readings", nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d code = %d, want 200 (rate limiter should be disabled)", i, rec.Code)
		}
	}
}

func TestReadingsRateLimiter_PerUser(t *testing.T) {
	e := echo.New()
	e.GET("/readings", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}, func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// identify user from the X-User header (simulates JWT claims)
			c.Set("user_id", int64(c.Request().Header.Get("X-User")[0]-'0'))
			return next(c)
		}
	}, readingsRateLimiter(2))

	do := func(user string) int {
		req := httptest.NewRequest(http.MethodGet, "/readings", nil)
		req.Header.Set("X-User", user)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec.Code
	}

	// user 1: 2 allowed, 3rd limited
	if code := do("1"); code != http.StatusOK {
		t.Fatalf("user1 #1 = %d, want 200", code)
	}
	if code := do("1"); code != http.StatusOK {
		t.Fatalf("user1 #2 = %d, want 200", code)
	}
	if code := do("1"); code != http.StatusTooManyRequests {
		t.Fatalf("user1 #3 = %d, want 429", code)
	}

	// user 2 starts a fresh bucket: its first 2 requests must pass even
	// though user 1 is already limited
	if code := do("2"); code != http.StatusOK {
		t.Fatalf("user2 #1 = %d, want 200 (buckets must be per-user, got %d)", code, code)
	}
	if code := do("2"); code != http.StatusOK {
		t.Fatalf("user2 #2 = %d, want 200 (buckets must be per-user, got %d)", code, code)
	}
}