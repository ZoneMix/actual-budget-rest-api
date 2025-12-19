# Monitoring Configuration

This directory contains example configurations for Prometheus and Grafana to monitor the Actual Budget REST API.

## Overview

The Actual Budget REST API exposes metrics in Prometheus format at the `/metrics/prometheus` endpoint. These configurations allow you to:

- **Prometheus**: Scrape and store metrics from the API
- **Grafana**: Visualize metrics with pre-configured dashboards

## Files

- `prometheus.yml` - Prometheus configuration for scraping API metrics
- `grafana/` - Grafana provisioning configurations
  - `provisioning/datasources/prometheus.yml` - Prometheus datasource configuration
  - `provisioning/dashboards/default.yml` - Dashboard provisioning settings
  - `dashboards/actual-budget-api-dashboard.json` - Pre-built dashboard with API metrics

## Quick Start

### Using Docker Compose (Development)

The development `docker-compose.dev.yml` already includes Prometheus and Grafana services. The configurations in this directory are automatically mounted:

1. Start all services:
   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```

2. Access Grafana:
   - URL: http://localhost:3001
   - Username: `admin`
   - Password: `admin` (change on first login)

3. View the dashboard:
   - Navigate to **Dashboards → Actual Budget REST API Metrics**
   - The dashboard will automatically load with metrics from your API

### Manual Setup

#### Prometheus

1. Copy `prometheus.yml` to your Prometheus configuration directory:
   ```bash
   cp monitoring/prometheus.yml /path/to/prometheus/config/
   ```

2. Update the target URL in `prometheus.yml` if your API is running on a different host/port:
   ```yaml
   static_configs:
     - targets: ['your-api-host:3000']  # Update this
   ```

3. Start Prometheus:
   ```bash
   prometheus --config.file=/path/to/prometheus.yml
   ```

4. Verify metrics are being scraped:
   - Open http://localhost:9090
   - Go to **Status → Targets** and verify the API target is UP
   - Query metrics: `http_requests_total`

#### Grafana

1. Install and start Grafana (see [Grafana installation guide](https://grafana.com/docs/grafana/latest/setup-grafana/installation/)).

2. Copy the Grafana provisioning files:
   ```bash
   # Copy datasource configuration
   cp -r monitoring/grafana/provisioning /etc/grafana/
   
   # Copy dashboard
   cp monitoring/grafana/dashboards/actual-budget-api-dashboard.json /var/lib/grafana/dashboards/
   ```

3. Update the Prometheus URL in `provisioning/datasources/prometheus.yml` if needed:
   ```yaml
   url: http://your-prometheus-host:9090
   ```

4. Restart Grafana to load the new configuration.

5. Access Grafana and view the dashboard:
   - Open http://localhost:3000 (default Grafana port)
   - Navigate to **Dashboards → Actual Budget REST API Metrics**

## Dashboard Metrics

The pre-configured dashboard includes:

- **Request Rate**: Requests per second over time
- **Total Requests**: Cumulative request count (1 hour window)
- **Error Rate**: Percentage of requests that result in errors
- **Total Errors**: Cumulative error count (1 hour window)
- **Request Duration**: p50, p95, and p99 latency percentiles
- **Average Response Time**: Mean response time over time
- **Requests by Method**: Breakdown of HTTP methods (GET, POST, etc.)
- **Requests by Route**: Breakdown by API endpoint
- **Status Code Distribution**: Pie chart of HTTP status codes
- **Error Status Codes**: Time series of error status codes

## Customization

### Prometheus Configuration

Edit `prometheus.yml` to:
- Adjust scrape intervals
- Add alerting rules
- Configure additional targets
- Set retention policies

### Grafana Dashboard

The dashboard JSON file can be imported into Grafana and customized:
1. Open Grafana UI
2. Go to **Dashboards → Import**
3. Upload `grafana/dashboards/actual-budget-api-dashboard.json`
4. Customize panels, add alerts, or create new visualizations

### Production Considerations

For production deployments:

1. **Security**: 
   - Protect Prometheus and Grafana with authentication
   - Use HTTPS for all connections
   - Restrict network access to monitoring services

2. **Retention**:
   - Configure appropriate retention periods in Prometheus
   - Set up data archival for long-term storage

3. **High Availability**:
   - Run Prometheus in a clustered setup
   - Use Grafana with external database for persistence

4. **Alerting**:
   - Configure Alertmanager for Prometheus alerts
   - Set up notification channels in Grafana

## Troubleshooting

### No metrics appearing in Grafana

1. Verify Prometheus is scraping the API:
   - Check Prometheus targets: http://localhost:9090/targets
   - Verify the API is accessible from Prometheus

2. Check Grafana datasource:
   - Go to **Configuration → Data Sources**
   - Test the Prometheus connection
   - Verify the URL is correct

3. Verify API metrics endpoint:
   - Access http://your-api:3000/metrics/prometheus
   - Ensure metrics are being exposed

### Dashboard not loading

1. Check dashboard provisioning:
   - Verify dashboard JSON is in the correct path
   - Check Grafana logs for provisioning errors

2. Verify datasource:
   - Ensure Prometheus datasource is configured and working
   - Check that metrics are available in Prometheus

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/grafana/latest/)
- [PromQL Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)

