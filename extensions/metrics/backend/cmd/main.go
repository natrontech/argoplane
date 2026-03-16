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

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/config"
	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/handler"
	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
)

type Config struct {
	Port          string `envconfig:"PORT" default:"8080"`
	PrometheusURL string `envconfig:"PROMETHEUS_URL" default:"http://kube-prometheus-kube-prome-prometheus.monitoring.svc:9090"`
	LogLevel      string `envconfig:"LOG_LEVEL" default:"info"`
	ConfigPath    string `envconfig:"CONFIG_PATH" default:""`
}

func main() {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	setupLogging(cfg.LogLevel)

	// Load dashboard config (custom file or built-in defaults)
	var dashCfg *config.DashboardConfig
	if cfg.ConfigPath != "" {
		loaded, err := config.Load(cfg.ConfigPath)
		if err != nil {
			slog.Error("failed to load dashboard config", "path", cfg.ConfigPath, "error", err)
			os.Exit(1)
		}
		slog.Info("loaded custom dashboard config", "path", cfg.ConfigPath, "applications", len(loaded.Applications))
		dashCfg = loaded
	} else {
		slog.Info("using built-in default dashboard config")
		dashCfg = config.DefaultConfig()
	}

	promClient := prometheus.NewClient(cfg.PrometheusURL)

	// Existing handlers (backward compatible)
	resourceHandler := handler.NewResource(promClient)
	appHandler := handler.NewApp(promClient)
	podsHandler := handler.NewPods(promClient)
	customHandler := handler.NewCustom(promClient)
	discoverHandler := handler.NewDiscover(promClient)
	labelsHandler := handler.NewLabels(promClient)
	perPodHandler := handler.NewPerPod(promClient)

	// Config-driven dashboard handler
	dashboardHandler := handler.NewDashboard(promClient, dashCfg)

	mux := http.NewServeMux()

	// Config-driven dashboard endpoints
	mux.HandleFunc("GET /api/v1/dashboards", dashboardHandler.HandleConfig)
	mux.HandleFunc("GET /api/v1/graph", dashboardHandler.HandleGraph)

	// Legacy endpoints (still used by built-in views)
	mux.HandleFunc("GET /api/v1/resource-metrics", resourceHandler.Handle)
	mux.HandleFunc("GET /api/v1/app-metrics", appHandler.Handle)
	mux.HandleFunc("GET /api/v1/pod-breakdown", podsHandler.Handle)
	mux.HandleFunc("GET /api/v1/per-pod-series", perPodHandler.Handle)
	mux.HandleFunc("GET /api/v1/query", customHandler.Handle)
	mux.HandleFunc("GET /api/v1/discover", discoverHandler.Handle)
	mux.HandleFunc("GET /api/v1/labels", labelsHandler.Handle)
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
		slog.Info("starting metrics backend", "port", cfg.Port, "prometheus", cfg.PrometheusURL)
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
