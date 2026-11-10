package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/kelseyhightower/envconfig"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/alertmanager"
	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/alerts"
	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/handler"
	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/prometheus"
)

type Config struct {
	Port          string `envconfig:"PORT" default:"8086"`
	LogLevel      string `envconfig:"LOG_LEVEL" default:"info"`
	PrometheusURL string `envconfig:"PROMETHEUS_URL" default:"http://kube-prometheus-kube-prome-prometheus.monitoring.svc:9090"`
	// AlertmanagerURL is optional. Without it alerts are never shown as
	// silenced or inhibited.
	AlertmanagerURL string `envconfig:"ALERTMANAGER_URL"`
	// PrometheusExternalURL is the browser-reachable Prometheus. When set,
	// every rule links to its expression there.
	PrometheusExternalURL string `envconfig:"PROMETHEUS_EXTERNAL_URL"`
	NamespaceLabel        string `envconfig:"NAMESPACE_LABEL" default:"namespace"`
	SeverityLabel         string `envconfig:"SEVERITY_LABEL" default:"severity"`
	LinkAnnotations       string `envconfig:"LINK_ANNOTATIONS" default:"runbook_url,dashboard_url"`
	ClusterLabel          string `envconfig:"CLUSTER_LABEL"`
	ClusterMap            string `envconfig:"CLUSTER_MAP"`
}

func main() {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	setupLogging(cfg.LogLevel)

	clusterMap, err := handler.ParseClusterConfig(cfg.ClusterLabel, cfg.ClusterMap)
	if err != nil {
		slog.Error("invalid cluster filter config", "error", err)
		os.Exit(1)
	}

	kubeConfig, err := rest.InClusterConfig()
	if err != nil {
		slog.Error("failed to create in-cluster config", "error", err)
		os.Exit(1)
	}
	kubeConfig.Timeout = 25 * time.Second

	dynClient, err := dynamic.NewForConfig(kubeConfig)
	if err != nil {
		slog.Error("failed to create dynamic client", "error", err)
		os.Exit(1)
	}

	var silences handler.SilenceSource
	if cfg.AlertmanagerURL != "" {
		silences = alertmanager.NewClient(strings.TrimSuffix(cfg.AlertmanagerURL, "/"))
	}

	h := handler.New(
		prometheus.NewClient(strings.TrimSuffix(cfg.PrometheusURL, "/")),
		silences,
		handler.NewAuthorizer(dynClient, cfg.ClusterLabel, clusterMap),
		alerts.Config{
			NamespaceLabel:        cfg.NamespaceLabel,
			SeverityLabel:         cfg.SeverityLabel,
			ClusterLabel:          cfg.ClusterLabel,
			LinkAnnotations:       splitList(cfg.LinkAnnotations),
			PrometheusExternalURL: cfg.PrometheusExternalURL,
		},
	)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/alerts", h.Alerts)
	mux.HandleFunc("GET /api/v1/rules", h.Rules)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	go func() {
		slog.Info("starting alerts backend", "port", cfg.Port, "prometheus", cfg.PrometheusURL,
			"alertmanager", cfg.AlertmanagerURL != "")
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

func splitList(s string) []string {
	var out []string
	for _, v := range strings.Split(s, ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
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
