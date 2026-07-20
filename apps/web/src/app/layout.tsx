import './global.css';

export const metadata = {
  title: 'PLEXO',
  description: 'PLEXO — ERP SaaS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
