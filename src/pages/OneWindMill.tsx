import {useEffect, useMemo, useState} from "react";
import {Link, useParams} from "react-router-dom";
import {StateleSSEClient} from "statele-sse";
import {
    type ActionRequest,
    type TurbineAlert,
    type TurbineTelemetry,
    WebClientClient
} from "../generated-ts-client.ts";

type TrendSeries = {
    label: string;
    unit: string;
    color: string;
    points: number[];
};

type AlertSeverity = "warning" | "error" | "critical";

const BASE_URL = import.meta.env.VITE_API_URL;
const sse = new StateleSSEClient(BASE_URL + "/sse");
const restClient = new WebClientClient(BASE_URL);

const MAX_POINTS_PER_TURBINE = 32;

const toTimestamp = (value?: string) => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeSeverity = (value?: string): AlertSeverity => {
    const normalized = value?.toLowerCase();
    if (normalized === "warning" || normalized === "error" || normalized === "critical") return normalized;
    return "warning";
};

const normalizePayload = <T,>(payload: unknown): {items: T[]; isSnapshot: boolean} => {
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

const mergeAlerts = (prev: TurbineAlert[], incoming: TurbineAlert[], isSnapshot: boolean) => {
    const base = isSnapshot ? incoming : [...incoming, ...prev];
    const dedup = new Map<string, TurbineAlert>();

    for (const item of base) {
        const key = item.id !== undefined
            ? `id:${item.id}`
            : `${item.turbineId ?? "t"}-${item.timestamp ?? ""}-${item.message ?? ""}`;
        dedup.set(key, item);
    }

    return [...dedup.values()].sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp)).slice(0, 120);
};

const severityBadgeClass: Record<AlertSeverity, string> = {
    warning: "badge-warning",
    error: "badge-error",
    critical: "badge-secondary"
};

const parseRoleFromToken = (token: string): string | null => {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
        const raw = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const json = JSON.parse(raw) as Record<string, unknown>;
        const role = json.role ?? json.roleName ?? json["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];
        return typeof role === "string" ? role : null;
    } catch {
        return null;
    }
};

const getCurrentRole = () => {
    if (typeof window === "undefined") return "viewer";
    const direct = localStorage.getItem("roleName") ?? localStorage.getItem("role") ?? localStorage.getItem("userRole");
    if (direct) return direct.toLowerCase();

    const token = localStorage.getItem("token") ?? localStorage.getItem("accessToken") ?? localStorage.getItem("authToken");
    if (!token) return "viewer";
    const parsed = parseRoleFromToken(token);
    return parsed?.toLowerCase() ?? "viewer";
};

const Sparkline = ({points, color}: {points: number[]; color: string}) => {
    if (points.length < 2) return null;

    const max = Math.max(...points);
    const min = Math.min(...points);
    const spread = Math.max(max - min, 1);

    const svgPath = points.map((value, index) => {
        const x = (index / (points.length - 1)) * 100;
        const y = 100 - ((value - min) / spread) * 100;
        return `${x},${y}`;
    }).join(" ");

    return (
        <div className="h-28 w-full rounded-box bg-base-200 p-3">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                <polyline fill="none" stroke={color} strokeWidth="3" points={svgPath}/>
            </svg>
        </div>
    );
};

