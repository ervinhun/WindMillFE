import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {StateleSSEClient} from "statele-sse";
import {type TurbineAlert as ApiTurbineAlert, type TurbineTelemetry, WebClientClient} from "../generated-ts-client.ts";

type TurbineStatus = "running" | "stopped";
type AlertSeverity = "warning" | "error" | "critical";

const BASE_URL = import.meta.env.VITE_API_URL;

const MAX_POINTS_PER_TURBINE = 32;


const sse = new StateleSSEClient(BASE_URL + "/sse");
const restClient = new WebClientClient(BASE_URL);

interface AlertFeedItem {
    id: string;
    severity: AlertSeverity;
    message: string;
    at: string;
    turbineName: string;
    turbineId: string;
}

interface WindMillCardData {
    measurement: TurbineTelemetry;
    alerts: AlertFeedItem[];
    powerHistory: number[];
}

const severityBadgeClass: Record<AlertSeverity, string> = {
    warning: "badge-warning",
    error: "badge-error",
    critical: "badge-secondary"
};

const severityTone: Record<AlertSeverity, number> = {
    warning: 520,
    error: 680,
    critical: 860
};

const MAX_ALERT_ITEMS = 120;

const normalizeSeverity = (severity?: string): AlertSeverity => {
    const value = severity?.toLowerCase();
    if (value === "critical" || value === "error" || value === "warning") return value;
    return "warning";
};

const toTimestamp = (value?: string) => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const formatAt = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleTimeString();
};

type PayloadResult<T> = {
    items: T[];
    isSnapshot: boolean;
};

type HeartbeatState = {
    label: "Live" | "Delayed" | "Stale" | "No signal";
    ageSeconds: number | null;
    badgeClass: string;
    dotClass: string;
};

const normalizePayload = <T,>(payload: unknown): PayloadResult<T> => {
    if (Array.isArray(payload)) return {items: payload as T[], isSnapshot: true};

    if (payload && typeof payload === "object") {
        const maybeData = (payload as {data?: unknown}).data;
        if (Array.isArray(maybeData)) return {items: maybeData as T[], isSnapshot: true};
        if (maybeData && typeof maybeData === "object") return {items: [maybeData as T], isSnapshot: false};
        return {items: [payload as T], isSnapshot: false};
    }

    return {items: [], isSnapshot: false};
};

const mergeTelemetry = (prev: TurbineTelemetry[], incoming: TurbineTelemetry[], isSnapshot: boolean) => {
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

const mergeAlerts = (prev: ApiTurbineAlert[], incoming: ApiTurbineAlert[], isSnapshot: boolean) => {
    const base = isSnapshot ? incoming : [...incoming, ...prev];
    const deduped = new Map<string, ApiTurbineAlert>();

    for (const alert of base) {
        const key = alert.id !== undefined
            ? `id:${alert.id}`
            : `${alert.turbineId ?? "t"}-${alert.timestamp ?? ""}-${alert.message ?? ""}`;
        deduped.set(key, alert);
    }

    return [...deduped.values()]
        .sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp))
        .slice(0, MAX_ALERT_ITEMS);
};

const getHeartbeatState = (timestamp: string | undefined, nowMs: number): HeartbeatState => {
    const ts = toTimestamp(timestamp);
    if (ts <= 0) {
        return {label: "No signal", ageSeconds: null, badgeClass: "badge-ghost", dotClass: "bg-base-content/50"};
    }

    const ageSeconds = Math.max(0, Math.floor((nowMs - ts) / 1000));
    if (ageSeconds <= 15) return {label: "Live", ageSeconds, badgeClass: "badge-success", dotClass: "bg-success"};
    if (ageSeconds <= 45) return {label: "Delayed", ageSeconds, badgeClass: "badge-warning", dotClass: "bg-warning"};
    return {label: "Stale", ageSeconds, badgeClass: "badge-error", dotClass: "bg-error"};
};

