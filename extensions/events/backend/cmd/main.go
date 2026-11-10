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
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/natrontech/argoplane/extensions/events/backend/internal/cluster"
	"github.com/natrontech/argoplane/extensions/events/backend/internal/handler"
)

type Config struct {
	Port          string `envconfig:"PORT" default:"8085"`
	LogLevel      string `envconfig:"LOG_LEVEL" default:"info"`
	ClusterName   string `envconfig:"CLUSTER_NAME"`
	ClusterServer string `envconfig:"CLUSTER_SERVER"`
	// MultiCluster turns on reading events from the cluster an Application
	// deploys to. Off by default: with it off the backend behaves exactly as
	// it always has, reading only the cluster it runs on, so an upgrade
	// changes nothing for a single-cluster install.
	MultiCluster bool `envconfig:"MULTI_CLUSTER" default:"false"`
	// ArgocdNamespace is where the cluster Secrets live. Defaults to the
	// backend's own namespace, which is where the chart puts both.
	ArgocdNamespace string `envconfig:"ARGOCD_NAMESPACE"`
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

	client, err := kubernetes.NewForConfig(kubeConfig)
	if err != nil {
		slog.Error("failed to create kubernetes client", "error", err)
		os.Exit(1)
	}

	dynClient, err := dynamic.NewForConfig(kubeConfig)
	if err != nil {
		slog.Error("failed to create dynamic client", "error", err)
		os.Exit(1)
	}

	// Events come from whichever cluster the Application deploys to, resolved
	// per request from ArgoCD's own registered cluster Secrets. With
	// MULTI_CLUSTER off, every read uses the in-cluster client exactly as it
	// did before this existed.
	//
	// The Authorizer always stays on the local client either way: Application
	// CRs live beside ArgoCD, not on the cluster running the workload.
	var clients handler.Clients = handler.Static(client)
	if config.MultiCluster {
		ns := config.ArgocdNamespace
		if ns == "" {
			ns = currentNamespace()
		}
		slog.Info("multi-cluster event lookup enabled", "cluster_secret_namespace", ns)
		clients = cluster.NewRegistry(client, dynClient, ns, kubeConfig.Host)
	}

	// CLUSTER_NAME/CLUSTER_SERVER pin this backend to one cluster, rejecting
	// Applications that target any other. That is the per-spoke deployment
	// model and is incompatible with MULTI_CLUSTER, which serves them all.
	auth := handler.NewAuthorizer(dynClient, handler.WithCluster(config.ClusterName, config.ClusterServer))
	eventsHandler := handler.NewEventsHandler(clients, auth)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/events", eventsHandler.Handle)
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
		slog.Info("starting events backend", "port", config.Port)
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

// currentNamespace reads the namespace this pod runs in, so the cluster Secret
// lookup lands where the chart actually installed things instead of assuming
// "argocd".
func currentNamespace() string {
	const nsFile = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"
	if b, err := os.ReadFile(nsFile); err == nil {
		if ns := strings.TrimSpace(string(b)); ns != "" {
			return ns
		}
	}
	return "argocd"
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