const OneWindMill = () => {
    const {deviceId} = useParams();
    const [measurements, setMeasurements] = useState<TurbineTelemetry[]>([]);
    const [alerts, setAlerts] = useState<TurbineAlert[]>([]);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [reportingInterval, setReportingInterval] = useState(10);
    const [pitchAngle, setPitchAngle] = useState(10);
    const [stopReason, setStopReason] = useState("");
    const [actionMessage, setActionMessage] = useState<string>("");
    const [actionLoading, setActionLoading] = useState(false);

    const role = useMemo(() => getCurrentRole(), []);
    const canControl = role === "admin" || role === "engineer";

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
            const {items, isSnapshot} = normalizePayload<TurbineAlert>(payload);
            setAlerts((prev) => mergeAlerts(prev, items, isSnapshot));
        });

        return () => {
            unsub?.();
        };
    }, []);

    const measurementsForTurbine = useMemo(() => {
        return measurements
            .filter((m) => m.turbineId === deviceId)
            .sort((a, b) => toTimestamp(a.timestamp) - toTimestamp(b.timestamp));
    }, [measurements, deviceId]);

    const latest = measurementsForTurbine[measurementsForTurbine.length - 1];

    const secondsSinceUpdate = useMemo(() => {
        const ts = toTimestamp(latest?.timestamp);
        if (ts <= 0) return null;
        return Math.max(0, Math.floor((nowMs - ts) / 1000));
    }, [latest?.timestamp, nowMs]);

    const heartbeatClass = secondsSinceUpdate === null
        ? "badge-ghost"
        : secondsSinceUpdate <= 15
            ? "badge-success"
            : secondsSinceUpdate <= 45
                ? "badge-warning"
                : "badge-error";

    const series = useMemo<TrendSeries[]>(() => [
        {
            label: "Power output",
            unit: "kW",
            color: "#00b5ff",
            points: measurementsForTurbine.map((m) => m.powerOutput).filter((v): v is number => typeof v === "number")
        },
        {
            label: "Wind speed",
            unit: "m/s",
            color: "#34d399",
            points: measurementsForTurbine.map((m) => m.windSpeed).filter((v): v is number => typeof v === "number")
        },
        {
            label: "Generator temperature",
            unit: "C",
            color: "#fb7185",
            points: measurementsForTurbine.map((m) => m.generatorTemp).filter((v): v is number => typeof v === "number")
        },
        {
            label: "Vibration",
            unit: "mm/s",
            color: "#f59e0b",
            points: measurementsForTurbine.map((m) => m.vibration).filter((v): v is number => typeof v === "number")
        }
    ], [measurementsForTurbine]);

    const turbineAlerts = useMemo(() => {
        return alerts
            .filter((a) => a.turbineId === deviceId)
            .sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp))
            .slice(0, 8);
    }, [alerts, deviceId]);

    const sendAction = async (payload: ActionRequest) => {
        if (!latest?.turbineId || !latest.farmId) return;
        setActionLoading(true);
        setActionMessage("");
        try {
            await restClient.setAction(payload);
            setActionMessage(`Action '${payload.action}' sent successfully.`);
        } catch {
            setActionMessage(`Failed to send '${payload.action}'.`);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-base-200 p-4 md:p-8">
            <div className="mx-auto max-w-7xl space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-box bg-base-100 p-5 shadow-xl">
                    <div>
                        <p className="text-sm opacity-70">Windmill detail</p>
                        <h1 className="text-2xl font-bold">{latest?.turbineName ?? deviceId ?? "Windmill"}</h1>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                            <span className={`badge badge-xs ${heartbeatClass}`}>
                                {secondsSinceUpdate === null ? "No signal" : `${secondsSinceUpdate}s ago`}
                            </span>
                            <span className="opacity-70">live heartbeat</span>
                        </div>
                    </div>
                    <Link to="/dashboard" className="btn btn-outline">Back to overview</Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Current power</div>
                        <div className="stat-value text-primary">{(latest?.powerOutput ?? 0).toFixed(1)}</div>
                        <div className="stat-desc">kW</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Wind speed</div>
                        <div className="stat-value text-success">{(latest?.windSpeed ?? 0).toFixed(1)}</div>
                        <div className="stat-desc">m/s</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Generator temp</div>
                        <div className="stat-value text-warning">{(latest?.generatorTemp ?? 0).toFixed(1)}</div>
                        <div className="stat-desc">C</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Status</div>
                        <div className={`stat-value ${(latest?.isRunning ?? false) ? "text-success" : "text-error"}`}>
                            {(latest?.isRunning ?? false) ? "RUNNING" : "STOPPED"}
                        </div>
                        <div className="stat-desc">
                            {secondsSinceUpdate === null ? "No timestamp" : `Last updated ${secondsSinceUpdate}s ago`}
                        </div>
                    </div>
                </div>

                {canControl && latest && (
                    <div className="rounded-box bg-base-100 p-4 shadow-lg">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold">Control panel</h2>
                            <span className="badge badge-outline">Role: {role}</span>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-box bg-base-200 p-3">
                                <label className="label"><span className="label-text">Set reporting interval (1-60s)</span></label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min={1}
                                        max={60}
                                        className="input input-bordered w-full"
                                        value={reportingInterval}
                                        onChange={(e) => setReportingInterval(Number(e.target.value))}
                                    />
                                    <button
                                        className="btn btn-primary"
                                        disabled={actionLoading}
                                        onClick={() => sendAction({
                                            farmId: latest.farmId,
                                            turbineId: latest.turbineId,
                                            action: "setInterval",
                                            value: Math.min(60, Math.max(1, reportingInterval))
                                        })}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-box bg-base-200 p-3">
                                <label className="label"><span className="label-text">Set blade pitch (0-30 deg)</span></label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        max={30}
                                        step={0.1}
                                        className="input input-bordered w-full"
                                        value={pitchAngle}
                                        onChange={(e) => setPitchAngle(Number(e.target.value))}
                                    />
                                    <button
                                        className="btn btn-primary"
                                        disabled={actionLoading}
                                        onClick={() => sendAction({
                                            farmId: latest.farmId,
                                            turbineId: latest.turbineId,
                                            action: "setPitch",
                                            angle: Math.min(30, Math.max(0, pitchAngle))
                                        })}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 rounded-box bg-base-200 p-3">
                            {(latest.isRunning ?? false) ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="Reason (optional)"
                                        className="input input-bordered w-full md:w-96"
                                        value={stopReason}
                                        onChange={(e) => setStopReason(e.target.value)}
                                    />
                                    <button
                                        className="btn btn-error"
                                        disabled={actionLoading}
                                        onClick={() => sendAction({
                                            farmId: latest.farmId,
                                            turbineId: latest.turbineId,
                                            action: "stop",
                                            reason: stopReason.trim() || undefined
                                        })}
                                    >
                                        Stop turbine
                                    </button>
                                </div>
                            ) : (
                                <button
                                    className="btn btn-success"
                                    disabled={actionLoading}
                                    onClick={() => sendAction({
                                        farmId: latest.farmId,
                                        turbineId: latest.turbineId,
                                        action: "start"
                                    })}
                                >
                                    Start turbine
                                </button>
                            )}
                        </div>

                        {actionMessage && <p className="mt-3 text-sm opacity-80">{actionMessage}</p>}
                    </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                    {series.map((item) => (
                        <div key={item.label} className="rounded-box bg-base-100 p-4 shadow-lg">
                            <div className="mb-2 flex items-center justify-between">
                                <h2 className="font-semibold">{item.label}</h2>
                                <span className="text-xs opacity-70">Last {item.points.length} samples ({item.unit})</span>
                            </div>
                            <Sparkline points={item.points} color={item.color}/>
                        </div>
                    ))}
                </div>

                <div className="rounded-box bg-base-100 p-4 shadow-lg">
                    <h2 className="mb-3 text-lg font-semibold">Recent alerts</h2>
                    {turbineAlerts.length === 0 && <p className="text-sm opacity-70">No recent alerts.</p>}
                    <div className="space-y-2">
                        {turbineAlerts.map((alert) => {
                            const severity = normalizeSeverity(alert.severity);
                            return (
                                <div key={String(alert.id ?? `${alert.timestamp}-${alert.message}`)} className="flex items-center justify-between rounded-box bg-base-200 p-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`badge ${severityBadgeClass[severity]}`}>{severity.toUpperCase()}</span>
                                        <span>{alert.message ?? "No message"}</span>
                                    </div>
                                    <span className="text-xs opacity-70">
                                        {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : "-"}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OneWindMill;

