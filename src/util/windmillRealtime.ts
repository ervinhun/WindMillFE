import type {TurbineAlert, TurbineTelemetry} from "../generated-ts-client.ts";

const MAX_POINTS_PER_TURBINE = 32;
const MAX_ALERT_ITEMS = 120;

export type PayloadResult<T> = {
	items: T[];
	isSnapshot: boolean;
};

export type AlertSeverity = "warning" | "error" | "critical";

export const toTimestamp = (value?: string) => {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
};

export const normalizeSeverity = (value?: string): AlertSeverity => {
	const normalized = value?.toLowerCase();
	if (normalized === "warning" || normalized === "error" || normalized === "critical") return normalized;
	return "warning";
};

export const normalizePayload = <T,>(payload: unknown): PayloadResult<T> => {
	if (Array.isArray(payload)) return {items: payload as T[], isSnapshot: true};

	if (payload && typeof payload === "object") {
		const maybeData = (payload as {data?: unknown}).data;
		if (Array.isArray(maybeData)) return {items: maybeData as T[], isSnapshot: true};
		if (maybeData && typeof maybeData === "object") return {items: [maybeData as T], isSnapshot: false};
		return {items: [payload as T], isSnapshot: false};
	}

	return {items: [], isSnapshot: false};
};

export const mergeTelemetry = (prev: TurbineTelemetry[], incoming: TurbineTelemetry[], isSnapshot: boolean) => {
	const base = isSnapshot ? incoming : [...prev, ...incoming];
	const byTurbine = new Map<string, TurbineTelemetry[]>();

	for (const item of base) {
		if (!item.turbineId) continue;
		const list = byTurbine.get(item.turbineId) ?? [];
		list.push(item);
		byTurbine.set(item.turbineId, list);
	}

	const next: TurbineTelemetry[] = [];
	for (const list of byTurbine.values()) {
		const dedup = new Map<string, TurbineTelemetry>();
		for (const item of list) {
			const key = item.id !== undefined
				? `id:${item.id}`
				: `${item.turbineId ?? "t"}-${item.timestamp ?? ""}-${item.powerOutput ?? ""}`;
			dedup.set(key, item);
		}

		next.push(...[...dedup.values()]
			.sort((a, b) => toTimestamp(a.timestamp) - toTimestamp(b.timestamp))
			.slice(-MAX_POINTS_PER_TURBINE));
	}

	return next;
};

export const mergeAlerts = (prev: TurbineAlert[], incoming: TurbineAlert[], isSnapshot: boolean) => {
	const base = isSnapshot ? incoming : [...incoming, ...prev];
	const dedup = new Map<string, TurbineAlert>();

	for (const item of base) {
		const key = item.id !== undefined
			? `id:${item.id}`
			: `${item.turbineId ?? "t"}-${item.timestamp ?? ""}-${item.message ?? ""}`;
		dedup.set(key, item);
	}

	return [...dedup.values()]
		.sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp))
		.slice(0, MAX_ALERT_ITEMS);
};

