import {useMemo} from "react";
import {Link, useParams} from "react-router-dom";

type TrendSeries = {
    label: string;
    unit: string;
    color: string;
    points: number[];
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
    const {roomName} = useParams();

    const series = useMemo<TrendSeries[]>(() => [
        {
            label: "Power output",
            unit: "kW",
            color: "#00b5ff",
            points: [980, 1002, 1110, 1180, 1220, 1270, 1250, 1295, 1320]
        },
        {
            label: "Wind speed",
            unit: "m/s",
            color: "#34d399",
            points: [7.1, 7.5, 8.0, 8.2, 8.5, 8.4, 8.9, 9.1, 8.8]
        },
        {
            label: "Generator temperature",
            unit: "C",
            color: "#fb7185",
            points: [47.5, 49.1, 50.2, 51.7, 52.3, 53.6, 54.8, 55.1, 54.4]
        },
        {
            label: "Vibration",
            unit: "mm/s",
            color: "#f59e0b",
            points: [1.8, 2.0, 2.1, 2.2, 2.45, 2.3, 2.4, 2.6, 2.5]
        }
    ], []);

    return (
        <div className="min-h-screen bg-base-200 p-4 md:p-8">
            <div className="mx-auto max-w-7xl space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-box bg-base-100 p-5 shadow-xl">
                    <div>
                        <p className="text-sm opacity-70">Windmill detail</p>
                        <h1 className="text-2xl font-bold">{roomName ?? "Windmill"}</h1>
                    </div>
                    <Link to="/dashboard" className="btn btn-outline">Back to overview</Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Current power</div>
                        <div className="stat-value text-primary">1250.5</div>
                        <div className="stat-desc">kW</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Wind speed</div>
                        <div className="stat-value text-success">8.5</div>
                        <div className="stat-desc">m/s</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Generator temp</div>
                        <div className="stat-value text-warning">52.3</div>
                        <div className="stat-desc">C</div>
                    </div>
                    <div className="stat rounded-box bg-base-100 shadow">
                        <div className="stat-title">Status</div>
                        <div className="stat-value text-success">RUNNING</div>
                        <div className="stat-desc">Last updated now</div>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    {series.map((item) => (
                        <div key={item.label} className="rounded-box bg-base-100 p-4 shadow-lg">
                            <div className="mb-2 flex items-center justify-between">
                                <h2 className="font-semibold">{item.label}</h2>
                                <span className="text-xs opacity-70">Last 9 samples ({item.unit})</span>
                            </div>
                            <Sparkline points={item.points} color={item.color}/>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OneWindMill;

