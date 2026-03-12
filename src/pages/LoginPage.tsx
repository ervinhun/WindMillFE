import {useState} from "react";
import {useNavigate} from "react-router-dom";

const LoginPage = () => {
    const API_URL = import.meta.env.VITE_API_URL;

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Updated to use the environment variable
            const response = await fetch(`${API_URL}/api/Login/Login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ UserName: username, Password: password }),
            });

            if (!response.ok) {
                // Try to get error message from backend if available
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Invalid username or password');
            }

            const data = await response.json();

            // Store the token and user info
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.userName);
            localStorage.setItem('role', data.role);

            // Redirect to Dashboard
            navigate('/dashboard');
        } catch (err: any) {
            setError(err.message || 'An error occurred during login');
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="flex min-h-screen items-center justify-center bg-base-200">
            <div className="card w-full max-w-sm bg-base-100 shadow-xl">
                <div className="card-body">
                    <h2 className="card-title justify-center text-2xl font-bold">Welcome</h2>

                    <form className="space-y-4" onSubmit={handleLogin}>
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
                </div>
            </div>
        </div>
    )
}

export default LoginPage;

