import './global.css';
import { QueryProvider } from '@/providers/QueryProvider';

export const metadata = {
  title: 'PLEXO',
  description: 'PLEXO — ERP SaaS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
