import { redirect } from 'next/navigation';
import Page from '../src/app/page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('Page', () => {
  it('redirects to /login - this route has no UI of its own', () => {
    Page();

    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
