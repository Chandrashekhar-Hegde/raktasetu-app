import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GoogleOnboarding from '../screens/GoogleOnboarding.jsx';
import HospitalPending from '../screens/HospitalPending.jsx';
import Login from '../screens/Login.jsx';
import Register from '../screens/Register.jsx';
import { T } from '../theme.js';

const completeGoogleOnboarding = vi.fn();
const register = vi.fn();
const login = vi.fn();
vi.mock('../hooks/useAuth.js', () => ({
  useAuth: () => ({ completeGoogleOnboarding, register, login, loginWithGoogle: vi.fn(), restoreAccount: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  completeGoogleOnboarding.mockReset();
  register.mockReset();
  login.mockReset();
});

describe('identity state screens', () => {
  it('explains that hospital access remains blocked pending approval', () => {
    render(<MemoryRouter><HospitalPending /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /application is pending/i })).toBeInTheDocument();
    expect(screen.getByText(/sign-in remains blocked/i)).toBeInTheDocument();
  });

  it('requires explicit consent before Google onboarding submits', async () => {
    sessionStorage.setItem('google_onboarding_token', 'a'.repeat(48));
    render(<MemoryRouter><GoogleOnboarding /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+919876543210' } });
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByLabelText(/Sex \(NBTC interval\)/i), { target: { value: 'male' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Hubballi' } });
    fireEvent.click(screen.getByRole('button', { name: /create donor account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/consent is required/i);
    expect(completeGoogleOnboarding).not.toHaveBeenCalled();
  });

  it('sets explicit ink color on register light inputs', () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );
    const nameInput = screen.getByLabelText('Full name');
    expect(nameInput).toHaveStyle({ color: T.ink, background: T.card });
    expect(nameInput.style.color.toLowerCase()).not.toBe('#fff');
    expect(nameInput.style.color.toLowerCase()).not.toBe('rgb(255, 255, 255)');
  });

  it('shows a temporary-unavailable message when sign-in hits a database outage', async () => {
    login.mockRejectedValue({
      response: { data: { error: { code: 'COMPUTE_QUOTA_EXCEEDED', message: 'Database compute quota exceeded' } } },
    });
    render(
      <MemoryRouter initialEntries={['/login?role=hospital']}>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/phone or email/i), { target: { value: '9999999999' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i);
    expect(login).toHaveBeenCalled();
  });
});
