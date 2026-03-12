import {useEffect, useMemo, useState} from "react";
import {Link, useParams} from "react-router-dom";
import {type ActionRequest} from "../generated-ts-client.ts";
import {getSharedWebClient} from "../util/apiClient.ts";
import {getCurrentRole} from "../util/auth.ts";
import {
    dismissAlert,
    getAlertId,
    normalizeSeverity,
    restoreDismissedAlerts,
    toTimestamp,
    type AlertSeverity,
    useWindmillRealtime
} from "../util/windmillRealtime.ts";

type TrendSeries = {
    label: string;
    unit: string;
    color: string;
    points: number[];
};

type TelemetryField = {
    label: string;
    value: string;
    tone?: string;
};

const severityBadgeClass: Record<AlertSeverity, string> = {
    warning: "badge-warning",
    error: "badge-error",
    critical: "badge-secondary"
};

const formatNumber = (value: number | undefined, digits = 1, suffix = "") =>
    typeof value === "number" ? `${value.toFixed(digits)}${suffix}` : "-";

const formatDateTime = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
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
    const restClient = useMemo(() => getSharedWebClient(), []);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [reportingInterval, setReportingInterval] = useState(10);
    const [pitchAngle, setPitchAngle] = useState(10);
    const [stopReason, setStopReason] = useState("");
    const [actionMessage, setActionMessage] = useState<string>("");
    const [actionLoading, setActionLoading] = useState(false);
    const {measurements, alerts, dismissedAlertCount} = useWindmillRealtime();

    const role = useMemo(() => getCurrentRole(), []);
    const canControl = role === "admin" || role === "engineer";

    useEffect(() => {
        const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const measurementsForTurbine = useMemo(() => {
        return measurements
            .filter((m) => m.turbineId === deviceId)
            .sort((a, b) => toTimestamp(a.timestamp) - toTimestamp(b.timestamp));
    }, [measurements, deviceId]);

    const latest = measurementsForTurbine[measurementsForTurbine.length - 1];

    useEffect(() => {
        if (typeof latest?.bladePitch === "number") {
            setPitchAngle(latest.bladePitch);
        }
    }, [latest?.bladePitch, latest?.timestamp]);

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

    const telemetryFields = useMemo<TelemetryField[]>(() => {
        if (!latest) return [];

        return [
            {label: "Measurement ID", value: latest.id !== undefined ? String(latest.id) : "-"},
            {label: "Turbine ID", value: latest.turbineId ?? "-"},
            {label: "Turbine name", value: latest.turbineName ?? "-"},
            {label: "Farm ID", value: latest.farmId ?? "-"},
            {label: "Timestamp", value: formatDateTime(latest.timestamp)},
            {label: "Created at", value: formatDateTime(latest.createdAt)},
            {label: "Wind speed", value: formatNumber(latest.windSpeed, 1, " m/s")},
            {label: "Wind direction", value: formatNumber(latest.windDirection, 1, "°")},
            {label: "Ambient temperature", value: formatNumber(latest.ambientTemperature, 1, " °C")},
            {label: "Rotor speed", value: formatNumber(latest.rotorSpeed, 1, " rpm")},
            {label: "Power output", value: formatNumber(latest.powerOutput, 1, " kW"), tone: "text-primary"},
            {label: "Nacelle direction", value: formatNumber(latest.nacelleDirection, 1, "°")},
            {label: "Blade pitch", value: formatNumber(latest.bladePitch, 1, "°")},
            {label: "Generator temperature", value: formatNumber(latest.generatorTemp, 1, " °C"), tone: "text-warning"},
            {label: "Gearbox temperature", value: formatNumber(latest.gearboxTemp, 1, " °C")},
            {label: "Vibration", value: formatNumber(latest.vibration, 2, " mm/s")},
            {
                label: "Operating state",
                value: latest.isRunning ? "RUNNING" : "STOPPED",
                tone: latest.isRunning ? "text-success" : "text-error"
            }
        ];
    }, [latest]);

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

                <div className="rounded-box bg-base-100 p-4 shadow-lg">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">Live telemetry details</h2>
                            <p className="text-sm opacity-70">Latest values from the selected windmill measurement.</p>
                        </div>
                        <span className="badge badge-outline">
                            {secondsSinceUpdate === null ? "No timestamp" : `Updated ${secondsSinceUpdate}s ago`}
                        </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {telemetryFields.map((field) => (
                            <div key={field.label} className="rounded-box bg-base-200 p-3">
                                <div className="text-xs uppercase tracking-wide opacity-60">{field.label}</div>
                                <div className={`mt-2 text-base font-semibold ${field.tone ?? ""}`}>{field.value}</div>
                            </div>
                        ))}
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
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-lg font-semibold">Recent alerts</h2>
                        {dismissedAlertCount > 0 && (
                            <button className="btn btn-xs btn-outline" onClick={restoreDismissedAlerts}>
                                Restore dismissed ({dismissedAlertCount})
                            </button>
                        )}
                    </div>
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
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs opacity-70">
                                            {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : "-"}
                                        </span>
                                        <button
                                            className="btn btn-xs btn-ghost"
                                            onClick={() => dismissAlert(getAlertId(alert))}
                                        >
                                            Dismiss
                                        </button>
                                    </div>
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

