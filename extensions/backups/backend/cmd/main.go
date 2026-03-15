package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/kelseyhightower/envconfig"
)

type Config struct {
	Port     string `envconfig:"PORT" default:"8081"`
	LogLevel string `envconfig:"LOG_LEVEL" default:"info"`
}

func main() {
	var config Config
	if err := envconfig.Process("", &config); err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	setupLogging(config.LogLevel)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/status", handleBackupStatus)
	mux.HandleFunc("GET /api/v1/backups", handleListBackups)
	mux.HandleFunc("POST /api/v1/backups", handleCreateBackup)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", config.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	go func() {
		slog.Info("starting backups backend", "port", config.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
}

func setupLogging(level string) {
	var logLevel slog.Level
	switch level {
	case "debug":
		logLevel = slog.LevelDebug
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})))
}

func handleBackupStatus(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		http.Error(w, `{"error":"namespace is required"}`, http.StatusBadRequest)
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("backup status request", "namespace", namespace, "user", username)

	// TODO: Query backup provider CRDs via Kubernetes API for actual status
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":     "completed",
		"lastBackup": time.Now().Add(-2 * time.Hour).Format(time.RFC3339),
	})
}

func handleListBackups(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		http.Error(w, `{"error":"namespace is required"}`, http.StatusBadRequest)
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("list backups request", "namespace", namespace, "user", username)

	// TODO: Query backup provider CRDs for the given namespace
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `[
		{
			"name": "backup-%s-daily-1",
			"status": "Completed",
			"startTimestamp": "%s",
			"completionTimestamp": "%s",
			"includedNamespaces": ["%s"]
		}
	]`, namespace,
		time.Now().Add(-2*time.Hour).Format(time.RFC3339),
		time.Now().Add(-90*time.Minute).Format(time.RFC3339),
		namespace,
	)
}

func handleCreateBackup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Namespace == "" {
		http.Error(w, `{"error":"namespace is required"}`, http.StatusBadRequest)
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Info("creating backup", "namespace", req.Namespace, "user", username)

	// TODO: Create a backup CR via Kubernetes API
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "accepted",
		"message": fmt.Sprintf("Backup triggered for namespace %s", req.Namespace),
	})
}
