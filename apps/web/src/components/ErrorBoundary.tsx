import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg">
          <div className="text-center p-8">
            <h1 className="text-xl font-semibold text-green-dark mb-2">Terjadi kesalahan</h1>
            <p className="text-text-2 text-sm mb-4">Aplikasi mengalami kesalahan yang tidak terduga.</p>
            <button
              type="button"
              className="inline-block py-[9px] px-[18px] bg-primary text-white border border-primary rounded-btn cursor-pointer font-sans font-medium text-[13px] transition-all duration-200 hover:bg-green-dark hover:border-green-dark"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Muat ulang halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
