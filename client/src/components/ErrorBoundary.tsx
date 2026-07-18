import React from "react";

interface Props {
  children: React.ReactNode;
  /** Shown in place of the crashed subtree. Defaults to a compact inline notice. */
  fallback?: React.ReactNode;
  /** Optional label for logging which block failed. */
  label?: string;
}
interface State {
  hasError: boolean;
}

/**
 * Localized error boundary.
 * Wrap risky render blocks (dropdowns, selects) so a broken selection hook
 * or null data shape degrades that block only — never the whole view.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Swallow — keep the surrounding view alive. Log for diagnostics.
    console.warn(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`, error);
  }

  // Allow a re-render attempt once the surrounding state changes
  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded px-2 py-1.5">
            field unavailable
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
