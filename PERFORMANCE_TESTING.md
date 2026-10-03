# RabbitMQ Performance Testing

The performance suite uses a real RabbitMQ broker and is kept separate from
the fast component tests.

## Run

Start RabbitMQ, configure `RABBITMQ_URL` in `.env`, and run:

```powershell
npm run test:performance
```

Three scenarios are executed:

1. Sequential message throughput and average/p95 end-to-end latency.
2. Concurrent publishing throughput, latency, and delivery error rate.
3. Large-message throughput, latency, and delivery error rate.

Each scenario prints one `PERFORMANCE_RESULT` JSON line that can be copied
into a report. The default error-rate requirement is zero percent.

## Configuration

Set any of these environment variables before running the suite:

| Variable | Default | Purpose |
|---|---:|---|
| `PERF_MESSAGE_COUNT` | 100 | Sequential message count |
| `PERF_CONCURRENT_MESSAGE_COUNT` | 200 | Concurrent message count |
| `PERF_CONCURRENCY` | 20 | Number of concurrent publisher workers |
| `PERF_PAYLOAD_BYTES` | 1024 | Normal payload size |
| `PERF_LARGE_MESSAGE_COUNT` | 20 | Large-message count |
| `PERF_LARGE_CONCURRENCY` | 5 | Large-message publisher workers |
| `PERF_LARGE_MESSAGE_BYTES` | 262144 | Large payload size (256 KiB) |
| `PERF_TIMEOUT_MS` | 30000 | Per-scenario delivery timeout |
| `PERF_MIN_THROUGHPUT` | 1 | Minimum normal throughput in messages/second |
| `PERF_MAX_P95_MS` | 10000 | Maximum normal p95 latency |
| `PERF_LARGE_MIN_THROUGHPUT` | 0.1 | Minimum large-message throughput |
| `PERF_LARGE_MAX_P95_MS` | 15000 | Maximum large-message p95 latency |
| `PERF_MAX_ERROR_RATE` | 0 | Maximum delivery error percentage |

Example of a larger run with stricter acceptance criteria:

```powershell
$env:PERF_MESSAGE_COUNT = "1000"
$env:PERF_CONCURRENT_MESSAGE_COUNT = "2000"
$env:PERF_CONCURRENCY = "50"
$env:PERF_MIN_THROUGHPUT = "100"
$env:PERF_MAX_P95_MS = "500"
npm run test:performance
```

Performance results vary by machine, broker configuration, network, message
durability, and background load. Record the environment and configuration
alongside the measured values in formal documentation.
