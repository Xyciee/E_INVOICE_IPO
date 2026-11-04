import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '40px 24px',
            maxWidth: '600px',
            margin: '40px auto',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--accent-rose, #ef4444)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}
          >
            <AlertTriangle size={24} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
            {this.state.error?.message || 'An unexpected rendering error occurred in this view.'}
          </p>
          <button
            className="btn btn-primary"
            onClick={this.handleReset}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
          >
            <RefreshCw size={15} />
            <span>Reload View</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

