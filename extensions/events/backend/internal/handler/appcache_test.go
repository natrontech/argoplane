package handler

import (
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestAppCacheExpires(t *testing.T) {
	var c appCache
	app := &unstructured.Unstructured{Object: map[string]any{}}
	now := time.Now()

	if _, ok := c.get("argocd/shop", now); ok {
		t.Fatal("empty cache returned a hit")
	}
	c.put("argocd/shop", app, now)
	if got, ok := c.get("argocd/shop", now.Add(appCacheTTL-time.Second)); !ok || got != app {
		t.Fatal("fresh entry missed")
	}
	if _, ok := c.get("argocd/shop", now.Add(appCacheTTL+time.Second)); ok {
		t.Fatal("expired entry returned a hit")
	}

	// A later write prunes expired entries, so the map doesn't grow with
	// every app ever viewed.
	c.put("argocd/other", app, now.Add(2*appCacheTTL))
	if len(c.items) != 1 {
		t.Fatalf("expired entries not pruned: %d left", len(c.items))
	}
}
