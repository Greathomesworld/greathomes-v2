/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex-grow p-6">
        <h1 className="text-4xl font-display font-semibold">Great Homes</h1>
        <p className="text-xl text-foreground/70">Welcome to Great Homes V2.</p>
      </main>
      <Footer />
    </div>
  );
}

