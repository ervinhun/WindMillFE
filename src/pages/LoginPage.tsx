import {useState} from "react";

const LoginPage = () => {
    //const API_URL = import.meta.env.API_URL;

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, ] = useState('');
    const [loading, ] = useState(true);

    return (
        <div className="flex min-h-screen items-center justify-center bg-base-200">
            <div className="card w-full max-w-sm bg-base-100 shadow-xl">
                <div className="card-body">
                    <h2 className="card-title justify-center text-2xl font-bold">Welcome</h2>

                    <form className="space-y-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Username</span>
                            </label>
                            <input
                                type="text"
                                placeholder="Enter username"
                                className="input input-bordered"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Password</span>
                            </label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                className="input input-bordered"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-error mt-2 text-center">
                                {error}
                            </div>
                        )}

                        <div className="form-control mt-6">
                            <button
                                type="submit"
                                className={`btn btn-primary ${loading ? 'btn-disabled' : ''}`}
                                disabled={loading}
                            >
                                {loading && <span className="loading loading-spinner"></span>}
                                Login
                            </button>
                        </div>
                    </form>

                    <div className="divider text-xs opacity-50">OR</div>
                </div>
            </div>
        </div>
    )
}

export default LoginPage;

