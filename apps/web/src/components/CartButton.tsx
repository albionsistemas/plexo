'use client';

import { cartApi, CART_QUERY_KEY } from '@/lib/inventoryCart';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBasket } from 'lucide-react';
import { useState } from 'react';
import CartDrawer from './CartDrawer';

/** Icon+badge trigger for the persistent inventory cart (see CartDrawer) -
 * same open/ref/outside-click skeleton as AppShell's OnlineColleagues/
 * UserMenu, but opens a right-anchored drawer instead of an anchored
 * popover since the cart's contents need real space (image thumbnails,
 * qty steppers, per-line remove). */
export default function CartButton() {
  const [open, setOpen] = useState(false);

  const { data: lines } = useQuery({
    queryKey: CART_QUERY_KEY,
    queryFn: cartApi.list,
    // The badge has to stay right no matter which page adds/removes items
    // (catalog grid, another tab) - a short poll is simpler than wiring a
    // websocket event for this and cheap enough at this interval.
    refetchInterval: 15_000,
  });

  const itemCount = (lines ?? []).reduce((sum, line) => sum + line.quantity, 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-600 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
        aria-label="Listado de artículos"
      >
        <ShoppingBasket className="h-5 w-5" />
        {itemCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold leading-none text-white">
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        )}
      </button>

      <CartDrawer open={open} onClose={() => setOpen(false)} lines={lines ?? []} />
    </>
  );
}
