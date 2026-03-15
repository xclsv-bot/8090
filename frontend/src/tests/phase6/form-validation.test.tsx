import { useState } from 'react';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function TestSignupForm({ onSubmit }: { onSubmit: (data: { email: string; password: string }) => void }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const result = signupSchema.safeParse(form);
    if (!result.success) {
      const nextErrors: { email?: string; password?: string } = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof typeof nextErrors;
        nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    onSubmit(result.data);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="email">Email</label>
      <Input
        id="email"
        type="email"
        value={form.email}
        onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
        aria-invalid={Boolean(errors.email)}
      />
      {errors.email && <p role="alert">{errors.email}</p>}

      <label htmlFor="password">Password</label>
      <Input
        id="password"
        type="password"
        value={form.password}
        onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
        aria-invalid={Boolean(errors.password)}
      />
      {errors.password && <p role="alert">{errors.password}</p>}

      <Button type="submit">Submit</Button>
    </form>
  );
}

describe('Phase 6 - form validation', () => {
  it('shows Zod errors for invalid inputs', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<TestSignupForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'invalid-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByText('Please enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('submits when form is valid and clears error state', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<TestSignupForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'invalid-email');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByText('Please enter a valid email')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'valid@example.com');
    await user.type(screen.getByLabelText('Password'), 'strongpass123');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.queryByText('Please enter a valid email')).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'valid@example.com',
      password: 'strongpass123',
    });
  });
});
