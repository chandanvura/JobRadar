import {Component, type ReactNode} from 'react';

/** Catch render failures without deleting private storage or reloading in a loop. */
export class AppErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {
    return {failed: true};
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="mx-auto max-w-xl p-6" role="alert">
      <h1 className="text-2xl font-bold">JobRadar could not display this page</h1>
      <p className="mt-3">Your browser data has not been cleared. Unsaved changes may need to be entered again.</p>
      <p className="mt-3">Try opening the dashboard again. If the problem continues, keep this browser data and report the problem before clearing anything.</p>
      <button type="button" onClick={() => this.setState({failed: false})}
        className="mt-5 rounded-lg border px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
        Try again
      </button>
    </main>;
  }
}
