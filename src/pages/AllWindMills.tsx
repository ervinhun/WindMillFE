import {useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";

type TurbineStatus = "running" | "stopped";
type AlertSeverity = "warning" | "error" | "critical";

interface WindMillMeasurement {
    turbineId: string;
    turbineName: string;
    farmId: string;
    timestamp: string;
    windSpeed: number;
    windDirection: number;
    ambientTemperature: number;
    rotorSpeed: number;
    powerOutput: number;
    nacelleDirection: number;
    bladePitch: number;
    generatorTemp: number;
    gearboxTemp: number;
    vibration: number;
    status: TurbineStatus;
}

interface TurbineAlert {
    id: string;
    severity: AlertSeverity;
    message: string;
    at: string;
}

interface WindMillCardData {
    measurement: WindMillMeasurement;
    alerts: TurbineAlert[];
    powerHistory: number[];
}

const mockWindMills: WindMillCardData[] = [
    {
        measurement: {
            turbineId: "turbine-alpha",
            turbineName: "Alpha",
            farmId: "farm-north",
            timestamp: "2024-01-15T10:30:00.000Z",
            windSpeed: 8.5,
            windDirection: 245.3,
            ambientTemperature: 12.4,
            rotorSpeed: 14.2,
            powerOutput: 1250.5,
            nacelleDirection: 243.1,
            bladePitch: 7.2,
            generatorTemp: 52.3,
            gearboxTemp: 48.1,
            vibration: 2.45,
            status: "running"
        },
        alerts: [],
        powerHistory: [980, 1020, 1110, 1170, 1220, 1280, 1250]
    },
    {
        measurement: {
            turbineId: "turbine-bravo",
            turbineName: "Bravo",
            farmId: "farm-north",
            timestamp: "2024-01-15T10:31:00.000Z",
            windSpeed: 6.1,
            windDirection: 198.7,
            ambientTemperature: 11.9,
            rotorSpeed: 9.8,
            powerOutput: 740.3,
            nacelleDirection: 202.2,
            bladePitch: 9.6,
            generatorTemp: 59.5,
            gearboxTemp: 56.8,
            vibration: 3.7,
            status: "running"
        },
        alerts: [
            {id: "b1", severity: "warning", message: "Rising vibration trend", at: "10:31"}
        ],
        powerHistory: [860, 820, 790, 770, 760, 745, 740]
    },
    {
        measurement: {
            turbineId: "turbine-charlie",
            turbineName: "Charlie",
            farmId: "farm-north",
            timestamp: "2024-01-15T10:31:00.000Z",
            windSpeed: 0.9,
            windDirection: 176.1,
            ambientTemperature: 10.2,
            rotorSpeed: 0,
            powerOutput: 0,
            nacelleDirection: 176.2,
            bladePitch: 23.3,
            generatorTemp: 42.2,
            gearboxTemp: 39.5,
            vibration: 0.4,
            status: "stopped"
        },
        alerts: [
            {id: "c1", severity: "error", message: "Unexpected stop event", at: "10:27"}
        ],
        powerHistory: [430, 350, 280, 180, 90, 20, 0]
    },
    {
        measurement: {
            turbineId: "turbine-delta",
            turbineName: "Delta",
            farmId: "farm-north",
            timestamp: "2024-01-15T10:32:00.000Z",
            windSpeed: 9.2,
            windDirection: 261.4,
            ambientTemperature: 13.1,
            rotorSpeed: 15.9,
            powerOutput: 1398.7,
            nacelleDirection: 260.9,
            bladePitch: 6.1,
            generatorTemp: 76.8,
            gearboxTemp: 71.4,
            vibration: 5.9,
            status: "running"
        },
        alerts: [
            {id: "d1", severity: "critical", message: "Generator overheating", at: "10:32"}
        ],
        powerHistory: [1120, 1210, 1300, 1380, 1440, 1420, 1398]
    }
];

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

    const alertFeed = useMemo(() => {
        return mockWindMills.flatMap((item) =>
            item.alerts.map((alert) => ({
                ...alert,
                turbineName: item.measurement.turbineName,
                turbineId: item.measurement.turbineId
            }))
        );
    }, []);

    const counters = useMemo(() => {
        return {
            total: mockWindMills.length,
            running: mockWindMills.filter((wm) => wm.measurement.status === "running").length,
            warnings: alertFeed.filter((a) => a.severity === "warning").length,
            errors: alertFeed.filter((a) => a.severity === "error").length,
            critical: alertFeed.filter((a) => a.severity === "critical").length
        };
    }, [alertFeed]);

    const playSeverityTone = (severity: AlertSeverity) => {
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
    };

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

                <div className="grid gap-4 md:grid-cols-2">
                    {mockWindMills.map((wm) => (
                        <button
                            key={wm.measurement.turbineId}
                            className="card cursor-pointer bg-base-100 text-left shadow-lg transition hover:-translate-y-1 hover:shadow-2xl"
                            onClick={() => navigate(`/device/${wm.measurement.turbineId}`)}
                        >
                            <div className="card-body gap-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="card-title">{wm.measurement.turbineName}</h3>
                                        <p className="text-sm opacity-70">{wm.measurement.turbineId}</p>
                                    </div>
                                    <WindmillVisual status={wm.measurement.status}/>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                                    <div className="rounded-box bg-base-200 p-2">
                                        <div className="opacity-70">Power output</div>
                                        <div className="text-base font-semibold">{wm.measurement.powerOutput.toFixed(1)} kW</div>
                                    </div>
                                    <div className="rounded-box bg-base-200 p-2">
                                        <div className="opacity-70">Wind speed</div>
                                        <div className="text-base font-semibold">{wm.measurement.windSpeed.toFixed(1)} m/s</div>
                                    </div>
                                    <div className="rounded-box bg-base-200 p-2">
                                        <div className="opacity-70">Rotor speed</div>
                                        <div className="text-base font-semibold">{wm.measurement.rotorSpeed.toFixed(1)} rpm</div>
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-2 text-sm font-medium">Energy output trend</div>
                                    <Sparkline points={wm.powerHistory}/>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`badge ${wm.measurement.status === "running" ? "badge-success" : "badge-error"}`}>
                                        {wm.measurement.status.toUpperCase()}
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
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AllWindMills;

