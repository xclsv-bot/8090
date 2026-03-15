import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { AuthTokenProvider } from '@/components/auth/AuthTokenProvider';
import SignInPage from '@/app/sign-in/[[...sign-in]]/page';
import middleware from '@/middleware';

const useAuthMock = vi.fn();
const setAuthTokenMock = vi.fn();
const signInRenderMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
  SignIn: (props: Record<string, unknown>) => {
    signInRenderMock(props);
    return <div data-testid="sign-in-component">SignIn</div>;
  },
}));

vi.mock('@/lib/api', () => ({
  setAuthToken: (...args: unknown[]) => setAuthTokenMock(...args),
}));

vi.mock('@clerk/nextjs/server', () => ({
  createRouteMatcher:
    (patterns: string[]) => (request: { nextUrl?: { pathname?: string }; pathname?: string }) => {
      const path = request.nextUrl?.pathname || request.pathname || '';
      return patterns.some((pattern) => {
        const normalized = pattern.replace('(.*)', '.*');
        return new RegExp(`^${normalized}$`).test(path);
      });
    },
  clerkMiddleware:
    (handler: (auth: { protect: () => Promise<void> }, request: { nextUrl: { pathname: string } }) => Promise<void>) =>
    (auth: { protect: () => Promise<void> }, request: { nextUrl: { pathname: string } }) =>
      handler(auth, request),
}));

describe('Phase 6 - auth flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      getToken: vi.fn(),
    });
  });

  it('renders login page through Clerk SignIn', () => {
    render(<SignInPage />);

    expect(screen.getByTestId('sign-in-component')).toBeInTheDocument();
    expect(signInRenderMock).toHaveBeenCalled();
  });

  it('syncs token on login and clears token on logout', async () => {
    const getTokenMock = vi.fn().mockResolvedValue('token-123');

    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      getToken: getTokenMock,
    });

    const { rerender } = render(
      <AuthTokenProvider>
        <div>Child</div>
      </AuthTokenProvider>
    );

    await waitFor(() => {
      expect(setAuthTokenMock).toHaveBeenCalledWith('token-123');
    });

    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      getToken: getTokenMock,
    });

    rerender(
      <AuthTokenProvider>
        <div>Child</div>
      </AuthTokenProvider>
    );

    await waitFor(() => {
      expect(setAuthTokenMock).toHaveBeenCalledWith(null);
    });
  });

  it('protects private routes and allows public auth routes', async () => {
    const protectMock = vi.fn().mockResolvedValue(undefined);

    await middleware(
      { protect: protectMock },
      { nextUrl: { pathname: '/events' } } as { nextUrl: { pathname: string } }
    );
    expect(protectMock).toHaveBeenCalledTimes(1);

    await middleware(
      { protect: protectMock },
      { nextUrl: { pathname: '/sign-in' } } as { nextUrl: { pathname: string } }
    );
    expect(protectMock).toHaveBeenCalledTimes(1);
  });
});