const Sparkline = ({points}: {points: number[]}) => {
    if (points.length < 2) return null;

    const max = Math.max(...points);
    const min = Math.min(...points);
    const spread = Math.max(max - min, 1);

    const toSvg = points.map((value, index) => {
        const x = (index / (points.length - 1)) * 100;
        const y = 100 - ((value - min) / spread) * 100;
        return `${x},${y}`;
    }).join(" ");

    return (
        <div className="h-20 w-full rounded-box bg-base-200 p-2">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    points={toSvg}
                    className="text-primary"
                />
            </svg>
        </div>
    );
};

const WindmillVisual = ({status}: {status: TurbineStatus}) => (
    <div className="relative flex h-14 w-14 items-center justify-center">
        <div className={`absolute h-10 w-10 ${status === "running" ? "animate-spin" : ""}`}>
            <span className="absolute left-1/2 top-0 h-5 w-1 -translate-x-1/2 rounded bg-primary"/>
            <span className="absolute left-1/2 top-1/2 h-1 w-5 -translate-x-1/2 -translate-y-1/2 rounded bg-primary"/>
            <span className="absolute bottom-0 left-1/2 h-5 w-1 -translate-x-1/2 rounded bg-primary"/>
        </div>
        <span className="h-3 w-3 rounded-full bg-primary"/>
        <span className={`absolute -bottom-1 h-2 w-2 rounded-full ${status === "running" ? "bg-success" : "bg-error"}`}/>
    </div>
);

