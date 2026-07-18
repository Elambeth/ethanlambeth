"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// Routes that render without the site header (e.g. immersive party screens).
const HIDE_HEADER_ROUTES = ["/utopia"];

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (HIDE_HEADER_ROUTES.includes(pathname)) return null;

  return (
    <nav className="max-w-2xl mx-auto px-6 py-6 flex justify-between items-center">
      <div className="flex gap-4">
        <Link href="/" className="hover:underline">
          Home
        </Link>
        <Link href="/thoughts" className="hover:underline">
          Thoughts
        </Link>
      </div>

      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="text-sm hover:underline"
      >
        {mounted && theme === "dark" ? "Light" : "Dark"}
      </button>
    </nav>
  );
}