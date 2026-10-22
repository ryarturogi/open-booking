import { env } from 'cloudflare:workers';

export function baseUrl(): string {
  const service = env.DATA_WORKER ?? undefined;
  if (service) return 'https://open-booking-data.invalid';
  return env.DATA_WORKER_URL ?? import.meta.env.DATA_WORKER_URL ?? 'http://localhost:8787';
}

// Transporte al data-worker: Service Binding is más rápido/confiable que un fetch
// público a subdominio workers.dev (los fetch worker->worker a workers.dev dan 1042).
export function workerFetch(path: string, init?: RequestInit): Promise<Response> {
  const service = env.DATA_WORKER ?? undefined;
  if (service) return service.fetch(new URL(path, baseUrl()), init);
  return fetch(`${baseUrl()}${path}`, init);
}