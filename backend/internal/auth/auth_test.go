package auth

import (
	"testing"
	"time"
)

func TestHashAndVerifyPassword(t *testing.T) {
	password := "securepassword123"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if hash == "" {
		t.Fatal("Hash should not be empty")
	}
	if hash == password {
		t.Fatal("Hash should not equal plaintext")
	}

	if !VerifyPassword(password, hash) {
		t.Error("VerifyPassword should return true for correct password")
	}

	if VerifyPassword("wrongpassword", hash) {
		t.Error("VerifyPassword should return false for wrong password")
	}
}

func TestHashPassword_Deterministic(t *testing.T) {
	// bcrypt hashes are NOT deterministic (they include a random salt)
	hash1, _ := HashPassword("test")
	hash2, _ := HashPassword("test")

	if hash1 == hash2 {
		t.Error("bcrypt hashes should NOT be deterministic (salt is random)")
	}

	// But both should verify the same password
	if !VerifyPassword("test", hash1) || !VerifyPassword("test", hash2) {
		t.Error("Both hashes should verify the same password")
	}
}

func TestGenerateAndParseToken(t *testing.T) {
	secret := "this-is-a-very-long-secret-key-for-testing-purposes-12345"
	userID := int64(42)
	email := "test@example.com"
	role := "admin"

	token, err := GenerateToken(userID, email, role, secret, 24)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}
	if token == "" {
		t.Fatal("Token should not be empty")
	}

	claims, err := ParseToken(token, secret)
	if err != nil {
		t.Fatalf("ParseToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("UserID = %d, want %d", claims.UserID, userID)
	}
	if claims.Email != email {
		t.Errorf("Email = %s, want %s", claims.Email, email)
	}
	if claims.Role != role {
		t.Errorf("Role = %s, want %s", claims.Role, role)
	}
}

func TestParseToken_InvalidSecret(t *testing.T) {
	secret := "this-is-a-very-long-secret-key-for-testing-purposes-12345"
	token, _ := GenerateToken(1, "test@test.com", "viewer", secret, 24)

	_, err := ParseToken(token, "wrong-secret-key-that-is-also-long-enough!")
	if err == nil {
		t.Error("ParseToken should fail with wrong secret")
	}
}

func TestParseToken_Expired(t *testing.T) {
	secret := "this-is-a-very-long-secret-key-for-testing-purposes-12345"

	// Generate token that expired 1 hour ago
	// We can't directly set past expiry, so we test with 0 hours
	token, _ := GenerateToken(1, "test@test.com", "viewer", secret, 0)

	// Token with 0 expiry should be expired immediately
	claims, err := ParseToken(token, secret)
	if err == nil && claims != nil {
		// If somehow not expired, check the expiry time
		if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(time.Now()) {
			t.Error("Token should be expired")
		}
	}
}

func TestParseToken_Tampered(t *testing.T) {
	secret := "this-is-a-very-long-secret-key-for-testing-purposes-12345"
	token, _ := GenerateToken(1, "test@test.com", "viewer", secret, 24)

	// Tamper with the token
	tampered := token[:len(token)-5] + "XXXXX"

	_, err := ParseToken(tampered, secret)
	if err == nil {
		t.Error("ParseToken should fail with tampered token")
	}
}
