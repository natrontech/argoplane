package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/kelseyhightower/envconfig"

	"github.com/natrontech/argoplane/extensions/logs/backend/internal/handler"
	"github.com/natrontech/argoplane/extensions/logs/backend/internal/loki"
)

type Config struct {
	Port         string `envconfig:"PORT" default:"8083"`
	LokiURL      string `envconfig:"LOKI_URL" default:"http://loki.monitoring.svc:3100"`
	LokiTenantID string `envconfig:"LOKI_TENANT_ID" default:""`
	LogLevel     string `envconfig:"LOG_LEVEL" default:"info"`
}

func main() {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	setupLogging(cfg.LogLevel)

	slog.Info("starting logs backend", "port", cfg.Port, "loki", cfg.LokiURL, "tenantID", cfg.LokiTenantID)
	lokiClient := loki.NewClient(cfg.LokiURL, cfg.LokiTenantID)

	logsHandler := handler.NewLogs(lokiClient)
	labelsHandler := handler.NewLabels(lokiClient)
	volumeHandler := handler.NewVolume(lokiClient)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/logs", logsHandler.Handle)
	mux.HandleFunc("GET /api/v1/logs/labels", labelsHandler.HandleLabels)
	mux.HandleFunc("GET /api/v1/logs/label/{name}/values", labelsHandler.HandleLabelValues)
	mux.HandleFunc("GET /api/v1/logs/volume", volumeHandler.Handle)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	go func() {
		slog.Info("starting logs backend", "port", cfg.Port, "loki", cfg.LokiURL)
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
