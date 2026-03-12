import {useSyncExternalStore} from "react";
import {getSharedSseClient, getSharedWebClient} from "./apiClient.ts";
import type {TurbineAlert, TurbineTelemetry} from "../generated-ts-client.ts";

const MAX_POINTS_PER_TURBINE = 32;
const MAX_ALERT_ITEMS = 120;

export type PayloadResult<T> = {
	items: T[];
	isSnapshot: boolean;
};

export type AlertSeverity = "warning" | "error" | "critical";

export type WindmillRealtimeSnapshot = {
	measurements: TurbineTelemetry[];
	alerts: TurbineAlert[];
	dismissedAlertCount: number;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let realtimeStarted = false;
let snapshot: WindmillRealtimeSnapshot = {
	measurements: [],
	alerts: [],
	dismissedAlertCount: 0,
};
let rawAlerts: TurbineAlert[] = [];
let dismissedAlertIds = new Set<string>();

const notifyListeners = () => {
	for (const listener of listeners) {
		listener();
	}
};

export const getAlertId = (alert: TurbineAlert) =>
	String(alert.id ?? `${alert.turbineId ?? "t"}-${alert.timestamp ?? ""}-${alert.message ?? ""}`);

const refreshAlertSnapshot = () => {
	const activeIds = new Set(rawAlerts.map(getAlertId));
	dismissedAlertIds = new Set([...dismissedAlertIds].filter((id) => activeIds.has(id)));

	snapshot = {
		...snapshot,
		alerts: rawAlerts.filter((alert) => !dismissedAlertIds.has(getAlertId(alert))),
		dismissedAlertCount: dismissedAlertIds.size,
	};
};

const updateMeasurements = (nextMeasurements: TurbineTelemetry[]) => {
	snapshot = {
		...snapshot,
		measurements: nextMeasurements,
	};
	notifyListeners();
};

const updateAlerts = (nextAlerts: TurbineAlert[]) => {
	rawAlerts = nextAlerts;
	refreshAlertSnapshot();
	notifyListeners();
};

const startRealtime = () => {
	if (realtimeStarted) return;
	realtimeStarted = true;

	const sse = getSharedSseClient();
	const restClient = getSharedWebClient();

	sse.listen(async (id: string) => {
		return await restClient.getTelemetry(id);
	}, (payload: unknown) => {
		const {items, isSnapshot} = normalizePayload<TurbineTelemetry>(payload);
		updateMeasurements(mergeTelemetry(snapshot.measurements, items, isSnapshot));
	});

	sse.listen(async (id: string) => {
		return await restClient.getAlert(id);
	}, (payload: unknown) => {
		const {items, isSnapshot} = normalizePayload<TurbineAlert>(payload);
		updateAlerts(mergeAlerts(rawAlerts, items, isSnapshot));
	});
};

const subscribe = (listener: Listener) => {
	startRealtime();
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
};

const getSnapshot = () => snapshot;

export const useWindmillRealtime = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

export const dismissAlert = (alertId: string) => {
	if (dismissedAlertIds.has(alertId)) return;
	dismissedAlertIds.add(alertId);
	refreshAlertSnapshot();
	notifyListeners();
};

export const restoreDismissedAlerts = () => {
	if (dismissedAlertIds.size === 0) return;
	dismissedAlertIds = new Set();
	refreshAlertSnapshot();
	notifyListeners();
};

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

