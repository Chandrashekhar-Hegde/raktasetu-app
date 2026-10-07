import React from 'react';

// Last line of defence: a render error shows a way out instead of a blank screen.
export default class ErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[RaktaSetu] Screen crashed:', error?.message);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center', fontFamily: 'system-ui', background: '#F5F3F0', color: '#17151A' }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Something went wrong / ಏನೋ ತಪ್ಪಾಗಿದೆ</h1>
          <p style={{ marginTop: 12, color: '#5C5650' }}>Your data is safe. Go back to the home screen and try again.</p>
          <button type="button" onClick={() => { window.location.href = '/'; }} style={{ minHeight: 44, marginTop: 18, padding: '10px 18px', border: 0, borderRadius: 8, background: '#7A1626', color: '#fff', fontWeight: 700 }}>
            Go to home
          </button>
        </div>
      </div>
    );
  }
}
