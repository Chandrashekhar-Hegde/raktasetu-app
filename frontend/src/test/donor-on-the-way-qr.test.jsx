import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DonorOnTheWay from '../screens/DonorOnTheWay.jsx';

vi.mock('../api/client.js', () => ({
  default: {
    get: vi.fn(async () => ({
      data: {
        data: {
          // GET /donor/responses/:requestId
          request: {
            id: 'req-1',
            ref_code: 'RS-AB12CD34',
            hospital_name: 'City Hospital',
            hospital_address: 'Main Rd',
            response_status: 'accepted',
          },
        },
      },
    })),
    post: vi.fn(),
  },
  errMsg: (_err, fallback) => fallback,
}));

vi.mock('../components/BottomNav.jsx', () => ({
  default: () => null,
}));

afterEach(() => {
  cleanup();
});

describe('DonorOnTheWay QR contract', () => {
  it('encodes the blood request ref_code in the QR and matching text', async () => {
    render(
      <MemoryRouter initialEntries={['/on-the-way/req-1']}>
        <Routes>
          <Route path="/on-the-way/:requestId" element={<DonorOnTheWay />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('verify-qr')).toHaveAttribute('data-ref-code', 'RS-AB12CD34');
    });
    expect(screen.getByTestId('verify-ref-text')).toHaveTextContent('RS-AB12CD34');
    expect(screen.queryByText(/RS-DONOR-/)).not.toBeInTheDocument();
    expect(screen.getByText(/Main Rd/)).toBeInTheDocument(); // hospital_address, not the old `address` field
  });
});