const AllWindMills = () => {
    const navigate = useNavigate();
    const [muteAlerts, setMuteAlerts] = useState(false);
    const [measurements, setMeasurements] = useState<TurbineTelemetry[]>([]);
    const [alerts, setAlerts] = useState<ApiTurbineAlert[]>([]);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const seenAlertIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const unsub = sse.listen(async (id) => {
            return await restClient.getTelemetry(id);
        }, (payload) => {
            const {items, isSnapshot} = normalizePayload<TurbineTelemetry>(payload);
            setMeasurements((prev) => mergeTelemetry(prev, items, isSnapshot));
        });

        return () => {
            unsub?.();
        };
    }, []);


    useEffect(() => {
        const unsub = sse.listen(async (id) => {
            return await restClient.getAlert(id);
        }, (payload) => {
            const {items, isSnapshot} = normalizePayload<ApiTurbineAlert>(payload);
            setAlerts((prev) => mergeAlerts(prev, items, isSnapshot));
        });

        return () => {
            unsub?.();
        };
    }, []);

    useEffect(() => {
        console.log(measurements)
    }, [measurements]);

    const windMills = useMemo<WindMillCardData[]>(() => {
        const measurementGroups = new Map<string, TurbineTelemetry[]>();

        for (const telemetry of measurements) {
            const turbineId = telemetry.turbineId;
            if (!turbineId) continue;
            const existing = measurementGroups.get(turbineId) ?? [];
            existing.push(telemetry);
            measurementGroups.set(turbineId, existing);
        }

        const byTurbineAlerts = new Map<string, AlertFeedItem[]>();
        for (const alert of alerts) {
            if (!alert.turbineId) continue;
            const id = String(alert.id ?? `${alert.turbineId}-${alert.timestamp}-${alert.message}`);
            const normalized: AlertFeedItem = {
                id,
                severity: normalizeSeverity(alert.severity),
                message: alert.message ?? "No message",
                at: formatAt(alert.timestamp),
                turbineName: "",
                turbineId: alert.turbineId
            };
            const existing = byTurbineAlerts.get(alert.turbineId) ?? [];
            existing.push(normalized);
            byTurbineAlerts.set(alert.turbineId, existing);
        }

        const cards: WindMillCardData[] = [];
        measurementGroups.forEach((items, turbineId) => {
            const sorted = [...items].sort((a, b) => toTimestamp(a.timestamp) - toTimestamp(b.timestamp));
            const latest = sorted[sorted.length - 1];
            if (!latest) return;

            const powerHistory = sorted
                .map((measurement) => measurement.powerOutput)
                .filter((value): value is number => typeof value === "number")
                .slice(-14);

            const turbineAlerts = (byTurbineAlerts.get(turbineId) ?? [])
                .map((alert) => ({...alert, turbineName: latest.turbineName ?? turbineId}))
                .sort((a, b) => {
                    const aData = alerts.find((source) => String(source.id ?? "") === a.id);
                    const bData = alerts.find((source) => String(source.id ?? "") === b.id);
                    return toTimestamp(bData?.timestamp) - toTimestamp(aData?.timestamp);
                })
                .slice(0, 3);

            cards.push({
                measurement: latest,
                alerts: turbineAlerts,
                powerHistory
            });
        });

        return cards.sort((a, b) => (a.measurement.turbineName ?? "").localeCompare(b.measurement.turbineName ?? ""));
    }, [measurements, alerts]);

    const alertFeed = useMemo<AlertFeedItem[]>(() => {
        return alerts
            .filter((alert): alert is ApiTurbineAlert & {turbineId: string} => Boolean(alert.turbineId))
            .map((alert) => {
                const matchingTurbine = windMills.find((wm) => wm.measurement.turbineId === alert.turbineId);
                return {
                    id: String(alert.id ?? `${alert.turbineId}-${alert.timestamp}-${alert.message}`),
                    severity: normalizeSeverity(alert.severity),
                    message: alert.message ?? "No message",
                    at: formatAt(alert.timestamp),
                    turbineId: alert.turbineId,
                    turbineName: matchingTurbine?.measurement.turbineName ?? alert.turbineId
                };
            })
            .sort((a, b) => {
                const aRaw = alerts.find((x) => String(x.id ?? "") === a.id);
                const bRaw = alerts.find((x) => String(x.id ?? "") === b.id);
                return toTimestamp(bRaw?.timestamp) - toTimestamp(aRaw?.timestamp);
            })
            .slice(0, 30);
    }, [alerts, windMills]);

    const counters = useMemo(() => {
        return {
            total: windMills.length,
            running: windMills.filter((wm) => wm.measurement.isRunning).length,
            warnings: alertFeed.filter((a) => a.severity === "warning").length,
            errors: alertFeed.filter((a) => a.severity === "error").length,
            critical: alertFeed.filter((a) => a.severity === "critical").length
        };
    }, [alertFeed, windMills]);

    const playSeverityTone = useCallback((severity: AlertSeverity) => {
        if (muteAlerts) return;
        if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;

        const context = new window.AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = severity === "critical" ? "sawtooth" : "square";
        oscillator.frequency.value = severityTone[severity];
        gain.gain.value = severity === "critical" ? 0.1 : 0.07;

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start();
        oscillator.stop(context.currentTime + 0.35);

        oscillator.onended = () => {
            void context.close();
        };
    }, [muteAlerts]);

    useEffect(() => {
        for (const alert of alertFeed) {
            if (seenAlertIdsRef.current.has(alert.id)) continue;
            seenAlertIdsRef.current.add(alert.id);
            playSeverityTone(alert.severity);
        }
    }, [alertFeed, playSeverityTone]);

    return (
        <div className="min-h-screen bg-base-200 p-4 md:p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-col gap-4 rounded-box bg-base-100 p-5 shadow-xl md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Windmill Fleet Overview</h1>
                        <p className="text-sm opacity-70">Live status snapshot for quick monitoring and alerting.</p>
                    </div>
                    <button
                        className={`btn ${muteAlerts ? "btn-outline" : "btn-primary"}`}
                        onClick={() => setMuteAlerts((prev) => !prev)}
                    >
                        {muteAlerts ? "Alerts muted" : "Alert sound on"}
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Total</div>
                        <div className="stat-value text-2xl">{counters.total}</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Running</div>
                        <div className="stat-value text-2xl text-success">{counters.running}</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Warnings</div>
                        <div className="stat-value text-2xl text-warning">{counters.warnings}</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Errors</div>
                        <div className="stat-value text-2xl text-error">{counters.errors}</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Critical</div>
                        <div className="stat-value text-2xl text-secondary">{counters.critical}</div>
                    </div>
                </div>

                <div className="rounded-box bg-base-100 p-4 shadow-lg">
                    <h2 className="mb-3 text-lg font-semibold">Alert feed</h2>
                    {alertFeed.length === 0 && <p className="text-sm opacity-70">No active alerts.</p>}
                    {alertFeed.length > 0 && (
                        <div className="space-y-2">
                            {alertFeed.map((alert) => (
                                <div key={alert.id} className="flex flex-wrap items-center justify-between gap-2 rounded-box bg-base-200 p-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`badge ${severityBadgeClass[alert.severity]}`}>{alert.severity.toUpperCase()}</span>
                                        <span className="font-medium">{alert.turbineName}</span>
                                        <span className="text-sm opacity-70">{alert.message}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs opacity-60">{alert.at}</span>
                                        <button
                                            className="btn btn-xs btn-outline"
                                            onClick={() => playSeverityTone(alert.severity)}
                                        >
                                            Test sound
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {windMills.length === 0 && (
                    <div className="rounded-box bg-base-100 p-6 text-sm opacity-70 shadow">Waiting for telemetry...</div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                    {windMills.map((wm) => {
                        const status: TurbineStatus = wm.measurement.isRunning ? "running" : "stopped";
                        const turbineName = wm.measurement.turbineName ?? wm.measurement.turbineId ?? "Unknown";
                        const turbineId = wm.measurement.turbineId ?? "unknown";
                        const heartbeat = getHeartbeatState(wm.measurement.timestamp, nowMs);

                        return (
                            <button
                                key={turbineId}
                                className="card cursor-pointer bg-base-100 text-left shadow-lg transition hover:-translate-y-1 hover:shadow-2xl"
                                onClick={() => navigate(`/device/${turbineId}`)}
                            >
                                <div className="card-body gap-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="card-title">{turbineName}</h3>
                                            <p className="text-sm opacity-70">{turbineId}</p>
                                            <div className="mt-1 flex items-center gap-2 text-xs">
                                                <span className={`inline-block h-2 w-2 rounded-full ${heartbeat.dotClass} ${heartbeat.label === "Live" ? "animate-pulse" : ""}`}/>
                                                <span className={`badge badge-xs ${heartbeat.badgeClass}`}>{heartbeat.label}</span>
                                                <span className="opacity-60">
                                                    {heartbeat.ageSeconds === null ? "timestamp missing" : `${heartbeat.ageSeconds}s ago`}
                                                </span>
                                            </div>
                                        </div>
                                        <WindmillVisual status={status}/>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                                        <div className="rounded-box bg-base-200 p-2">
                                            <div className="opacity-70">Power output</div>
                                            <div className="text-base font-semibold">{(wm.measurement.powerOutput ?? 0).toFixed(1)} kW</div>
                                        </div>
                                        <div className="rounded-box bg-base-200 p-2">
                                            <div className="opacity-70">Wind speed</div>
                                            <div className="text-base font-semibold">{(wm.measurement.windSpeed ?? 0).toFixed(1)} m/s</div>
                                        </div>
                                        <div className="rounded-box bg-base-200 p-2">
                                            <div className="opacity-70">Rotor speed</div>
                                            <div className="text-base font-semibold">{(wm.measurement.rotorSpeed ?? 0).toFixed(1)} rpm</div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="mb-2 text-sm font-medium">Energy output trend</div>
                                        <Sparkline points={wm.powerHistory}/>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`badge ${status === "running" ? "badge-success" : "badge-error"}`}>
                                            {status.toUpperCase()}
                                        </span>
                                        {wm.alerts.length === 0 && <span className="badge badge-ghost">No active alerts</span>}
                                        {wm.alerts.map((alert) => (
                                            <span key={alert.id} className={`badge ${severityBadgeClass[alert.severity]}`}>
                                                {alert.severity}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AllWindMills;


