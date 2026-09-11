package server

import (
	"testing"
	"time"

	"telemetryhub/internal/handlers"
)

func result(v float64) handlers.ReadingResult {
	return handlers.ReadingResult{Value: v}
}

func TestReadingsCache_HitAndMiss(t *testing.T) {
	c := newReadingsCache(time.Second, 10)
	from := time.Date(2026, 9, 1, 10, 0, 30, 0, time.UTC)
	to := time.Date(2026, 9, 2, 10, 0, 30, 0, time.UTC)
	key := c.key("dev1", []string{"temperature"}, from, to)

	if _, ok := c.get(key); ok {
		t.Fatal("cache should miss on empty cache")
	}
	c.set(key, []handlers.ReadingResult{result(1)})
	got, ok := c.get(key)
	if !ok || len(got) != 1 || got[0].Value != 1 {
		t.Fatalf("cache get after set: ok=%v got=%+v", ok, got)
	}
}

func TestReadingsCache_KeyBucketsToMinute(t *testing.T) {
	c := newReadingsCache(time.Second, 10)
	from := time.Date(2026, 9, 1, 10, 0, 30, 0, time.UTC)
	to := time.Date(2026, 9, 2, 10, 0, 30, 0, time.UTC)
	// 20 seconds later, still same minute bucket → same key
	keyA := c.key("dev1", []string{"temperature"}, from, to)
	keyB := c.key("dev1", []string{"temperature"},
		from.Add(20*time.Second), to.Add(20*time.Second))
	if keyA != keyB {
		t.Fatalf("keys differ within same minute bucket:\n  %q\n  %q", keyA, keyB)
	}
	// Different field set → different key
	keyC := c.key("dev1", []string{"humidity"}, from, to)
	if keyA == keyC {
		t.Fatal("different fields must produce different keys")
	}
}

func TestReadingsCache_Expiry(t *testing.T) {
	c := newReadingsCache(50*time.Millisecond, 10)
	from := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	to := time.Date(2026, 9, 2, 10, 0, 0, 0, time.UTC)
	key := c.key("dev1", []string{"temperature"}, from, to)
	c.set(key, []handlers.ReadingResult{result(1)})
	time.Sleep(80 * time.Millisecond)
	if _, ok := c.get(key); ok {
		t.Fatal("cache entry should expire after TTL")
	}
}

func TestReadingsCache_EvictionOverCap(t *testing.T) {
	c := newReadingsCache(time.Minute, 3)
	base := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		from := base.Add(time.Duration(i) * time.Minute)
		to := from.Add(24 * time.Hour)
		c.set(c.key("dev1", []string{"temperature"}, from, to), []handlers.ReadingResult{result(float64(i))})
	}
	if len(c.entries) > 3 {
		t.Fatalf("cache grew to %d entries, cap is 3", len(c.entries))
	}
}

func TestReadingsCache_DisabledWhenTTLZero(t *testing.T) {
	c := newReadingsCache(0, 10)
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := from.Add(24 * time.Hour)
	key := c.key("dev1", []string{"temperature"}, from, to)
	c.set(key, []handlers.ReadingResult{result(1)})
	if len(c.entries) != 0 {
		t.Fatal("ttl=0 cache must not store entries")
	}
}