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
)

type Config struct {
	Port          string `envconfig:"PORT" default:"8080"`
	PrometheusURL string `envconfig:"PROMETHEUS_URL" default:"http://kube-prometheus-kube-prome-prometheus.monitoring.svc:9090"`
	LogLevel      string `envconfig:"LOG_LEVEL" default:"info"`
}

func main() {
	var config Config
	if err := envconfig.Process("", &config); err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	setupLogging(config.LogLevel)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/resource-metrics", handleResourceMetrics(config.PrometheusURL))
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
		slog.Info("starting metrics backend", "port", config.Port, "prometheus", config.PrometheusURL)
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

func handleResourceMetrics(prometheusURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		namespace := r.URL.Query().Get("namespace")
		name := r.URL.Query().Get("name")

		if namespace == "" || name == "" {
			http.Error(w, `{"error":"namespace and name are required"}`, http.StatusBadRequest)
			return
		}

		username := r.Header.Get("Argocd-Username")
		slog.Debug("metrics request", "namespace", namespace, "name", name, "user", username, "datasource", prometheusURL)

		// TODO: Query metrics datasource for actual resource metrics
		// For now, return stub data to validate the extension pipeline
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `[
			{"name": "CPU Usage", "value": "12.5", "unit": "millicores"},
			{"name": "Memory Usage", "value": "64.2", "unit": "MiB"},
			{"name": "Network RX", "value": "1.2", "unit": "MB/s"},
			{"name": "Network TX", "value": "0.8", "unit": "MB/s"}
		]`)
	}
}
