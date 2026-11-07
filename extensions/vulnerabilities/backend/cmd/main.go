package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/kelseyhightower/envconfig"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/cluster"
	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/handler"
)

type Config struct {
	Port          string `envconfig:"PORT" default:"8084"`
	LogLevel      string `envconfig:"LOG_LEVEL" default:"info"`
	ClusterName   string `envconfig:"CLUSTER_NAME"`
	ClusterServer string `envconfig:"CLUSTER_SERVER"`
	// ArgocdNamespace is where this backend looks for the cluster Secrets
	// ArgoCD registers. Only used when it runs beside ArgoCD on the hub.
	ArgocdNamespace string `envconfig:"ARGOCD_NAMESPACE" default:"argocd"`
}

func main() {
	var config Config
	if err := envconfig.Process("", &config); err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	setupLogging(config.LogLevel)

	kubeConfig, err := rest.InClusterConfig()
	if err != nil {
		slog.Error("failed to create in-cluster config", "error", err)
		os.Exit(1)
	}
	// Bound every API call: a stuck List would otherwise hold the handler
	// past the server's WriteTimeout until the client disconnects.
	kubeConfig.Timeout = 25 * time.Second

	dynClient, err := dynamic.NewForConfig(kubeConfig)
	if err != nil {
		slog.Error("failed to create dynamic client", "error", err)
		os.Exit(1)
	}

	// Report data is read from whichever cluster the Application deploys to,
	// resolved per request from ArgoCD's own registered cluster Secrets. The
	// Authorizer deliberately stays on the local client: Application CRs live
	// here on the hub, not on the cluster running the workload.
	clients := cluster.NewRegistry(dynClient, config.ArgocdNamespace, kubeConfig.Host)

	// WithCluster is left unset on purpose. It exists to pin a backend to a
	// single cluster, which is the per-spoke deployment model; this one serves
	// every registered cluster from the hub.
	auth := handler.NewAuthorizer(dynClient, handler.WithCluster(config.ClusterName, config.ClusterServer))
	reportsHandler := handler.NewReportsHandler(clients, auth)
	overviewHandler := handler.NewOverviewHandler(clients, auth)
	auditHandler := handler.NewAuditHandler(clients, auth)
	secretsHandler := handler.NewSecretsHandler(clients, auth)
	sbomHandler := handler.NewSbomHandler(clients, auth)
	exportHandler := handler.NewExportHandler(clients, auth)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/reports", reportsHandler.Handle)
	mux.HandleFunc("POST /api/v1/overview", overviewHandler.Handle)
	mux.HandleFunc("POST /api/v1/audit/overview", auditHandler.HandleOverview)
	mux.HandleFunc("POST /api/v1/secrets/overview", secretsHandler.HandleOverview)
	mux.HandleFunc("POST /api/v1/sbom/overview", sbomHandler.HandleOverview)
	mux.HandleFunc("GET /api/v1/export", exportHandler.Handle)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", config.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	go func() {
		slog.Info("starting vulnerabilities backend", "port", config.Port)
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
