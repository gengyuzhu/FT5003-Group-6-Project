import { Component } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle } from "react-icons/fi";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4">
          <div className="glass-card max-w-md w-full p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <FiAlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold gradient-text">
              Oops! Something went wrong
            </h1>
            <p className="text-dark-300 text-sm">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <Link
              to="/"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn-primary inline-flex items-center gap-2 px-6 py-2.5"
            >
              Go Home
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
